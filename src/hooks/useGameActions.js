// src/hooks/useGameActions.js
import { useCallback, useState } from 'react';
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
  setPhase,
  setTrailerEnded
) => {
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [isCorrect, setIsCorrect] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);

  // Start next round
  const startNextRound = useCallback(async () => {
    if (!gameState || !allMovies.length) return;

    console.log('🎬 Starting next round...');

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
        gameState.currentTurn
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
          removedAnswers: []
        },
        roundNumber: (gameState.roundNumber || 0) + 1,
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

      const updates = {
        [`${teamKey}/cards`]: newCards,
        [`${teamKey}/score`]: newScore,
        [`${teamKey}/tokens`]: newTokens,
        usedMovieIds: [...(gameState.usedMovieIds || []), currentMovie.id],
        currentMovie: null,
        currentMovieAttempts: [],
        wonCard: null,
        currentTurn: gameState.currentTurn === 'A' ? 'B' : 'A'
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
          startNextRound();
        }, 3000);
      }

    } else {
      // Failed connection - show hint
      const hintData = getConnectionHint(currentMovie, targetCard, language);
      
      await update(ref(database, `games/${roomCode}`), {
        phase: 'playing',
        wonCard: null,
        currentMovie: null,
        currentMovieAttempts: [],
        currentTurn: gameState.currentTurn === 'A' ? 'B' : 'A'
      });

      setConnectionResult({ 
        success: false, 
        message: language === 'he' ? 'לא נכון' : 'Incorrect',
        hint: hintData.message,
        attemptedType: connectionType
      });

      setTimeout(() => {
        setConnectionResult(null);
        startNextRound();
      }, 3000);
    }
  }, [currentMovie, currentTeam, gameState, roomCode, language, startNextRound]);

  // Handle save token
  const handleSaveToken = useCallback(async () => {
    console.log('💾 Saving token...');

    // 🔥 FIX: Use wonCard.team instead of currentTeam
    const winningTeam = gameState.wonCard?.team || currentTeam;
    const teamKey = winningTeam === 'A' ? 'teamA' : 'teamB';

    console.log('🔥 Saving token for team:', winningTeam, 'teamKey:', teamKey);

    const currentCards = gameState[teamKey]?.cards || [];
    const newCards = [...currentCards, currentMovie];
    const newScore = newCards.length;

    // Check win condition
    const hasWon = checkWinCondition(newCards);

    const updates = {
      [`${teamKey}/cards`]: newCards,
      [`${teamKey}/score`]: newScore,
      usedMovieIds: [...(gameState.usedMovieIds || []), currentMovie.id],
      phase: hasWon ? 'finished' : 'playing',
      wonCard: null,
      currentMovie: null,
      currentMovieAttempts: [],
      currentTurn: gameState.currentTurn === 'A' ? 'B' : 'A'
    };

    if (hasWon) {
      updates.winner = winningTeam;
    }

    await update(ref(database, `games/${roomCode}`), updates);

    if (!hasWon) {
      startNextRound();
    }
  }, [roomCode, currentTeam, gameState, currentMovie, startNextRound]);

  // Handle anchor reveal continue
  const handleAnchorContinue = useCallback(async () => {
    console.log('▶️ Continuing from anchor reveal...');
    setPhase('playing');
    startNextRound();
  }, [startNextRound, setPhase]);

  // Handle answer selection
  const handleAnswerSelect = useCallback(async (answer, isMyTurn, trailerEnded, botIsThinking) => {
    if (!isMyTurn || selectedAnswer || !currentMovie || !trailerEnded) return;

    console.log('✅ Answer selected:', answer);
    setSelectedAnswer(answer);

    const correct = checkAnswer(answer, currentMovie, language);
    setIsCorrect(correct);

    if (correct) {
      // 🔥 FIX: Use gameState.currentTurn (who's turn it is) instead of currentTeam (the UI player)
      const answeringTeam = gameState.currentTurn;
      const teamKey = answeringTeam === 'A' ? 'teamA' : 'teamB';
      const newTokens = (gameState[teamKey]?.tokens || 0) + 1;

      console.log(`🎫 Awarding token to Team ${answeringTeam}: ${newTokens}`);

      await update(ref(database, `games/${roomCode}`), {
        [`${teamKey}/tokens`]: newTokens,
        phase: 'decision',
        wonCard: {
          movieId: currentMovie.id,
          team: answeringTeam
        }
      });

      setResultMessage(language === 'he' ? 'נכון! +1 אסימון' : 'Correct! +1 Token');
      setShowResult(true);
      setPhase('decision');

    } else {
      // Wrong answer - remove it and switch turn
      const newRemovedAnswers = [...(gameState.currentMovie?.removedAnswers || []), answer];

      // 🔥 FIX: Use gameState.currentTurn instead of currentTeam
      const answeringTeam = gameState.currentTurn;
      const attempts = gameState.currentMovieAttempts || [];
      const newAttempts = [...attempts, answeringTeam];

      if (newAttempts.length >= 2) {
        // Both teams failed - card returns to pool
        setResultMessage(language === 'he' ? 'שתי הקבוצות לא זיהו - הכרטיס יחזור!' : 'Both teams failed - card will return!');
        setShowResult(true);

        setTimeout(async () => {
          await update(ref(database, `games/${roomCode}`), {
            currentMovie: null,
            currentMovieAttempts: [],
            currentTurn: gameState.currentTurn === 'A' ? 'B' : 'A'
          });
          startNextRound();
        }, 2000);

      } else {
        // Switch turn to other team
        const nextTurn = answeringTeam === 'A' ? 'B' : 'A';
        
        await update(ref(database, `games/${roomCode}`), {
          [`currentMovie/removedAnswers`]: newRemovedAnswers,
          currentMovieAttempts: newAttempts,
          currentTurn: nextTurn
        });

        setResultMessage(language === 'he' ? 'לא נכון - תור הקבוצה השנייה' : 'Incorrect - other team\'s turn');
        setShowResult(true);
        setRemovedAnswers(newRemovedAnswers);
      }
    }
  }, [selectedAnswer, currentMovie, currentTeam, gameState, roomCode, language, setPhase, setRemovedAnswers, startNextRound]);

  return {
    startNextRound,
    handleConnectionAttempt,
    handleSaveToken,
    handleAnchorContinue,
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