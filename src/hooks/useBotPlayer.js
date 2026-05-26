// src/hooks/useBotPlayer.js

import { useEffect, useMemo, useRef } from 'react';

import { getStealingTeam, isBotTurnForQA, normalizeAttempts } from './useGameActions';
import { findConnection } from '../utils/gameLogic';

/* ----- bot connection helpers ----- */

// Try to find a *real* connection between the won movie and any card
// already in the bot's chain. Returns { targetCard, type } or null.
const findRealConnection = (wonMovie, teamCards) => {
  if (!wonMovie || !Array.isArray(teamCards)) return null;
  const order = ['actor', 'director', 'year'];
  for (const card of teamCards) {
    if (!card || !card.id) continue;
    const conns = findConnection(wonMovie, card);
    if (!conns || conns.length === 0) continue;
    for (const t of order) {
      const hit = conns.find((c) => c.type === t);
      if (hit) return { targetCard: card, type: hit.type };
    }
    return { targetCard: card, type: conns[0].type };
  }
  return null;
};

// Pick a connection type that we know does NOT actually link the two cards.
// Falls back to a random type if every type happens to match (very rare).
const pickWrongConnectionType = (wonMovie, targetCard) => {
  const all = ['actor', 'director', 'year'];
  const realConns = findConnection(wonMovie, targetCard) || [];
  const realTypes = new Set(realConns.map((c) => c.type));
  const wrong = all.filter((t) => !realTypes.has(t));
  return wrong.length > 0
    ? wrong[Math.floor(Math.random() * wrong.length)]
    : all[Math.floor(Math.random() * all.length)];
};



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

  handleBuyConnection,

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
    () => normalizeAttempts(gameState?.currentMovieAttempts),
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



      const shouldAnswerCorrectly = Math.random() < 0.8;

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
      const botTokens = gameStateRef.current?.teamB?.tokens || 0;

      setBotIsThinking(true);
      const finish = () => setBotIsThinking(false);

      // === 1. ALWAYS buy connection when we can afford it ===
      // The user explicitly wants the bot to spend tokens on cards
      // whenever it has enough; otherwise the bot just hoards tokens.
      if (botTokens >= 3 && handleBuyConnection) {
        console.log(`🤖 Bot has ${botTokens} tokens → BUYING connection (auto)`);
        Promise.resolve(handleBuyConnection()).finally(finish);
        return;
      }

      // === 2. Nothing to connect to → save token ===
      if (latestCards.length === 0) {
        console.log('🤖 Bot has no chain cards yet → saving token');
        Promise.resolve(handleSaveToken()).finally(finish);
        return;
      }

      // === 3. Otherwise try to connect with 80% success rate ===
      const shouldSucceed = Math.random() < 0.8;

      if (shouldSucceed) {
        const real = findRealConnection(wonMovie, latestCards);
        if (real) {
          console.log(
            `🤖 Bot connecting (80% success): ${wonMovie.title?.en} ↔ ${real.targetCard.title?.en} via ${real.type}`
          );
          Promise.resolve(
            handleConnectionAttempt(real.targetCard, real.type)
          ).finally(finish);
          return;
        }
        // No real connection exists with any chain card → save the token
        // (random guessing here would just fail and lose the card).
        console.log('🤖 No real connection found in chain → saving token');
        Promise.resolve(handleSaveToken()).finally(finish);
        return;
      }

      // === 4. 20% deliberate miss — pick a target and a wrong type ===
      const targetCard =
        latestCards[Math.floor(Math.random() * latestCards.length)];
      const wrongType = pickWrongConnectionType(wonMovie, targetCard);
      console.log(
        `🤖 Bot deliberately failing (20%): ${targetCard.title?.en} via ${wrongType}`
      );
      Promise.resolve(
        handleConnectionAttempt(targetCard, wrongType)
      ).finally(finish);

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

    handleBuyConnection,

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


