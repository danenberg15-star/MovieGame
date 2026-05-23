// src/hooks/useBotPlayer.js
import { useEffect, useRef } from 'react';

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
  handleSaveToken
) => {
  const hasAnsweredRef = useRef(false);
  const answerTimeoutRef = useRef(null);
  const decisionTimeoutRef = useRef(null);
  const currentMovieIdRef = useRef(null);
  const botTurnStartedRef = useRef(false);
  const scheduledDecisionKeyRef = useRef(null);
  const executedDecisionKeyRef = useRef(null);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const isBotTurn = gameState?.currentTurn === 'B';

  // Reset when movie changes
  useEffect(() => {
    if (currentMovie?.id && currentMovie.id !== currentMovieIdRef.current) {
      console.log('🎬 Movie changed - resetting bot state');
      currentMovieIdRef.current = currentMovie.id;
      hasAnsweredRef.current = false;
      scheduledDecisionKeyRef.current = null;
      executedDecisionKeyRef.current = null;
      botTurnStartedRef.current = false;
      
      // Clear any existing timeouts
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

  // Track when it becomes bot's turn for the FIRST time for this movie (QA only)
  useEffect(() => {
    if (!isQAMode) return;
    if (isBotTurn && currentMovie?.id === currentMovieIdRef.current && phase === 'playing') {
      const attempts = gameState?.currentMovieAttempts || [];
      
      // If this is bot's FIRST turn for this movie (no attempts yet from user)
      if (attempts.length === 0 && !botTurnStartedRef.current) {
        console.log('🤖 Bot\'s FIRST turn for this movie - ready to watch trailer');
        botTurnStartedRef.current = true;
      }
    }
  }, [isQAMode, isBotTurn, currentMovie?.id, phase, gameState?.currentMovieAttempts]);

  // Bot answering (when trailer ends)
  useEffect(() => {
    // Early exit conditions - check these FIRST
    if (!isQAMode || !isBotTurn || !currentMovie) {
      return;
    }

    if (phase !== 'playing') {
      return;
    }

    if (hasAnsweredRef.current) {
      return;
    }

    // Check if options are ready
    if (!answerOptions || answerOptions.length === 0) {
      console.log('🤖 No answer options available yet');
      return;
    }

    const attempts = gameState?.currentMovieAttempts || [];
    if (attempts.includes('B')) {
      console.log('🤖 Bot already attempted this movie');
      return;
    }

    const trailerReady = gameState?.currentMovie?.trailerWatchedForTurn === 'B';
    if (!trailerReady) {
      console.log('🤖 Waiting for trailer to be watched...');
      return;
    }

    // Verify this movie ID matches current movie
    if (currentMovieIdRef.current !== currentMovie.id) {
      console.log('🤖 Movie ID mismatch - skipping answer', {
        current: currentMovieIdRef.current,
        movie: currentMovie.id
      });
      return;
    }

    console.log('🤖 Bot preparing to answer...');
    console.log('🤖 Trailer watched for turn B');
    console.log('🤖 Answer options available:', answerOptions.length);
    console.log('🤖 Attempts:', attempts.length);
    
    // Mark as answered BEFORE starting timeout
    hasAnsweredRef.current = true;
    setBotIsThinking(true);

    // Bot answers after 1 second
    const timeoutId = setTimeout(() => {
      const correctAnswer = currentMovie.title[language];
      console.log('🤖 Correct answer:', correctAnswer);

      // 85% chance to answer correctly
      const shouldAnswerCorrectly = Math.random() < 0.85;
      let selectedAnswer;

      if (shouldAnswerCorrectly) {
        selectedAnswer = correctAnswer;
        console.log('🤖 Bot chose CORRECT answer:', selectedAnswer);
      } else {
        // Choose a random wrong answer
        const wrongAnswers = answerOptions.filter(opt => opt !== correctAnswer);
        selectedAnswer = wrongAnswers[Math.floor(Math.random() * wrongAnswers.length)];
        console.log('🤖 Bot chose WRONG answer:', selectedAnswer);
      }

      console.log('🤖 Bot selected:', selectedAnswer, 'Correct?', selectedAnswer === correctAnswer);
      handleAnswerSelect(selectedAnswer, true, false, 'B');
      setBotIsThinking(false);
    }, 1000);

    answerTimeoutRef.current = timeoutId;

    return () => {
      if (answerTimeoutRef.current) {
        clearTimeout(answerTimeoutRef.current);
      }
    };
  }, [
    answerOptions,
    gameState?.currentMovie?.trailerWatchedForTurn,
    isQAMode,
    isBotTurn,
    phase,
    currentMovie,
    language,
    gameState?.currentMovieAttempts,
    handleAnswerSelect,
    setBotIsThinking
  ]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (answerTimeoutRef.current) {
        clearTimeout(answerTimeoutRef.current);
      }
    };
  }, []);
};