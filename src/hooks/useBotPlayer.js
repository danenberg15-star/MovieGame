// src/hooks/useBotPlayer.js
import { useEffect, useRef } from 'react';
import botPlayer from '../utils/botPlayer';

export const useBotPlayer = (
  gameState,
  currentMovie,
  isQAMode,
  phase,
  botIsThinking,
  setBotIsThinking,
  trailerEnded,
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
  const hasDecidedRef = useRef(false);
  const botTurnStartedRef = useRef(false); // 🔥 NEW: Track if bot's turn just started

  const isBotTurn = gameState?.currentTurn === 'B';

  // Reset when movie changes
  useEffect(() => {
    if (currentMovie?.id && currentMovie.id !== currentMovieIdRef.current) {
      console.log('🎬 Movie changed - resetting bot state');
      currentMovieIdRef.current = currentMovie.id;
      hasAnsweredRef.current = false;
      hasDecidedRef.current = false;
      botTurnStartedRef.current = false; // 🔥 Reset bot turn tracker
      
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

  // 🔥 NEW: Track when it becomes bot's turn for the FIRST time for this movie
  useEffect(() => {
    if (isBotTurn && currentMovie?.id === currentMovieIdRef.current && phase === 'playing') {
      const attempts = gameState?.currentMovieAttempts || [];
      
      // If this is bot's FIRST turn for this movie (no attempts yet from user)
      if (attempts.length === 0 && !botTurnStartedRef.current) {
        console.log('🤖 Bot\'s FIRST turn for this movie - ready to watch trailer');
        botTurnStartedRef.current = true;
      }
    }
  }, [isBotTurn, currentMovie?.id, phase, gameState?.currentMovieAttempts]);

  // Reset decision flag when phase changes to decision
  useEffect(() => {
    if (phase === 'decision') {
      hasDecidedRef.current = false;
      setBotIsThinking(false);
    }
  }, [phase, setBotIsThinking]);

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

    // 🔥 CRITICAL: Check if this is a SECOND ATTEMPT (user already tried)
    const attempts = gameState?.currentMovieAttempts || [];
    if (attempts.length > 0 && !botTurnStartedRef.current) {
      console.log('🤖 This is a second attempt - user already tried, bot should NOT answer from old trailer');
      console.log('🤖 Attempts:', attempts);
      return;
    }

    // CRITICAL: Only proceed when trailer has ACTUALLY ended
    if (!trailerEnded) {
      console.log('🤖 Waiting for trailer to end...');
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
    console.log('🤖 Trailer ended:', trailerEnded);
    console.log('🤖 Answer options available:', answerOptions.length);
    console.log('🤖 Attempts:', attempts.length);
    
    // Mark as answered BEFORE starting timeout
    hasAnsweredRef.current = true;
    setBotIsThinking(true);

    // Bot answers after 1 second
    const timeoutId = setTimeout(() => {
      const correctAnswer = currentMovie.title[language];
      console.log('🤖 Correct answer:', correctAnswer);

      botPlayer.chooseAnswer(correctAnswer, answerOptions, (selectedAnswer, isCorrect) => {
        console.log('🤖 Bot selected:', selectedAnswer, 'Correct?', isCorrect);
        handleAnswerSelect(selectedAnswer, true, true, false);
        setBotIsThinking(false);
      });
    }, 1000);

    answerTimeoutRef.current = timeoutId;

    return () => {
      if (answerTimeoutRef.current) {
        clearTimeout(answerTimeoutRef.current);
      }
    };
  }, [
    answerOptions,
    trailerEnded,
    isQAMode,
    isBotTurn,
    phase,
    currentMovie,
    language,
    gameState?.currentMovieAttempts,
    handleAnswerSelect,
    setBotIsThinking
  ]);

  // Bot decision making (connect or save token)
  useEffect(() => {
    console.log('🤖 Decision effect triggered:', {
      isQAMode,
      isBotTurn,
      phase,
      botIsThinking,
      wonCard: gameState?.wonCard,
      hasDecided: hasDecidedRef.current
    });

    if (!isQAMode || !isBotTurn) {
      return;
    }

    if (phase !== 'decision') {
      return;
    }

    // Check if already decided first
    if (hasDecidedRef.current) {
      console.log('🤖 Already made decision for this round');
      return;
    }

    // Then check if bot is thinking
    if (botIsThinking) {
      console.log('🤖 Bot already thinking, skipping...');
      return;
    }

    if (!gameState?.wonCard) {
      console.log('🤖 No wonCard in gameState');
      return;
    }

    // Check if this card was won by bot (Team B)
    if (gameState.wonCard.team !== 'B') {
      console.log('🤖 Card was not won by bot team:', gameState.wonCard.team);
      return;
    }

    // Get bot cards
    const botCards = gameState?.teamB?.cards || [];

    console.log('🤖 Bot making connection decision...');
    console.log('🤖 Bot cards:', botCards.length);
    console.log('🤖 Won card:', gameState.wonCard);

    const wonMovie = allMovies.find(m => m.id === gameState.wonCard.movieId);
    
    if (!wonMovie) {
      console.log('🤖 Could not find wonMovie');
      return;
    }

    console.log('🤖 Won movie:', wonMovie.title.en);

    // Mark as decided IMMEDIATELY to prevent re-runs
    hasDecidedRef.current = true;
    
    // Set thinking state IMMEDIATELY to block re-entry
    setBotIsThinking(true);

    // Bot decides after 1.5 seconds (longer delay for decision phase)
    const timeoutId = setTimeout(() => {
      botPlayer.makeDecision(wonMovie, botCards, async (decision) => {
        console.log('🤖 Bot decision:', decision);

        if (decision.action === 'connect' && decision.targetCard && decision.connectionType) {
          await handleConnectionAttempt(decision.targetCard, decision.connectionType);
        } else {
          await handleSaveToken();
        }

        setBotIsThinking(false);
      });
    }, 1500);

    decisionTimeoutRef.current = timeoutId;

    return () => {
      if (decisionTimeoutRef.current) {
        clearTimeout(decisionTimeoutRef.current);
      }
    };
  }, [
    gameState?.wonCard,
    gameState?.teamB?.cards,
    isQAMode,
    isBotTurn,
    phase,
    botIsThinking,
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
      if (decisionTimeoutRef.current) {
        clearTimeout(decisionTimeoutRef.current);
      }
    };
  }, []);
};