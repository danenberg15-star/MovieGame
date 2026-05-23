// src/hooks/useBotPlayer.js
import { useEffect, useMemo, useRef } from 'react';
import { getStealingTeam, isBotTurnForQA } from './useGameActions';

export const useBotPlayer = (
  gameState,
  currentMovie,
  isQAMode,
  phase,
  botIsThinking,
  setBotIsThinking,
  answerOptions,
  language,
  roomCode,
  allMovies,
  handleAnswerSelect,
  setSelectedAnswer,
  setIsCorrect,
  setResultMessage,
  setShowResult,
  setRemovedAnswers,
  startNextRound,
  handleConnectionAttempt,
  handleSaveToken,
  localTrailerWatched = false
) => {
  const answerTimeoutRef = useRef(null);
  const decisionTimeoutRef = useRef(null);
  const currentMovieIdRef = useRef(null);
  const botTurnStartedRef = useRef(false);
  const scheduledAnswerKeyRef = useRef(null);
  const executedAnswerKeyRef = useRef(null);
  const scheduledDecisionKeyRef = useRef(null);
  const executedDecisionKeyRef = useRef(null);
  const gameStateRef = useRef(gameState);
  const handleAnswerSelectRef = useRef(handleAnswerSelect);
  const answerOptionsRef = useRef(answerOptions);

  gameStateRef.current = gameState;
  handleAnswerSelectRef.current = handleAnswerSelect;
  answerOptionsRef.current = answerOptions;

  const attempts = useMemo(
    () => gameState?.currentMovieAttempts ?? [],
    [gameState?.currentMovieAttempts]
  );
  const botShouldAnswer = isQAMode
    ? isBotTurnForQA(gameState)
    : gameState?.currentTurn === 'B';
  const isBotStealTurn = isQAMode && getStealingTeam(attempts) === 'B';

  const trailerWatchedForTurn = gameState?.currentMovie?.trailerWatchedForTurn;
  const currentTurn = gameState?.currentTurn;

  const botAnswerKey = useMemo(() => {
    if (!isQAMode || !currentMovie?.id || !botShouldAnswer || phase !== 'playing') {
      return null;
    }
    if (attempts.includes('B')) return null;
    if (!answerOptions?.length) return null;

    const trailerReady =
      trailerWatchedForTurn === 'B' ||
      (localTrailerWatched && currentTurn === 'B' && !attempts.includes('B')) ||
      (isQAMode && attempts.includes('A') && !attempts.includes('B'));

    if (!trailerReady) return null;
    return `${currentMovie.id}:${attempts.join(',')}`;
  }, [
    isQAMode,
    currentMovie?.id,
    botShouldAnswer,
    phase,
    attempts,
    trailerWatchedForTurn,
    localTrailerWatched,
    currentTurn,
    answerOptions?.length
  ]);

  // Reset when movie changes
  useEffect(() => {
    if (currentMovie?.id && currentMovie.id !== currentMovieIdRef.current) {
      console.log('🎬 Movie changed - resetting bot state');
      currentMovieIdRef.current = currentMovie.id;
      scheduledAnswerKeyRef.current = null;
      executedAnswerKeyRef.current = null;
      scheduledDecisionKeyRef.current = null;
      executedDecisionKeyRef.current = null;
      botTurnStartedRef.current = false;

      if (answerTimeoutRef.current) {
        clearTimeout(answerTimeoutRef.current);
        answerTimeoutRef.current = null;
      }
      if (decisionTimeoutRef.current) {
        clearTimeout(decisionTimeoutRef.current);
        decisionTimeoutRef.current = null;
      }

      setBotIsThinking(false);
    }
  }, [currentMovie?.id, setBotIsThinking]);

  useEffect(() => {
    if (!botAnswerKey) {
      setBotIsThinking(false);
    }
  }, [botAnswerKey, setBotIsThinking]);

  // Track when it becomes bot's turn for the FIRST time for this movie (QA only)
  useEffect(() => {
    if (!isQAMode) return;
    if (botShouldAnswer && currentMovie?.id === currentMovieIdRef.current && phase === 'playing') {
      if (attempts.length === 0 && !botTurnStartedRef.current) {
        console.log('🤖 Bot\'s FIRST turn for this movie - ready to watch trailer');
        botTurnStartedRef.current = true;
      } else if (isBotStealTurn) {
        console.log('🤖 Bot steal turn — player missed, bot will guess');
      }
    }
  }, [isQAMode, botShouldAnswer, isBotStealTurn, currentMovie?.id, phase, attempts.length]);

  // Bot answering (Strict Mode safe — keyed by movie + attempts)
  useEffect(() => {
    if (!botAnswerKey || !currentMovie) {
      scheduledAnswerKeyRef.current = null;
      return;
    }

    if (scheduledAnswerKeyRef.current === botAnswerKey) {
      return;
    }

    scheduledAnswerKeyRef.current = botAnswerKey;

    if (isBotStealTurn) {
      console.log('🤖 Bot steal turn — player missed, bot will guess');
    } else {
      console.log('🤖 Bot preparing to answer...');
    }

    setBotIsThinking(true);

    const timeoutId = setTimeout(() => {
      if (executedAnswerKeyRef.current === botAnswerKey) {
        return;
      }
      executedAnswerKeyRef.current = botAnswerKey;
      scheduledAnswerKeyRef.current = null;

      const movie = currentMovie;
      const options = answerOptionsRef.current;
      if (!movie || !options?.length) {
        setBotIsThinking(false);
        return;
      }

      const correctAnswer = movie.title[language];
      console.log('🤖 Correct answer:', correctAnswer);

      const shouldAnswerCorrectly = Math.random() < 0.85;
      let pick;

      if (shouldAnswerCorrectly) {
        pick = correctAnswer;
        console.log('🤖 Bot chose CORRECT answer:', pick);
      } else {
        const wrongAnswers = options.filter((opt) => opt !== correctAnswer);
        pick = wrongAnswers[Math.floor(Math.random() * wrongAnswers.length)];
        console.log('🤖 Bot chose WRONG answer:', pick);
      }

      console.log('🤖 Bot selected:', pick, 'Correct?', pick === correctAnswer);
      Promise.resolve(handleAnswerSelectRef.current(pick, true, false, 'B')).finally(() => {
        setBotIsThinking(false);
      });
    }, 1000);

    answerTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
      if (scheduledAnswerKeyRef.current === botAnswerKey) {
        scheduledAnswerKeyRef.current = null;
      }
    };
  }, [botAnswerKey, currentMovie, isBotStealTurn, language, setBotIsThinking]);

  // Bot decision (Strict Mode safe: cleanup + reschedule on remount)
  useEffect(() => {
    if (!isQAMode) return;

    if (phase !== 'decision') {
      scheduledDecisionKeyRef.current = null;
      executedDecisionKeyRef.current = null;
      return;
    }

    const wonCard = gameState?.wonCard;
    if (!wonCard) {
      console.log('🤖 No wonCard in gameState');
      return;
    }

    if (wonCard.team !== 'B') {
      console.log('🤖 Card was not won by bot team:', wonCard.team);
      return;
    }

    const decisionKey = `${wonCard.movieId}:${wonCard.team}`;
    if (scheduledDecisionKeyRef.current === decisionKey) {
      return;
    }

    const wonMovie = allMovies.find((m) => m.id === wonCard.movieId);
    if (!wonMovie) {
      console.log('🤖 Could not find wonMovie');
      return;
    }

    const botCards = gameState?.teamB?.cards || [];
    scheduledDecisionKeyRef.current = decisionKey;

    console.log('🤖 Bot making connection decision...');
    console.log('🤖 Bot cards:', botCards.length);
    console.log('🤖 Won movie:', wonMovie.title.en);

    const timeoutId = setTimeout(() => {
      if (executedDecisionKeyRef.current === decisionKey) {
        return;
      }
      executedDecisionKeyRef.current = decisionKey;
      scheduledDecisionKeyRef.current = null;

      const latestCards = gameStateRef.current?.teamB?.cards || [];
      setBotIsThinking(true);

      const shouldSucceed = Math.random() < 0.8;

      const finish = () => setBotIsThinking(false);

      if (shouldSucceed && latestCards.length >= 2) {
        const targetCard = latestCards[Math.floor(Math.random() * latestCards.length)];
        const connectionTypes = ['actor', 'director', 'year'];
        const randomConnectionType =
          connectionTypes[Math.floor(Math.random() * connectionTypes.length)];

        console.log('🤖 Bot attempting connection (80% success)');
        console.log('🤖 Target card:', targetCard.title?.en);
        console.log('🤖 Connection type:', randomConnectionType);

        Promise.resolve(handleConnectionAttempt(targetCard, randomConnectionType)).finally(finish);
      } else if (latestCards.length < 2) {
        console.log('🤖 Bot has only 1 card - saving token and starting new sequence');
        Promise.resolve(handleSaveToken()).finally(finish);
      } else {
        console.log('🤖 Bot failed to find connection (20%) - starting new sequence');
        Promise.resolve(handleSaveToken()).finally(finish);
      }
    }, 1500);

    decisionTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
      if (scheduledDecisionKeyRef.current === decisionKey) {
        scheduledDecisionKeyRef.current = null;
      }
    };
  }, [
    isQAMode,
    phase,
    gameState?.wonCard,
    gameState?.teamB?.cards,
    allMovies,
    handleConnectionAttempt,
    handleSaveToken,
    setBotIsThinking
  ]);

  useEffect(() => {
    return () => {
      if (answerTimeoutRef.current) {
        clearTimeout(answerTimeoutRef.current);
      }
    };
  }, []);
};
