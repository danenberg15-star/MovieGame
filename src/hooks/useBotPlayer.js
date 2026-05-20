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

  // Reset refs when movie changes
  useEffect(() => {
    if (currentMovie?.id) {
      hasAnsweredRef.current = false;
    }
  }, [currentMovie?.id]);

  // Reset refs when phase changes
  useEffect(() => {
    if (phase === 'decision') {
      hasDecidedRef.current = false;
    } else if (phase === 'playing') {
      hasAnsweredRef.current = false;
    }
  }, [phase]);

  // Bot turn handler for answering
  useEffect(() => {
    if (!gameState || !currentMovie || !isQAMode) return;
    if (gameState.currentTurn !== 'B') return;
    if (phase !== 'playing') return;
    if (botIsThinking) return;
    if (!trailerEnded) return;
    if (hasAnsweredRef.current) return; // Prevent double answering

    console.log('🤖 Bot turn starting...');
    hasAnsweredRef.current = true;
    setBotIsThinking(true);

    const options = gameState.currentMovie?.options || answerOptions;
    const correctAnswer = currentMovie.title[language];

    botPlayer.chooseAnswer(correctAnswer, options, async (selectedAnswer, isCorrect) => {
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
  }, [gameState?.currentTurn, currentMovie?.id, isQAMode, phase, botIsThinking, trailerEnded]);

  // Bot decision phase
  useEffect(() => {
    if (!gameState || !isQAMode) return;
    if (phase !== 'decision') return;
    if (gameState.wonCard?.team !== 'B') return;
    if (botIsThinking) return;
    if (hasDecidedRef.current) return; // Prevent double deciding

    console.log('🤖 Bot making decision...');
    hasDecidedRef.current = true;
    setBotIsThinking(true);

    const wonMovie = allMovies.find(m => m.id === gameState.wonCard.movieId);
    const botCards = gameState.teamB?.cards || [];

    botPlayer.makeDecision(wonMovie, botCards, async (decision) => {
      console.log('🤖 Bot decision:', decision);

      if (decision.action === 'connect' && decision.targetCard && decision.connectionType) {
        await handleConnectionAttempt(decision.targetCard, decision.connectionType);
      } else {
        await handleSaveToken();
      }

      setBotIsThinking(false);
    });
  }, [gameState?.wonCard?.movieId, phase, isQAMode, botIsThinking]);
};