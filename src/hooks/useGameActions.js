// src/hooks/useGameActions.js
import { useCallback, useState, useEffect, useRef } from 'react';
import { ref, update } from 'firebase/database';
import { database } from '../firebase';
import {
  selectNextMovie,
  generateAnswerOptions,
  checkAnswer,
  validateConnection,
  getConnectionHint,
  checkWinCondition,
  getSuccessMessage,
  findConnection,
  preloadTrailer,
  RACE_OPTIONS_COUNT,
  DEFAULT_OPTIONS_COUNT
} from '../utils/gameLogic';

const otherTeam = (team) => (team === 'A' ? 'B' : 'A');
const NEXT_ROUND_COMMIT_DELAY_MS = 350;
const FAILED_ROUND_DELAY_MS = 1000;

/** Firebase may return arrays as objects — normalize for .includes() */
export const normalizeAttempts = (attempts) => {
  if (!attempts) return [];
  if (Array.isArray(attempts)) return attempts;
  return Object.values(attempts);
};

export const getStealingTeam = (attempts) => {
  const list = normalizeAttempts(attempts);
  if (!list.length) return null;
  if (!list.includes('A')) return 'A';
  if (!list.includes('B')) return 'B';
  return null;
};

export const isTrailerReadyForAnswer = (
  gameState,
  answeringTeam,
  isQAMode,
  localTrailerWatched = false
) => {
  const trailerFor = gameState?.currentMovie?.trailerWatchedForTurn;
  const attempts = gameState?.currentMovieAttempts || [];
  const currentTurn = gameState?.currentTurn;
  const isRaceMode = Boolean(gameState?.isRaceMode);

  // Race-the-Clock: answers are open the entire round, side-by-side with the
  // trailer. There's no "watch first, then answer" gate — the whole point is
  // to identify the movie as fast as possible while the trailer is playing.
  if (isRaceMode) return true;

  if (trailerFor === answeringTeam) return true;
  if (isQAMode && localTrailerWatched && currentTurn === answeringTeam) return true;
  // QA steal: same trailer already played (often cleared to null after bot's attempt)
  if (isQAMode && answeringTeam === 'A' && attempts.includes('B')) return true;
  if (isQAMode && answeringTeam === 'B' && attempts.includes('A')) return true;
  // Multiplayer steal: trailer already played — other team answers without re-watch
  if (!isQAMode && trailerFor && getStealingTeam(attempts) === answeringTeam) {
    return true;
  }
  // Multiplayer: trailer ended locally before Firebase sync (active team's client)
  if (!isQAMode && localTrailerWatched && currentTurn === answeringTeam) {
    return true;
  }
  return false;
};

export const isBotTurnForQA = (gameState) => {
  const attempts = normalizeAttempts(gameState?.currentMovieAttempts);
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
  setPhase,
  localTrailerWatched = false
) => {
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [isCorrect, setIsCorrect] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);
  const lastAnswerSessionRef = useRef(null);
  const gameStateRef = useRef(gameState);
  const startingNextRoundRef = useRef(false);
  const nextRoundTimerRef = useRef(null);

  gameStateRef.current = gameState;

  // Fresh answer UI per (movie + turn + round) — avoids needing hard refresh when state sticks
  useEffect(() => {
    if (gameState?.phase !== 'playing' || !currentMovie?.id) return;
    const sessionKey = `${currentMovie.id}:${gameState.currentTurn}:${gameState.roundNumber ?? 0}`;
    if (lastAnswerSessionRef.current === sessionKey) return;
    lastAnswerSessionRef.current = sessionKey;
    setSelectedAnswer(null);
    setShowResult(false);
    setResultMessage('');
    setIsCorrect(false);
  }, [
    currentMovie?.id,
    gameState?.currentTurn,
    gameState?.roundNumber,
    gameState?.phase
  ]);

  // Reset local answer UI when a new trailer/round starts (syncs all clients in multiplayer)
  useEffect(() => {
    if (!currentMovie?.id) return;
    setSelectedAnswer(null);
    setShowResult(false);
    setResultMessage('');
    setIsCorrect(false);
  }, [currentMovie?.id]);

  // Reset answer UI when round number advances (covers clients that skip movie-id updates)
  useEffect(() => {
    if (gameState?.roundNumber == null || gameState.roundNumber < 1) return;
    setSelectedAnswer(null);
    setShowResult(false);
    setResultMessage('');
    setIsCorrect(false);
  }, [gameState?.roundNumber]);

  // Reset local answer UI when round clears in Firebase (e.g. both teams failed on other client)
  useEffect(() => {
    const attempts = normalizeAttempts(gameState?.currentMovieAttempts);
    if (attempts.length === 0 && !gameState?.currentMovie?.id) {
      setSelectedAnswer(null);
      setShowResult(false);
      setResultMessage('');
      setIsCorrect(false);
    }
  }, [gameState?.currentMovieAttempts, gameState?.currentMovie?.id]);

  // Reset answer UI when steal turn switches (same movie, new guessing team)
  useEffect(() => {
    const attempts = normalizeAttempts(gameState?.currentMovieAttempts);
    if (!currentMovie?.id || attempts.length === 0) return;
    setSelectedAnswer(null);
    setShowResult(false);
    setResultMessage('');
    setIsCorrect(false);
  }, [gameState?.currentTurn, currentMovie?.id, gameState?.currentMovieAttempts]);

  const warmTrailer = useCallback((movie) => {
    const target = typeof movie === 'string' ? { id: movie } : movie;
    if (!target?.id) return;

    preloadTrailer(target).catch((error) => {
      console.warn('⚠️ Trailer warmup failed:', target.id, error);
    });
  }, []);

  const buildNextRoundPayload = useCallback(
    (turnOverride, usedMovieIdsOverride) => {
      const gs = gameStateRef.current;
      if (!gs || !allMovies.length) return null;

      const activeTurn = turnOverride ?? gs.currentTurn;
      const usedIds = usedMovieIdsOverride ?? gs.usedMovieIds ?? [];
      const nextRoundNumber = (gs.roundNumber || 0) + 1;
      const teamACards = gs.teamA?.cards || [];
      const teamBCards = gs.teamB?.cards || [];

      const nextMovie = selectNextMovie(
        allMovies,
        usedIds,
        teamACards,
        teamBCards,
        activeTurn
      );

      if (!nextMovie) {
        return {
          activeTurn,
          nextRoundNumber,
          nextMovie: null,
          updates: {
            phase: 'finished',
            winner: 'draw',
          },
        };
      }

      const isRaceMode = Boolean(gs?.isRaceMode);
      const optionsCount = isRaceMode ? RACE_OPTIONS_COUNT : DEFAULT_OPTIONS_COUNT;

      return {
        activeTurn,
        nextRoundNumber,
        nextMovie,
        updates: {
          currentMovie: {
            id: nextMovie.id,
            options: generateAnswerOptions(nextMovie, allMovies, language, optionsCount),
            removedAnswers: [],
            trailerWatchedForTurn: null,
          },
          currentMovieAttempts: [],
          roundNumber: nextRoundNumber,
          currentTurn: activeTurn,
          phase: 'playing',
        },
      };
    },
    [allMovies, language]
  );

  // Start next round. Pass usedMovieIdsOverride after connect/save/buy so we
  // never pick from a stale usedMovieIds snapshot (same trailer twice).
  const startNextRound = useCallback(
    async (turnOverride, { usedMovieIdsOverride, preparedRound } = {}) => {
      const gs = gameStateRef.current;
      if (!gs || !allMovies.length) return;

      if (startingNextRoundRef.current) {
        console.warn('🎬 startNextRound already running — skipping duplicate');
        return;
      }
      startingNextRoundRef.current = true;

      const activeTurn = turnOverride ?? gs.currentTurn;
      const nextRoundNumber = (gs.roundNumber || 0) + 1;

      console.log('🎬 Starting next round...', {
        activeTurn,
        roundNumber: nextRoundNumber,
      });

      try {
        const nextRoundPayload =
          preparedRound || buildNextRoundPayload(turnOverride, usedMovieIdsOverride);

        if (!nextRoundPayload?.nextMovie) {
          console.log('❌ No more movies available - game over');
          await update(ref(database, `games/${roomCode}`), nextRoundPayload?.updates || {
            phase: 'finished',
            winner: 'draw',
          });
          return;
        }

        console.log('✅ Selected movie:', nextRoundPayload.nextMovie.title.en, `(id: ${nextRoundPayload.nextMovie.id})`);
        warmTrailer(nextRoundPayload.nextMovie);

        await update(ref(database, `games/${roomCode}`), nextRoundPayload.updates);

        setSelectedAnswer(null);
        setShowResult(false);
        setRemovedAnswers([]);
      } catch (err) {
        console.error('❌ Error starting next round:', err);
      } finally {
        startingNextRoundRef.current = false;
      }
    },
    [allMovies, roomCode, buildNextRoundPayload, warmTrailer, setRemovedAnswers]
  );

  const scheduleNextRound = useCallback(
    (turnOverride, usedMovieIdsOverride) => {
      const preparedRound = buildNextRoundPayload(turnOverride, usedMovieIdsOverride);
      if (preparedRound?.nextMovie?.id) {
        warmTrailer(preparedRound.nextMovie);
      }

      if (nextRoundTimerRef.current) {
        clearTimeout(nextRoundTimerRef.current);
      }
      nextRoundTimerRef.current = setTimeout(() => {
        nextRoundTimerRef.current = null;
        setConnectionResult(null);
        startNextRound(turnOverride, { usedMovieIdsOverride, preparedRound });
      }, NEXT_ROUND_COMMIT_DELAY_MS);
    },
    [buildNextRoundPayload, startNextRound, warmTrailer]
  );

  // Handle connection attempt
  const handleConnectionAttempt = useCallback(async (targetCard, connectionType) => {
    if (!currentMovie) return;

    console.log('🔗 Attempting connection:', { targetCard: targetCard.title.en, connectionType });

    const isRaceMode = Boolean(gameState?.isRaceMode);

    // 🔥 FIX: Use wonCard.team instead of currentTeam
    const winningTeam = gameState.wonCard?.team || currentTeam;
    const teamKey = winningTeam === 'A' ? 'teamA' : 'teamB';

    console.log('🔥 Connection for team:', winningTeam, 'teamKey:', teamKey);

    const validation = validateConnection(currentMovie, targetCard, connectionType);

    // Race mode: no turn rotation — alternate movie-selection bias based on winner.
    // Regular mode: next turn always belongs to the team OPPOSITE the original turn holder.
    const priorAttempts = normalizeAttempts(gameState.currentMovieAttempts);
    const originalTurnHolder = priorAttempts[0] ?? winningTeam;
    const nextTurn = isRaceMode
      ? otherTeam(winningTeam)
      : otherTeam(originalTurnHolder);
    const newUsedIds = [...(gameState.usedMovieIds || []), currentMovie.id];

    if (validation.valid) {
      // Successful connection — add movie to the chain. NO token change.
      const currentCards = gameState[teamKey]?.cards || [];
      const newCards = [...currentCards, currentMovie];
      const newScore = newCards.length;

      const hasWon = checkWinCondition(newCards);

      const updates = {
        [`${teamKey}/cards`]: newCards,
        [`${teamKey}/score`]: newScore,
        usedMovieIds: newUsedIds,
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

      // Extract the human-readable value for the Oscar quip:
      //   - actor/director → localized name
      //   - year           → the year as a string
      const connValue = validation.connection?.value;
      const valueText =
        typeof connValue === 'object'
          ? connValue?.[language] || connValue?.en || ''
          : connValue != null
            ? String(connValue)
            : '';

      setConnectionResult({
        success: true,
        message: successMsg,
        type: connectionType,
        value: valueText,
        targetCardTitle:
          (targetCard?.title?.[language] || targetCard?.title?.en) || '',
      });

      if (!hasWon) {
        scheduleNextRound(nextTurn, newUsedIds);
      }

    } else {
      // Failed connection - show hint
      const hintData = getConnectionHint(currentMovie, targetCard, language);

      // Try to find an *actually existing* connection between the picked
      // card and the won card so the Oscar quip can roast the player with
      // the right name/year.
      const possibleConnections = findConnection(currentMovie, targetCard) || [];
      const suggested = possibleConnections[0];
      const suggestedValue = suggested?.value;
      const suggestedValueText =
        typeof suggestedValue === 'object'
          ? suggestedValue?.[language] || suggestedValue?.en || ''
          : suggestedValue != null
            ? String(suggestedValue)
            : '';

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
        attemptedType: connectionType,
        suggestedType: suggested?.type || null,
        value: suggestedValueText,
      });

      // Failed connection — movie returns to the pool; don't mark it used.
      scheduleNextRound(nextTurn);
    }
  }, [currentMovie, currentTeam, gameState, roomCode, language, scheduleNextRound]);

  // Save Token — gain +1 extra token, DROP the won card (returns to pool).
  const handleSaveToken = useCallback(async () => {
    console.log('💾 Saving token...');

    const isRaceMode = Boolean(gameState?.isRaceMode);

    const winningTeam = gameState.wonCard?.team || currentTeam;
    const teamKey = winningTeam === 'A' ? 'teamA' : 'teamB';

    console.log('🔥 Saving token for team:', winningTeam, 'teamKey:', teamKey);

    // Race mode: alternate movie-selection bias by winner.
    // Regular mode: next turn = opposite of the team that originally had the turn.
    const priorAttempts = normalizeAttempts(gameState.currentMovieAttempts);
    const originalTurnHolder = priorAttempts[0] ?? winningTeam;
    const nextTurn = isRaceMode
      ? otherTeam(winningTeam)
      : otherTeam(originalTurnHolder);

    const newTokens = (gameState[teamKey]?.tokens || 0) + 1;
    const newUsedIds = [...(gameState.usedMovieIds || []), currentMovie.id];

    await update(ref(database, `games/${roomCode}`), {
      [`${teamKey}/tokens`]: newTokens,
      usedMovieIds: newUsedIds,
      phase: 'playing',
      wonCard: null,
      currentMovie: null,
      currentMovieAttempts: [],
      currentTurn: nextTurn
    });

    scheduleNextRound(nextTurn, newUsedIds);
  }, [roomCode, currentTeam, gameState, currentMovie, scheduleNextRound]);

  // Buy Connection — spend 3 tokens to add the won card directly to the chain.
  const handleBuyConnection = useCallback(async () => {
    console.log('💰 Buying connection (3 tokens)...');

    const isRaceMode = Boolean(gameState?.isRaceMode);

    const winningTeam = gameState.wonCard?.team || currentTeam;
    const teamKey = winningTeam === 'A' ? 'teamA' : 'teamB';

    const currentTokens = gameState[teamKey]?.tokens || 0;
    if (currentTokens < 3) {
      console.warn('⚠️ Buy blocked: not enough tokens', { currentTokens });
      return;
    }

    const currentCards = gameState[teamKey]?.cards || [];
    const newCards = [...currentCards, currentMovie];
    const newScore = newCards.length;
    const hasWon = checkWinCondition(newCards);

    const priorAttempts = normalizeAttempts(gameState.currentMovieAttempts);
    const originalTurnHolder = priorAttempts[0] ?? winningTeam;
    const nextTurn = isRaceMode
      ? otherTeam(winningTeam)
      : otherTeam(originalTurnHolder);
    const newUsedIds = [...(gameState.usedMovieIds || []), currentMovie.id];

    const updates = {
      [`${teamKey}/cards`]: newCards,
      [`${teamKey}/score`]: newScore,
      [`${teamKey}/tokens`]: currentTokens - 3,
      usedMovieIds: newUsedIds,
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

    setConnectionResult({
      success: true,
      message: language === 'he' ? '💰 קנית את הקלף תמורת 3 אסימונים!' : '💰 Card purchased for 3 tokens!'
    });

    if (!hasWon) {
      if (nextRoundTimerRef.current) clearTimeout(nextRoundTimerRef.current);
        const preparedRound = buildNextRoundPayload(nextTurn, newUsedIds);
        if (preparedRound?.nextMovie?.id) {
          warmTrailer(preparedRound.nextMovie);
        }
      nextRoundTimerRef.current = setTimeout(() => {
        nextRoundTimerRef.current = null;
        setConnectionResult(null);
          startNextRound(nextTurn, {
            usedMovieIdsOverride: newUsedIds,
            preparedRound,
          });
        }, NEXT_ROUND_COMMIT_DELAY_MS);
    }
  }, [roomCode, currentTeam, gameState, currentMovie, language, startNextRound, buildNextRoundPayload, warmTrailer]);

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
    if (gameState?.pendingFirstRound?.movieId) {
      await update(ref(database, `games/${roomCode}`), {
        currentMovie: {
          id: gameState.pendingFirstRound.movieId,
          options: gameState.pendingFirstRound.options || [],
          removedAnswers: [],
          trailerWatchedForTurn: null,
        },
        currentMovieAttempts: [],
        currentTurn: gameState.pendingFirstRound.currentTurn || 'A',
        roundNumber: 1,
        phase: 'playing',
        pendingFirstRound: null,
      });
      return;
    }

    startNextRound();
  }, [gameState?.pendingFirstRound, roomCode, startNextRound, setPhase]);

  // Handle answer selection (answeringTeamOverride: bot/QA uses 'B' when Firebase turn lags)
  const handleAnswerSelect = useCallback(async (answer, isMyTurn, botIsThinking, answeringTeamOverride) => {
    const gs = gameStateRef.current;
    const isBotMode = Boolean(gs?.isBotMode || gs?.isQAMode);
    const isRaceMode = Boolean(gs?.isRaceMode);
    const attempts = normalizeAttempts(gameState?.currentMovieAttempts);
    // Race mode: the answering team is the player's own team (no turn rotation).
    const answeringTeam = isRaceMode
      ? (answeringTeamOverride ?? currentTeam)
      : (answeringTeamOverride ?? getStealingTeam(attempts) ?? gameState.currentTurn);

    const trailerReady = isTrailerReadyForAnswer(
      gameState,
      answeringTeam,
      isBotMode,
      localTrailerWatched
    );

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

    } else if (isRaceMode) {
      // Race-the-Clock: a wrong guess by either team just eliminates that option
      // for both teams. No turn rotation — the round stays open until someone
      // gets it right, or the grid is exhausted (both teams failed).
      const newRemovedAnswers = [
        ...(gameState.currentMovie?.removedAnswers || []),
        answer,
      ];
      const optionsLeft = (gameState.currentMovie?.options || []).filter(
        (opt) => !newRemovedAnswers.includes(opt),
      ).length;

      await update(ref(database, `games/${roomCode}`), {
        [`currentMovie/removedAnswers`]: newRemovedAnswers,
      });

      setRemovedAnswers(newRemovedAnswers);

      if (optionsLeft <= 0) {
        // Every option exhausted → card returns to the pool.
        setResultMessage(
          language === 'he'
            ? 'שתי הקבוצות לא זיהו - הכרטיס יחזור!'
            : 'Both teams failed - card will return!',
        );
        setShowResult(true);

        setTimeout(async () => {
          await update(ref(database, `games/${roomCode}`), {
            currentMovie: null,
            currentMovieAttempts: [],
          });
          const preparedRound = buildNextRoundPayload();
          if (preparedRound?.nextMovie?.id) {
            warmTrailer(preparedRound.nextMovie);
          }
          startNextRound(undefined, { preparedRound });
        }, FAILED_ROUND_DELAY_MS);
      } else {
        // Same player can immediately try again; option is gone for both teams.
        setResultMessage(language === 'he' ? 'לא נכון' : 'Incorrect');
        setShowResult(true);
        setSelectedAnswer(null);
        setTimeout(() => {
          setShowResult(false);
          setResultMessage('');
        }, 800);
      }
    } else {
      // Wrong answer - remove it and give other team a chance
      const newRemovedAnswers = [...(gameState.currentMovie?.removedAnswers || []), answer];

      const priorAttempts = normalizeAttempts(gameState.currentMovieAttempts);
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
          const preparedRound = buildNextRoundPayload(nextTurn);
          if (preparedRound?.nextMovie?.id) {
            warmTrailer(preparedRound.nextMovie);
          }
          startNextRound(nextTurn, { preparedRound });
        }, FAILED_ROUND_DELAY_MS);

      } else {
        // First team failed - give other team a chance to steal
        // 🔥 CRITICAL: currentTurn stays the SAME (the original turn holder)
        // We DON'T change currentTurn here!
        
        // Keep trailerWatchedForTurn — everyone already saw the trailer; steal team picks from remaining options
        const stealTurn = otherTeam(answeringTeam);
        const stealUpdates = {
          [`currentMovie/removedAnswers`]: newRemovedAnswers,
          currentMovieAttempts: newAttempts
        };
        // Multiplayer: sync turn in Firebase so both clients enable the right team
        if (!isBotMode) {
          stealUpdates.currentTurn = stealTurn;
        }

        await update(ref(database, `games/${roomCode}`), stealUpdates);

        setResultMessage(language === 'he' ? 'לא נכון - תור הקבוצה השנייה' : 'Incorrect - other team\'s turn');
        setShowResult(true);
        setRemovedAnswers(newRemovedAnswers);
        // Clear selection so steal team (or bot) can answer; wrong team sees grid via Firebase sync
        setSelectedAnswer(null);
      }
    }
  }, [
    selectedAnswer,
    currentMovie,
    currentTeam,
    gameState,
    roomCode,
    language,
    localTrailerWatched,
    setPhase,
    setRemovedAnswers,
    startNextRound,
    buildNextRoundPayload,
    warmTrailer
  ]);

  return {
    startNextRound,
    handleConnectionAttempt,
    handleSaveToken,
    handleBuyConnection,
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