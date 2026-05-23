// src/hooks/useGameActions.js
import { useCallback, useState, useEffect } from 'react';
import { ref, update } from 'firebase/database';
import { database } from '../firebase';
import {
  selectNextMovie,
  generateAnswerOptions,
  checkAnswer,
  validateConnection,
  getConnectionHint,
  checkWinCondition,
  getSuccessMessage
} from '../utils/gameLogic';

const otherTeam = (team) => (team === 'A' ? 'B' : 'A');

export const getStealingTeam = (attempts) => {
  if (!attempts?.length) return null;
  if (!attempts.includes('A')) return 'A';
  if (!attempts.includes('B')) return 'B';
  return null;
};

export const isTrailerReadyForAnswer = (gameState, answeringTeam, isQAMode) => {
  const trailerFor = gameState?.currentMovie?.trailerWatchedForTurn;
  const attempts = gameState?.currentMovieAttempts || [];
  if (trailerFor === answeringTeam) return true;
  // QA steal: same trailer already played (often cleared to null after bot's attempt)
  if (isQAMode && answeringTeam === 'A' && attempts.includes('B')) return true;
  if (isQAMode && answeringTeam === 'B' && attempts.includes('A')) return true;
  return false;
};

export const isBotTurnForQA = (gameState) => {
  const attempts = gameState?.currentMovieAttempts || [];
  const stealingTeam = getStealingTeam(attempts);
  if (stealingTeam === 'B') return true;
  if (stealingTeam === 'A') return false;
  return gameState?.currentTurn === 'B';
};

export const useGameActions = (
  roomCode,
  gameState,
  allMovies,
  language,
  currentTeam,
  currentMovie,
  setCurrentMovie,
  setAnswerOptions,
  setRemovedAnswers,
  setPhase
) => {
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [isCorrect, setIsCorrect] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);

  // Reset local answer UI when a new trailer/round starts (syncs all clients in multiplayer)
  useEffect(() => {
    if (!currentMovie?.id) return;
    setSelectedAnswer(null);
    setShowResult(false);
    setResultMessage('');
    setIsCorrect(false);
  }, [currentMovie?.id]);

  // Reset local answer UI when round clears in Firebase (e.g. both teams failed on other client)
  useEffect(() => {
    const attempts = gameState?.currentMovieAttempts || [];
    if (attempts.length === 0 && !gameState?.currentMovie?.id) {
      setSelectedAnswer(null);
      setShowResult(false);
      setResultMessage('');
      setIsCorrect(false);
    }
  }, [gameState?.currentMovieAttempts, gameState?.currentMovie?.id]);

  // Reset answer UI when steal turn switches (same movie, new guessing team)
  useEffect(() => {
    const attempts = gameState?.currentMovieAttempts || [];
    if (!currentMovie?.id || attempts.length === 0) return;
    setSelectedAnswer(null);
    setShowResult(false);
    setResultMessage('');
    setIsCorrect(false);
  }, [gameState?.currentTurn, currentMovie?.id, gameState?.currentMovieAttempts]);

  // Start next round (turnOverride avoids stale currentTurn after Firebase updates)
  const startNextRound = useCallback(async (turnOverride) => {
    if (!gameState || !allMovies.length) return;

    const activeTurn = turnOverride ?? gameState.currentTurn;
    console.log('🎬 Starting next round...', { activeTurn });

    try {
      const teamACards = gameState.teamA?.cards || [];
      const teamBCards = gameState.teamB?.cards || [];
      const usedIds = gameState.usedMovieIds || [];

      // Select next movie
      const nextMovie = selectNextMovie(
        allMovies,
        usedIds,
        teamACards,
        teamBCards,
        activeTurn
      );

      if (!nextMovie) {
        console.log('❌ No more movies available - game over');
        await update(ref(database, `games/${roomCode}`), {
          phase: 'finished',
          winner: 'draw'
        });
        return;
      }

      console.log('✅ Selected movie:', nextMovie.title.en);

      // Generate answer options
      const options = generateAnswerOptions(nextMovie, allMovies, language);

      // Update Firebase ONLY - let useGameState handle local state
      await update(ref(database, `games/${roomCode}`), {
        currentMovie: {
          id: nextMovie.id,
          options,
          removedAnswers: [],
          trailerWatchedForTurn: null
        },
        currentMovieAttempts: [],
        roundNumber: (gameState.roundNumber || 0) + 1,
        currentTurn: activeTurn,
        phase: 'playing'
      });

      // Reset local state
      setSelectedAnswer(null);
      setShowResult(false);
      setRemovedAnswers([]);

    } catch (err) {
      console.error('❌ Error starting next round:', err);
    }
  }, [gameState, allMovies, roomCode, language, setRemovedAnswers]);

  // Handle connection attempt
  const handleConnectionAttempt = useCallback(async (targetCard, connectionType) => {
    if (!currentMovie) return;

    console.log('🔗 Attempting connection:', { targetCard: targetCard.title.en, connectionType });

    // 🔥 FIX: Use wonCard.team instead of currentTeam
    const winningTeam = gameState.wonCard?.team || currentTeam;
    const teamKey = winningTeam === 'A' ? 'teamA' : 'teamB';

    console.log('🔥 Connection for team:', winningTeam, 'teamKey:', teamKey);

    const validation = validateConnection(currentMovie, targetCard, connectionType);

    if (validation.valid) {
      // Successful connection
      const currentCards = gameState[teamKey]?.cards || [];
      const newCards = [...currentCards, currentMovie];
      const newScore = newCards.length;

      // Use one token
      const newTokens = Math.max(0, (gameState[teamKey]?.tokens || 0) - 1);

      // Check win condition
      const hasWon = checkWinCondition(newCards);

      // 🔥 FIXED: After DecisionPhase, switch turn to the OTHER team
      const nextTurn = otherTeam(winningTeam);

      const updates = {
        [`${teamKey}/cards`]: newCards,
        [`${teamKey}/score`]: newScore,
        [`${teamKey}/tokens`]: newTokens,
        usedMovieIds: [...(gameState.usedMovieIds || []), currentMovie.id],
        currentMovie: null,
        currentMovieAttempts: [],
        wonCard: null,
        currentTurn: nextTurn
      };

      if (hasWon) {
        updates.phase = 'finished';
        updates.winner = winningTeam;
      } else {
        updates.phase = 'playing';
      }

      await update(ref(database, `games/${roomCode}`), updates);

      const successMsg = getSuccessMessage(connectionType, validation.connection, language);
      setConnectionResult({ success: true, message: successMsg });

      if (!hasWon) {
        setTimeout(() => {
          setConnectionResult(null);
          startNextRound(nextTurn);
        }, 3000);
      }

    } else {
      // Failed connection - show hint
      const hintData = getConnectionHint(currentMovie, targetCard, language);
      
      // 🔥 FIXED: After failed connection, switch turn to the OTHER team
      const nextTurn = otherTeam(winningTeam);
      
      await update(ref(database, `games/${roomCode}`), {
        phase: 'playing',
        wonCard: null,
        currentMovie: null,
        currentMovieAttempts: [],
        currentTurn: nextTurn
      });

      setConnectionResult({ 
        success: false, 
        message: language === 'he' ? 'לא נכון' : 'Incorrect',
        hint: hintData.message,
        attemptedType: connectionType
      });

      setTimeout(() => {
        setConnectionResult(null);
        startNextRound(nextTurn);
      }, 3000);
    }
  }, [currentMovie, currentTeam, gameState, roomCode, language, startNextRound]);

  // Handle save token — bank the token (+ add card); connect spends a token instead
  const handleSaveToken = useCallback(async () => {
    console.log('💾 Saving token...');

    const winningTeam = gameState.wonCard?.team || currentTeam;
    const teamKey = winningTeam === 'A' ? 'teamA' : 'teamB';

    console.log('🔥 Saving token for team:', winningTeam, 'teamKey:', teamKey);

    const currentCards = gameState[teamKey]?.cards || [];
    const newCards = [...currentCards, currentMovie];
    const newScore = newCards.length;
    const hasWon = checkWinCondition(newCards);

    // 🔥 FIXED: After saving token, switch turn to the OTHER team
    const nextTurn = otherTeam(winningTeam);

    // Do not write tokens here — stale local state can overwrite the +1 from correct guess
    const updates = {
      [`${teamKey}/cards`]: newCards,
      [`${teamKey}/score`]: newScore,
      usedMovieIds: [...(gameState.usedMovieIds || []), currentMovie.id],
      phase: hasWon ? 'finished' : 'playing',
      wonCard: null,
      currentMovie: null,
      currentMovieAttempts: [],
      currentTurn: nextTurn
    };

    if (hasWon) {
      updates.winner = winningTeam;
    }

    await update(ref(database, `games/${roomCode}`), updates);

    if (!hasWon) {
      startNextRound(nextTurn);
    }
  }, [roomCode, currentTeam, gameState, currentMovie, startNextRound]);

  // Mark trailer watched for the active guessing team (syncs all clients)
  const markTrailerWatched = useCallback(async () => {
    if (!gameState?.currentMovie?.id || !gameState?.currentTurn) return;
    if (gameState.currentMovie.trailerWatchedForTurn === gameState.currentTurn) return;

    await update(ref(database, `games/${roomCode}`), {
      'currentMovie/trailerWatchedForTurn': gameState.currentTurn
    });
  }, [gameState?.currentMovie, gameState?.currentTurn, roomCode]);

  // Handle anchor reveal continue
  const handleAnchorContinue = useCallback(async () => {
    console.log('▶️ Continuing from anchor reveal...');
    setPhase('playing');
    startNextRound();
  }, [startNextRound, setPhase]);

  // Handle answer selection (answeringTeamOverride: bot/QA uses 'B' when Firebase turn lags)
  const handleAnswerSelect = useCallback(async (answer, isMyTurn, botIsThinking, answeringTeamOverride) => {
    const isQAMode = roomCode === '99999';
    const attempts = gameState?.currentMovieAttempts || [];
    let answeringTeam = answeringTeamOverride ?? gameState.currentTurn;
    if (!answeringTeamOverride) {
      const stealingTeam = getStealingTeam(attempts);
      if (stealingTeam) answeringTeam = stealingTeam;
    }

    const trailerReady = isTrailerReadyForAnswer(gameState, answeringTeam, isQAMode);

    if (!currentMovie || !trailerReady) {
      console.warn('⚠️ Answer blocked: missing movie or trailer not watched', {
        hasMovie: !!currentMovie,
        trailerWatchedForTurn: gameState?.currentMovie?.trailerWatchedForTurn,
        answeringTeam
      });
      return;
    }
    if (!isMyTurn && !answeringTeamOverride) {
      console.warn('⚠️ Answer blocked: not your turn', { currentTurn: gameState?.currentTurn });
      return;
    }
    if (selectedAnswer && !answeringTeamOverride) {
      console.warn('⚠️ Answer blocked: already selected');
      return;
    }

    console.log('✅ Answer selected:', answer);
    setSelectedAnswer(answer);

    const correct = checkAnswer(answer, currentMovie, language);
    setIsCorrect(correct);

    if (correct) {
      const teamKey = answeringTeam === 'A' ? 'teamA' : 'teamB';

      const newTokens = (gameState[teamKey]?.tokens || 0) + 1;

      console.log(`🎫 Awarding token to Team ${answeringTeam}: ${newTokens}`);

      // 🔥 IMPORTANT: Don't change currentTurn here! 
      // The turn stays the same until after DecisionPhase
      await update(ref(database, `games/${roomCode}`), {
        [`${teamKey}/tokens`]: newTokens,
        phase: 'decision',
        wonCard: {
          movieId: currentMovie.id,
          team: answeringTeam
        }
        // currentTurn stays the same!
      });

      setResultMessage(language === 'he' ? 'נכון! +1 אסימון' : 'Correct! +1 Token');
      setShowResult(true);
      setPhase('decision');

    } else {
      // Wrong answer - remove it and give other team a chance
      const newRemovedAnswers = [...(gameState.currentMovie?.removedAnswers || []), answer];

      const priorAttempts = gameState.currentMovieAttempts || [];
      const newAttempts = [...priorAttempts, answeringTeam];

      // 🔥 CRITICAL: Find who is the ORIGINAL turn holder (first attempt)
      const originalTurnHolder = priorAttempts.length > 0 ? priorAttempts[0] : answeringTeam;

      if (newAttempts.length >= 2) {
        // Both teams failed - card returns to pool
        // 🔥 FIXED: Switch turn to the OTHER team (not the one who had the original turn)
        const nextTurn = otherTeam(originalTurnHolder);
        
        setResultMessage(language === 'he' ? 'שתי הקבוצות לא זיהו - הכרטיס יחזור!' : 'Both teams failed - card will return!');
        setShowResult(true);

        setTimeout(async () => {
          await update(ref(database, `games/${roomCode}`), {
            currentMovie: null,
            currentMovieAttempts: [],
            currentTurn: nextTurn
          });
          startNextRound(nextTurn);
        }, 2000);

      } else {
        // First team failed - give other team a chance to steal
        // 🔥 CRITICAL: currentTurn stays the SAME (the original turn holder)
        // We DON'T change currentTurn here!
        
        const stealUpdates = {
          [`currentMovie/removedAnswers`]: newRemovedAnswers,
          currentMovieAttempts: newAttempts
        };
        // Multiplayer: other team must watch trailer. QA: human already saw bot's trailer.
        if (!isQAMode) {
          stealUpdates['currentMovie/trailerWatchedForTurn'] = null;
        }

        await update(ref(database, `games/${roomCode}`), stealUpdates);

        setResultMessage(language === 'he' ? 'לא נכון - תור הקבוצה השנייה' : 'Incorrect - other team\'s turn');
        setShowResult(true);
        setRemovedAnswers(newRemovedAnswers);
        // QA: clear selection so bot can answer on steal turn
        if (isQAMode) {
          setSelectedAnswer(null);
        }
      }
    }
  }, [selectedAnswer, currentMovie, gameState, roomCode, language, setPhase, setRemovedAnswers, startNextRound]);

  return {
    startNextRound,
    handleConnectionAttempt,
    handleSaveToken,
    handleAnchorContinue,
    markTrailerWatched,
    handleAnswerSelect,
    selectedAnswer,
    showResult,
    resultMessage,
    isCorrect,
    connectionResult,
    setSelectedAnswer,
    setIsCorrect,
    setResultMessage,
    setShowResult
  };
};