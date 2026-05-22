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

  const isBotTurn = gameState?.currentTurn === 'B';

  // Reset when movie changes
  useEffect(() => {
    if (currentMovie?.id) {
      console.log('🎬 Movie changed - resetting bot state');
      hasAnsweredRef.current = false;
      
      // Clear any existing timeouts
      if (answerTimeoutRef.current) {
        clearTimeout(answerTimeoutRef.current);
        answerTimeoutRef.current = null;
      }
      if (decisionTimeoutRef.current) {
        clearTimeout(decisionTimeoutRef.current);
        decisionTimeoutRef.current = null;
      }
    }
  }, [currentMovie?.id]);

  // Bot answering (when trailer ends)
  useEffect(() => {
    // Early exit conditions
    if (!isQAMode || !isBotTurn || !trailerEnded || !currentMovie || hasAnsweredRef.current) {
      return;
    }

    if (phase !== 'playing') {
      return;
    }

    if (!answerOptions || answerOptions.length === 0) {
      console.log('🤖 No answer options available yet');
      return;
    }

    console.log('🤖 Bot preparing to answer...');
    console.log('🤖 Answer options available:', answerOptions.length);
    
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
    isQAMode,
    isBotTurn,
    trailerEnded,
    phase,
    currentMovie,
    answerOptions,
    language,
    handleAnswerSelect,
    setBotIsThinking
  ]);

  // Bot decision making (connect or save token)
  useEffect(() => {
    if (!isQAMode || !isBotTurn) {
      return;
    }

    if (phase !== 'decision') {
      return;
    }

    if (botIsThinking) {
      console.log('🤖 Bot already thinking...');
      return;
    }

    if (!gameState?.wonCard) {
      console.log('🤖 No wonCard in gameState');
      return;
    }

    // Check if this card was won by bot (Team B)
    if (gameState.wonCard.team !== 'B') {
      console.log('🤖 Card was not won by bot team');
      return;
    }

    // Get bot cards
    const botCards = gameState?.teamB?.cards || [];

    console.log('🤖 Bot making connection decision...');
    console.log('🤖 Bot cards:', botCards.length);

    const wonMovie = allMovies.find(m => m.id === gameState.wonCard.movieId);
    
    if (!wonMovie) {
      console.log('🤖 Could not find wonMovie');
      return;
    }

    console.log('🤖 Won movie:', wonMovie.title.en);

    setBotIsThinking(true);

    // Bot decides after 1 second
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
    }, 1000);

    decisionTimeoutRef.current = timeoutId;

    return () => {
      if (decisionTimeoutRef.current) {
        clearTimeout(decisionTimeoutRef.current);
      }
    };
  }, [
    gameState,
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