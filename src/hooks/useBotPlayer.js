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

  // Reset refs when movie changes
  useEffect(() => {
    if (currentMovie?.id && currentMovie.id !== currentMovieIdRef.current) {
      console.log('🎬 Movie changed - canceling bot actions');
      currentMovieIdRef.current = currentMovie.id;
      hasAnsweredRef.current = false;
      
      // Cancel any pending bot answer
      if (answeringTimeoutRef.current) {
        clearTimeout(answeringTimeoutRef.current);
        answeringTimeoutRef.current = null;
      }
      
      setBotIsThinking(false);
    }
  }, [currentMovie?.id, setBotIsThinking]);

  // Reset refs when phase changes
  useEffect(() => {
    if (phase === 'decision') {
      hasDecidedRef.current = false;
      
      // Cancel any pending bot answer when moving to decision
      if (answeringTimeoutRef.current) {
        clearTimeout(answeringTimeoutRef.current);
        answeringTimeoutRef.current = null;
      }
    } else if (phase === 'playing') {
      hasAnsweredRef.current = false;
      
      // Cancel any pending bot decision when moving to playing
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

  // Bot turn handler for answering - FAST (1 second)
  useEffect(() => {
    if (!gameState || !currentMovie || !isQAMode) return;
    if (gameState.currentTurn !== 'B') return;
    if (phase !== 'playing') return;
    if (botIsThinking) return;
    if (!trailerEnded) return;
    if (hasAnsweredRef.current) return;
    if (currentMovie.id !== currentMovieIdRef.current) return;

    console.log('🤖 Bot turn starting...');
    hasAnsweredRef.current = true;
    setBotIsThinking(true);

    const options = gameState.currentMovie?.options || answerOptions;
    const correctAnswer = currentMovie.title[language];
    const savedMovieId = currentMovie.id;

    // FAST: 1 second delay
    const timeoutId = setTimeout(() => {
      // Double-check we're still on the same movie
      if (savedMovieId !== currentMovieIdRef.current) {
        console.log('🤖 Movie changed during bot thinking - aborting');
        setBotIsThinking(false);
        return;
      }

      botPlayer.chooseAnswer(correctAnswer, options, async (selectedAnswer, isCorrect) => {
        // Triple-check we're still on the same movie
        if (savedMovieId !== currentMovieIdRef.current) {
          console.log('🤖 Movie changed during bot answer - aborting');
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
              movieId: currentMovie.id,
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
    }, 1000); // CHANGED: 1 second only!

    answeringTimeoutRef.current = timeoutId;
  }, [
    gameState,
    currentMovie,
    isQAMode,
    phase,
    botIsThinking,
    trailerEnded,
    answerOptions,
    language,
    roomCode,
    setBotIsThinking,
    setSelectedAnswer,
    setIsCorrect,
    setResultMessage,
    setShowResult,
    setRemovedAnswers,
    startNextRound
  ]);

  // Bot decision phase
  useEffect(() => {
    if (!gameState || !isQAMode) return;
    if (phase !== 'decision') return;
    if (gameState.wonCard?.team !== 'B') return;
    if (botIsThinking) return;
    if (hasDecidedRef.current) return;

    console.log('🤖 Bot making decision...');
    hasDecidedRef.current = true;
    setBotIsThinking(true);

    const wonMovie = allMovies.find(m => m.id === gameState.wonCard.movieId);
    const botCards = gameState.teamB?.cards || [];
    const savedWonCardId = gameState.wonCard.movieId;

    const timeoutId = setTimeout(() => {
      // Check we're still in the same decision phase
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
    }, Math.floor(Math.random() * 10000) + 5000); // 5-15 seconds for decision

    decisionTimeoutRef.current = timeoutId;
  }, [
    gameState,
    phase,
    isQAMode,
    botIsThinking,
    allMovies,
    handleConnectionAttempt,
    handleSaveToken,
    setBotIsThinking
  ]);
};