// src/hooks/useBotPlayer.js
import { useEffect, useRef } from 'react';
import { ref, update } from 'firebase/database';
import { database } from '../firebase';
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
  const hasDecidedRef = useRef(false);
  const currentMovieIdRef = useRef(null);
  const answeringTimeoutRef = useRef(null);
  const decisionTimeoutRef = useRef(null);

  // Reset logic - SEPARATE useEffect
  useEffect(() => {
    const newMovieId = currentMovie?.id;
    
    if (newMovieId && newMovieId !== currentMovieIdRef.current) {
      console.log('🎬 Movie changed - resetting bot state');
      
      // Cancel any pending operations
      if (answeringTimeoutRef.current) {
        clearTimeout(answeringTimeoutRef.current);
        answeringTimeoutRef.current = null;
      }
      
      // Update refs
      currentMovieIdRef.current = newMovieId;
      hasAnsweredRef.current = false;
      setBotIsThinking(false);
    }
  }, [currentMovie?.id, setBotIsThinking]);

  // Phase change logic - SEPARATE useEffect
  useEffect(() => {
    if (phase === 'decision') {
      hasDecidedRef.current = false;
      if (answeringTimeoutRef.current) {
        clearTimeout(answeringTimeoutRef.current);
        answeringTimeoutRef.current = null;
      }
    } else if (phase === 'playing') {
      hasAnsweredRef.current = false;
      if (decisionTimeoutRef.current) {
        clearTimeout(decisionTimeoutRef.current);
        decisionTimeoutRef.current = null;
      }
    }
  }, [phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (answeringTimeoutRef.current) {
        clearTimeout(answeringTimeoutRef.current);
      }
      if (decisionTimeoutRef.current) {
        clearTimeout(decisionTimeoutRef.current);
      }
    };
  }, []);

  // Bot answering logic - ONLY runs when trailer ends
  useEffect(() => {
    // Guard clauses
    if (!gameState) return;
    if (!currentMovie) return;
    if (!isQAMode) return;
    if (gameState.currentTurn !== 'B') return;
    if (phase !== 'playing') return;
    if (!trailerEnded) return; // CRITICAL: Don't run until trailer ends
    if (hasAnsweredRef.current) return;
    if (botIsThinking) return;

    // Verify movie ID matches
    if (currentMovie.id !== currentMovieIdRef.current) {
      console.log('🤖 Movie ID mismatch - skipping');
      return;
    }

    console.log('🤖 Bot turn starting for:', currentMovie.title?.en);
    hasAnsweredRef.current = true;
    setBotIsThinking(true);

    const options = gameState.currentMovie?.options || answerOptions;
    const correctAnswer = currentMovie.title[language];
    const savedMovieId = currentMovie.id;

    // 1 second delay
    const timeoutId = setTimeout(() => {
      // Safety check
      if (savedMovieId !== currentMovieIdRef.current) {
        console.log('🤖 Movie changed during delay - aborting');
        setBotIsThinking(false);
        return;
      }

      botPlayer.chooseAnswer(correctAnswer, options, async (selectedAnswer, isCorrect) => {
        // Final safety check
        if (savedMovieId !== currentMovieIdRef.current) {
          console.log('🤖 Movie changed during answer - aborting');
          setBotIsThinking(false);
          return;
        }

        console.log('🤖 Bot selected:', selectedAnswer, 'Correct?', isCorrect);
        
        setSelectedAnswer(selectedAnswer);
        setIsCorrect(isCorrect);

        if (isCorrect) {
          const newTokens = (gameState.teamB?.tokens || 0) + 1;

          await update(ref(database, `games/${roomCode}`), {
            'teamB/tokens': newTokens,
            phase: 'decision',
            wonCard: {
              movieId: savedMovieId,
              team: 'B'
            }
          });

          setResultMessage(language === 'he' ? 'הבוט ענה נכון! +1 אסימון' : 'Bot answered correctly! +1 Token');
          setShowResult(true);

        } else {
          const newRemovedAnswers = [...(gameState.currentMovie?.removedAnswers || []), selectedAnswer];
          const attempts = gameState.currentMovieAttempts || [];
          const newAttempts = [...attempts, 'B'];

          if (newAttempts.length >= 2) {
            setResultMessage(language === 'he' ? 'שתי הקבוצות לא זיהו - הכרטיס יחזור!' : 'Both teams failed - card will return!');
            setShowResult(true);

            setTimeout(async () => {
              await update(ref(database, `games/${roomCode}`), {
                currentMovie: null,
                currentMovieAttempts: [],
                currentTurn: 'A'
              });
              setBotIsThinking(false);
              startNextRound();
            }, 2000);

          } else {
            await update(ref(database, `games/${roomCode}`), {
              [`currentMovie/removedAnswers`]: newRemovedAnswers,
              currentMovieAttempts: newAttempts,
              currentTurn: 'A'
            });

            setResultMessage(language === 'he' ? 'הבוט טעה - התור שלך!' : 'Bot was wrong - your turn!');
            setShowResult(true);
            setRemovedAnswers(newRemovedAnswers);
            setBotIsThinking(false);
          }
        }

        setTimeout(() => {
          setShowResult(false);
        }, 2000);
      });
    }, 1000);

    answeringTimeoutRef.current = timeoutId;
  }, [trailerEnded]); // ONLY trailerEnded as dependency!

  // Bot decision phase
  useEffect(() => {
    if (!gameState) return;
    if (!isQAMode) return;
    if (phase !== 'decision') return;
    if (gameState.wonCard?.team !== 'B') return;
    if (hasDecidedRef.current) return;
    if (botIsThinking) return;

    console.log('🤖 Bot making decision...');
    hasDecidedRef.current = true;
    setBotIsThinking(true);

    const wonMovie = allMovies.find(m => m.id === gameState.wonCard.movieId);
    const botCards = gameState.teamB?.cards || [];
    const savedWonCardId = gameState.wonCard.movieId;

    const timeoutId = setTimeout(() => {
      if (gameState.wonCard?.movieId !== savedWonCardId) {
        console.log('🤖 Decision context changed - aborting');
        setBotIsThinking(false);
        return;
      }

      botPlayer.makeDecision(wonMovie, botCards, async (decision) => {
        console.log('🤖 Bot decision:', decision);

        if (decision.action === 'connect' && decision.targetCard && decision.connectionType) {
          await handleConnectionAttempt(decision.targetCard, decision.connectionType);
        } else {
          await handleSaveToken();
        }

        setBotIsThinking(false);
      });
    }, Math.floor(Math.random() * 10000) + 5000);

    decisionTimeoutRef.current = timeoutId;
  }, [gameState?.wonCard?.movieId, phase]);
};