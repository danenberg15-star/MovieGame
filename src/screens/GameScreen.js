// src/components/GameScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, get } from 'firebase/database';
import { database } from '../firebase';
import { useTranslation } from 'react-i18next';
import TrailerPlayer from './TrailerPlayer';
import DecisionPhase from './DecisionPhase';
import botPlayer from '../utils/botPlayer';
import {
  loadMoviesData,
  selectAnchorCards,
  selectNextMovie,
  generateAnswerOptions,
  checkAnswer,
  validateConnection,
  getConnectionHint,
  checkWinCondition,
  initializeGameState,
  getSuccessMessage,
  buildMoviesIndex
} from '../utils/gameLogic';
import './GameScreen.css';

function GameScreen() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const language = i18n.language;

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [answerOptions, setAnswerOptions] = useState([]);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null); // 🆕 NEW
  
  const stateRef = useRef(state);
  const isLockedRef = useRef(isLocked);

  // Keep refs in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

  // Initialize game
  useEffect(() => {
    const initGame = async () => {
      try {
        console.log('🎮 Initializing game...');
        
        // Load movies
        const movies = await loadMoviesData();
        if (movies.length === 0) {
          throw new Error('No movies loaded');
        }

        // Build index
        const moviesIndex = buildMoviesIndex(movies);

        // Check if game state exists in Firebase
        const gameRef = ref(database, `games/${roomCode}`);
        const snapshot = await get(gameRef);

        if (snapshot.exists()) {
          // Load existing game
          console.log('📥 Loading existing game state...');
          const gameData = snapshot.val();
          setState({
            ...gameData,
            allMovies: movies,
            moviesIndex: moviesIndex
          });
        } else {
          // Create new game
          console.log('🆕 Creating new game...');
          const anchorCards = selectAnchorCards(movies);
          const initialState = initializeGameState(anchorCards, movies, moviesIndex);
          
          setState(initialState);
          await update(gameRef, initialState);
        }

        setLoading(false);
      } catch (err) {
        console.error('❌ Init error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    initGame();
  }, [roomCode]);

  // Listen to Firebase changes
  useEffect(() => {
    if (!roomCode) return;

    const gameRef = ref(database, `games/${roomCode}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        const gameData = snapshot.val();
        
        // Preserve allMovies and moviesIndex from local state
        if (stateRef.current) {
          setState({
            ...gameData,
            allMovies: stateRef.current.allMovies,
            moviesIndex: stateRef.current.moviesIndex
          });
        }
      }
    });

    return () => unsubscribe();
  }, [roomCode]);

  // Update Firebase
  const updateGameState = async (newState) => {
    try {
      console.log('🔥 Firebase update - updating state ONLY (no round start)');
      
      const gameRef = ref(database, `games/${roomCode}`);
      const { allMovies, moviesIndex, ...stateToSync } = newState;
      
      await update(gameRef, stateToSync);
      console.log('✅ State synced to Firebase');
    } catch (err) {
      console.error('❌ Firebase update error:', err);
    }
  };

  // Start new round
  const startNewRound = async () => {
    if (isLockedRef.current) {
      console.log('⚠️ Round already locked - skipping startNewRound');
      return;
    }

    console.log('🔄 Starting new round...');
    console.log('🎨 Required connection type:', stateRef.current.lastConnectionType);
    console.log('📊 Current usedMovieIds:', stateRef.current.usedMovieIds);

    setIsLocked(true);
    console.log('🔒 ROUND LOCKED');

    const nextMovie = selectNextMovie(
      stateRef.current.allMovies,
      stateRef.current.usedMovieIds,
      stateRef.current.teamA.cards,
      stateRef.current.teamB.cards,
      stateRef.current.currentTurn,
      stateRef.current.lastConnectionType,
      stateRef.current.moviesIndex
    );

    console.log('🎬 Next movie selected:', nextMovie?.id, nextMovie?.title?.en);

    if (!nextMovie) {
      console.log('❌ No movie found - game over');
      const newState = {
        ...stateRef.current,
        phase: 'finished',
        winner: null
      };
      setState(newState);
      await updateGameState(newState);
      setIsLocked(false);
      return;
    }

    const newUsedMovieIds = [...stateRef.current.usedMovieIds, nextMovie.id];
    console.log('✅ Added movie to usedMovieIds:', nextMovie.id);

    const options = generateAnswerOptions(nextMovie, stateRef.current.allMovies, language);

    const newState = {
      ...stateRef.current,
      currentMovie: nextMovie,
      currentMovieAttempts: [],
      phase: 'trailer',
      usedMovieIds: newUsedMovieIds,
      roundNumber: stateRef.current.roundNumber + 1
    };

    setState(newState);
    setAnswerOptions(options);
    setSelectedAnswer(null);
    setShowHint(false);
    setConnectionResult(null); // 🆕 Clear previous connection result

    await updateGameState(newState);
    console.log('✅ Round started - Phase: trailer - LOCK REMAINS');
  };

  // Handle trailer end
  const handleTrailerEnd = async () => {
    console.log('🎬 Trailer ended - switching to answering phase');

    const newState = {
      ...stateRef.current,
      phase: 'answering'
    };

    setState(newState);
    await updateGameState(newState);

    // If bot's turn, trigger bot answer
    if (stateRef.current.currentTurn === 'B' && roomCode === '99999') {
      console.log('🤖 Bot turn - triggering answer in 500ms...');
      setTimeout(() => {
        handleBotAnswer();
      }, 500);
    }
  };

  // Handle answer selection
  const handleAnswerSelect = async (answer) => {
    if (isLockedRef.current) {
      console.log('⚠️ Locked - ignoring answer');
      return;
    }

    console.log(`📝 Answer selected by Team ${stateRef.current.currentTurn}: ${answer}`);

    setSelectedAnswer(answer);
    const isCorrect = checkAnswer(answer, stateRef.current.currentMovie, language);

    console.log(isCorrect ? '✅ Correct!' : '❌ Wrong!');

    if (isCorrect) {
      // Correct answer - go to decision phase
      const currentTeam = stateRef.current.currentTurn === 'A' ? 'teamA' : 'teamB';
      const newState = {
        ...stateRef.current,
        [currentTeam]: {
          ...stateRef.current[currentTeam],
          tokens: stateRef.current[currentTeam].tokens + 1
        },
        phase: 'decision'
      };

      setState(newState);
      await updateGameState(newState);
      console.log('✅ Going to decision phase - LOCK STAYS');

      // If bot won, trigger bot decision
      if (stateRef.current.currentTurn === 'B' && roomCode === '99999') {
        console.log('🤖 Bot won - triggering decision in 2s...');
        setTimeout(() => {
          handleBotDecision();
        }, 2000);
      }

    } else {
      // Wrong answer
      const attempts = [...stateRef.current.currentMovieAttempts, stateRef.current.currentTurn];

      if (attempts.length >= 2) {
        // Both teams failed
        console.log('❌ Both teams failed - card returns to pool');
        alert(t('both_teams_failed'));

        const newState = {
          ...stateRef.current,
          currentMovieAttempts: [],
          usedMovieIds: stateRef.current.usedMovieIds.filter(id => id !== stateRef.current.currentMovie.id)
        };

        setState(newState);
        await updateGameState(newState);

        setIsLocked(false);
        console.log('🔓 Both failed - UNLOCKING');

        startNewRound();
      } else {
        // Switch to other team
        const nextTurn = stateRef.current.currentTurn === 'A' ? 'B' : 'A';
        console.log(`🔄 Switching to Team ${nextTurn} - LOCK STAYS`);

        const newState = {
          ...stateRef.current,
          currentTurn: nextTurn,
          currentMovieAttempts: attempts
        };

        setState(newState);
        await updateGameState(newState);

        // If switched to bot, trigger bot answer
        if (nextTurn === 'B' && roomCode === '99999') {
          console.log('🤖 Bot turn after failed attempt - triggering in 1s...');
          setTimeout(() => {
            handleBotAnswer();
          }, 1000);
        }
      }
    }
  };

  // Bot answer
  const handleBotAnswer = () => {
    if (!stateRef.current || stateRef.current.phase !== 'answering') {
      console.log('⚠️ Bot answer ignored - wrong phase');
      return;
    }

    botPlayer.chooseAnswer(
      stateRef.current.currentMovie.title.en,
      answerOptions,
      (selectedAnswer, isCorrect) => {
        handleAnswerSelect(selectedAnswer);
      }
    );
  };

  // Bot decision
  const handleBotDecision = () => {
    if (!stateRef.current || stateRef.current.phase !== 'decision') {
      console.log('⚠️ Bot decision ignored - wrong phase');
      return;
    }

    const teamBCards = stateRef.current.teamB.cards;

    botPlayer.makeDecision(
      stateRef.current.currentMovie,
      teamBCards,
      (decision) => {
        console.log('🤖 Bot decision:', decision);

        if (decision.action === 'connect') {
          handleConnectionAttempt(decision.targetCard, decision.connectionType);
        } else {
          handleSaveToken();
        }
      }
    );
  };

  // Handle connection attempt
  const handleConnectionAttempt = async (targetCard, connectionType) => {
    console.log('🔗 Connection attempt:', {
      source: state.currentMovie?.title?.en,
      target: targetCard?.title?.en,
      type: connectionType
    });

    // Validate connection
    const result = validateConnection(state.currentMovie, targetCard, connectionType);
    
    console.log('✅ Validation result:', result);

    if (result.valid) {
      console.log('✅ Connection is VALID!');
      
      // Success - add card to team
      const currentTeam = state.currentTurn === 'A' ? 'teamA' : 'teamB';
      const newCards = [...state[currentTeam].cards, state.currentMovie];
      
      // Update state
      const newState = {
        ...state,
        [currentTeam]: {
          ...state[currentTeam],
          cards: newCards,
          score: newCards.length
        },
        phase: 'playing',
        lastConnectionType: connectionType
      };

      setState(newState);
      setConnectionResult(null); // 🆕 Clear any previous result
      
      // Check win condition
      if (checkWinCondition(newCards)) {
        console.log(`🎉 Team ${state.currentTurn} WINS!`);
        newState.winner = state.currentTurn;
        newState.phase = 'finished';
        setState(newState);
        await updateGameState(newState);
        return;
      }

      // Sync to Firebase
      await updateGameState(newState);
      
      // Show success message
      const successMsg = getSuccessMessage(connectionType, result.connection, language);
      alert(successMsg);
      
      // Start next round
      startNewRound();
      
    } else {
      console.log('❌ Connection is INVALID');
      
      // 🆕 Store the failed attempt result
      setConnectionResult({
        success: false,
        attemptedType: connectionType,
        targetCard: targetCard
      });
      
      // Card goes back to pool - don't add usedMovieIds
      // Stay in decision phase so user can try again or save token
      alert(language === 'he' 
        ? `לא נכון - אין קשר מסוג '${connectionType}'`
        : `Incorrect - no connection of type '${connectionType}' found`
      );
    }
  };

  // Handle save token
  const handleSaveToken = async () => {
    console.log('🎫 Token saved');

    const newState = {
      ...state,
      phase: 'playing'
    };

    setState(newState);
    setConnectionResult(null); // 🆕 Clear connection result
    await updateGameState(newState);

    console.log('🔓 Token saved - UNLOCKING');
    setIsLocked(false);

    console.log('⏭️ Switching to next round...');
    startNewRound();
  };

  // Loading
  if (loading) {
    return (
      <div className="game-screen loading">
        <div className="loading-spinner"></div>
        <p>{t('loading') || 'Loading game...'}</p>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="game-screen error">
        <h2>{t('error') || 'Error'}</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/')}>
          {t('back_to_home') || 'Back to Home'}
        </button>
      </div>
    );
  }

  // No state
  if (!state) {
    return (
      <div className="game-screen loading">
        <p>{t('loading') || 'Loading...'}</p>
      </div>
    );
  }

  // Render game
  const currentTeamCards = state.currentTurn === 'A' ? state.teamA.cards : state.teamB.cards;

  return (
    <div className="game-screen">
      {/* Header */}
      <div className="game-header">
        <h1 className="game-title">
          {t('app_title') || 'MOVIE CHAIN'} - {t('room')} {roomCode}
        </h1>
        <div className="game-info">
          <div className="team-info">
            <span className="team-label">{t('team_a')}</span>
            <span className="team-score">
              {t('cards')}: {state.teamA.cards.length}/10 | {t('tokens')}: {state.teamA.tokens}
            </span>
          </div>
          <div className="team-info">
            <span className="team-label">{t('team_b')}</span>
            <span className="team-score">
              {t('cards')}: {state.teamB.cards.length}/10 | {t('tokens')}: {state.teamB.tokens}
            </span>
          </div>
        </div>
        <div className="current-turn">
          {t('current_turn')}: {state.currentTurn === 'A' ? t('team_a') : t('team_b')}
        </div>
      </div>

      {/* Game Content */}
      <div className="game-content">
        {/* Trailer Phase */}
        {state.phase === 'trailer' && state.currentMovie && (
          <TrailerPlayer
            movieId={state.currentMovie.id}
            onTrailerEnd={handleTrailerEnd}
          />
        )}

        {/* Answering Phase */}
        {state.phase === 'answering' && (
          <div className="answering-phase">
            <h2>{t('choose_answer')}</h2>
            <div className="answer-options">
              {answerOptions.map((option, index) => (
                <button
                  key={index}
                  className={`answer-option ${selectedAnswer === option ? 'selected' : ''}`}
                  onClick={() => handleAnswerSelect(option)}
                  disabled={selectedAnswer !== null}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Decision Phase */}
        {state.phase === 'decision' && state.currentMovie && (
          <DecisionPhase
            wonCard={state.currentMovie}
            teamCards={currentTeamCards}
            onConnect={handleConnectionAttempt}
            onSaveToken={handleSaveToken}
            language={language}
            connectionResult={connectionResult} // 🆕 ADD THIS LINE
          />
        )}

        {/* Finished Phase */}
        {state.phase === 'finished' && (
          <div className="game-finished">
            <h1>{t('game_over')}</h1>
            {state.winner ? (
              <h2>
                {state.winner === 'A' ? t('team_a') : t('team_b')} {t('wins')}!
              </h2>
            ) : (
              <h2>{t('draw')}</h2>
            )}
            <button onClick={() => navigate('/')}>
              {t('back_to_home')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default GameScreen;