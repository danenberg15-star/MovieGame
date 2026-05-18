/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */


// src/screens/GameScreen.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ref, onValue, update, get } from 'firebase/database';
import { database } from '../firebase';
import './GameScreen.css';

// Components
import TeamStatus from '../components/TeamStatus';
import TrailerPlayer from '../components/TrailerPlayer';
import AnswerOptions from '../components/AnswerOptions';
import DecisionPhase from '../components/DecisionPhase';
import AnchorReveal from '../components/AnchorReveal';

// Utils
import {
  loadMoviesData,
  selectAnchorCards,
  selectNextMovie,
  generateAnswerOptions,
  validateConnection,
  getConnectionHint,
  checkWinCondition,
  initializeGameState,
  getSuccessMessage,
  getNextRequiredConnectionType,
  getConnectionPoints
} from '../utils/gameLogic';
import botPlayer from '../utils/botPlayer';

function GameScreen() {
  const { t, i18n } = useTranslation();
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const playerId = searchParams.get('playerId');

  // Game State
  const [gameState, setGameState] = useState(null);
  const [allMovies, setAllMovies] = useState([]);
  const [currentMovie, setCurrentMovie] = useState(null);
  const [answerOptions, setAnswerOptions] = useState([]);
  const [eliminatedAnswers, setEliminatedAnswers] = useState([]);
  const [requiredConnectionType, setRequiredConnectionType] = useState(null);
  
  // Phase Management
  const [phase, setPhase] = useState('loading');
  const [currentTurn, setCurrentTurn] = useState('A');
  const [attemptedTeams, setAttemptedTeams] = useState([]);
  
  // Anchor cards for reveal
  const [anchorCards, setAnchorCards] = useState(null);
  
  // Team Data
  const [teamAData, setTeamAData] = useState({ cards: [], tokens: 0 });
  const [teamBData, setTeamBData] = useState({ cards: [], tokens: 0 });
  
  // Player Info
  const [myTeam, setMyTeam] = useState(null);
  const [isQAMode, setIsQAMode] = useState(false);
  const [winner, setWinner] = useState(null);
  
  // Decision Phase
  const [wonCard, setWonCard] = useState(null);
  const [decisionTeam, setDecisionTeam] = useState(null);
  
  // UI State
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [gameInitialized, setGameInitialized] = useState(false);

  // STRONG lock - stays locked until trailer/answering/decision phases complete
  const isRoundActiveRef = useRef(false);
  const timeoutRefs = useRef([]);

  // Get current language
  const language = i18n.language;

  // Clear all timeouts
  const clearAllTimeouts = useCallback(() => {
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
  }, []);

  // Add timeout with tracking
  const addTimeout = useCallback((callback, delay) => {
    const id = setTimeout(() => {
      timeoutRefs.current = timeoutRefs.current.filter(tid => tid !== id);
      callback();
    }, delay);
    timeoutRefs.current.push(id);
    return id;
  }, []);

  // Start new round with STRONG lock
  const startNewRound = useCallback((state, movies, reqConnectionType) => {
    // STRONG LOCK - prevent ANY calls while round is active
    if (isRoundActiveRef.current) {
      console.log('🚫 startNewRound BLOCKED - round is active (phase:', phase, ')');
      return;
    }

    console.log('🔄 Starting new round...');
    console.log('🎨 Required connection type:', reqConnectionType);
    console.log('📊 Current usedMovieIds:', state.usedMovieIds);
    
    // LOCK IT
    isRoundActiveRef.current = true;
    console.log('🔒 ROUND LOCKED');

    const nextMovie = selectNextMovie(
      movies,
      state.usedMovieIds,
      state.teamA.cards,
      state.teamB.cards,
      currentTurn,
      reqConnectionType
    );
  
    console.log('🎬 Next movie selected:', nextMovie?.id, nextMovie?.title?.en);
  
    if (!nextMovie) {
      console.log('⚠️ No more movies - ending game');
      isRoundActiveRef.current = false;
      endGame(state);
      return;
    }
  
    // Add the selected movie to usedMovieIds
    const updatedState = { ...state };
    if (!updatedState.usedMovieIds.includes(nextMovie.id)) {
      updatedState.usedMovieIds.push(nextMovie.id);
      console.log('✅ Added movie to usedMovieIds:', nextMovie.id);
      
      // Update Firebase with new usedMovieIds
      updateGameState(updatedState);
    }
  
    setCurrentMovie(nextMovie);
    const options = generateAnswerOptions(nextMovie, movies, language);
    
    setAnswerOptions(options);
    setEliminatedAnswers([]);
    setAttemptedTeams([]);
    setPhase('trailer');
    
    console.log('✅ Round started - Phase: trailer - LOCK REMAINS');
    showMessage(t('watch_trailer') || 'Watch the trailer carefully!', 'info');
  }, [language, t, currentTurn, phase]);

  // Initialize game - ONLY ONCE
  useEffect(() => {
    if (gameInitialized) return;
    
    console.log('🚀 useEffect: Initialize game');
    
    const initGame = async () => {
      try {
        console.log('📥 Step 1: Starting game initialization...');
        setIsLoading(true);
        
        // Check if QA Mode
        const qaMode = roomCode === '99999';
        setIsQAMode(qaMode);
        console.log('🧪 QA Mode:', qaMode);

        // Load movies data
        console.log('📽️ Step 2: Loading movies data...');
        const movies = await loadMoviesData();
        console.log('✅ Movies loaded:', movies.length);
        setAllMovies(movies);

        if (movies.length === 0) {
          throw new Error('No movies data loaded');
        }

        // Get room data from Firebase
        console.log('🔥 Step 3: Getting room data from Firebase...');
        const roomRef = ref(database, `rooms/${roomCode}`);
        const roomSnapshot = await get(roomRef);
        
        if (!roomSnapshot.exists()) {
          throw new Error('Room not found');
        }

        const roomData = roomSnapshot.val();
        console.log('📦 Room data:', roomData);
        
        // Get my team
        const myPlayerData = roomData.players?.[playerId];
        if (myPlayerData) {
          setMyTeam(myPlayerData.team);
          console.log('👤 My team:', myPlayerData.team);
        }

        // Check if game already initialized
        if (roomData.gameState) {
          console.log('♻️ Step 4: Loading existing game state...');
          const existingState = roomData.gameState;
          
          setGameState(existingState);
          setTeamAData(existingState.teamA);
          setTeamBData(existingState.teamB);
          setCurrentTurn(existingState.currentTurn);
          
          // Load or initialize required connection type
          const reqType = existingState.lastConnectionType 
            ? getNextRequiredConnectionType(existingState.lastConnectionType)
            : 'actor';
          setRequiredConnectionType(reqType);
          
          console.log('✅ Existing game state loaded');
          
          // Skip anchor reveal if game already started
          setIsLoading(false);
          setGameInitialized(true);
          
          // DON'T start round here - let user continue from where they left off
          setPhase('trailer');
        } else {
          console.log('🆕 Step 4: Initializing NEW game...');
          
          // Initialize new game
          const selectedAnchors = selectAnchorCards(movies);
          console.log('⚓ Anchor cards selected:', selectedAnchors);
          
          setAnchorCards(selectedAnchors);
          
          const initialState = initializeGameState(selectedAnchors, movies);
          initialState.lastConnectionType = null;
          console.log('🎲 Initial state created:', initialState);
          
          // Save to Firebase
          console.log('💾 Saving to Firebase...');
          await update(roomRef, {
            gameState: initialState,
            status: 'playing'
          });

          setGameState(initialState);
          setTeamAData(initialState.teamA);
          setTeamBData(initialState.teamB);
          
          // First round starts with 'actor' connection type
          setRequiredConnectionType('actor');
          
          setIsLoading(false);
          setGameInitialized(true);
          
          // Show anchor reveal phase
          console.log('🎬 Showing anchor cards...');
          setPhase('anchor_reveal');
        }
      } catch (error) {
        console.error('❌ Error initializing game:', error);
        alert('Failed to initialize game: ' + error.message);
        navigate('/');
      }
    };

    if (roomCode && playerId) {
      initGame();
    } else {
      console.error('❌ Missing roomCode or playerId');
    }
  }, [roomCode, playerId, navigate]);

  // Listen to game state changes - UPDATE ONLY
  useEffect(() => {
    if (!roomCode || !gameInitialized) return;

    console.log('👂 Setting up Firebase listener...');
    const gameStateRef = ref(database, `rooms/${roomCode}/gameState`);
    const unsubscribe = onValue(gameStateRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        console.log('🔥 Firebase update - updating state ONLY (no round start)');
        setGameState(data);
        setTeamAData(data.teamA);
        setTeamBData(data.teamB);
        
        if (data.winner) {
          setWinner(data.winner);
          setPhase('finished');
          isRoundActiveRef.current = false;
        }
      }
    });

    return () => unsubscribe();
  }, [roomCode, gameInitialized]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      clearAllTimeouts();
    };
  }, [clearAllTimeouts]);

  // Anchor reveal continue
  const handleAnchorContinue = () => {
    console.log('✅ Anchor reveal done - starting first round');
    startNewRound(gameState, allMovies, 'actor');
  };

  // Trailer ends - UNLOCK here
  const handleTrailerEnd = () => {
    console.log('🎬 Trailer ended - switching to answering phase');
    setPhase('answering');
    // Lock STAYS - will unlock when answer is given
    
    // If QA Mode and Bot's turn, trigger bot answer
    if (isQAMode && currentTurn === 'B') {
      console.log('🤖 Bot turn - triggering answer in 500ms...');
      addTimeout(() => {
        const correctAnswer = currentMovie.title[language];
        
        botPlayer.chooseAnswer(
          correctAnswer,
          answerOptions,
          (selectedAnswer, isCorrect) => {
            console.log('🤖 Bot callback - selected:', selectedAnswer, 'correct:', isCorrect);
            handleAnswerSelected(selectedAnswer, isCorrect, 'B');
          }
        );
      }, 500);
    }
  };

  // Answer selected
  const handleAnswerSelected = async (selectedAnswer, isCorrect, team = currentTurn) => {
    console.log(`📝 Answer selected by Team ${team}:`, selectedAnswer, isCorrect ? '✅' : '❌');
    
    if (attemptedTeams.includes(team)) {
      console.log('⚠️ Team already attempted');
      return;
    }

    const newAttemptedTeams = [...attemptedTeams, team];
    setAttemptedTeams(newAttemptedTeams);

    if (isCorrect) {
      // Correct answer - earn token and go to decision phase
      showMessage(t('correct') || '✅ Correct!', 'success');
      
      // Award 1 token
      const updatedState = { ...gameState };
      if (team === 'A') {
        updatedState.teamA.tokens += 1;
        setTeamAData(prev => ({ ...prev, tokens: prev.tokens + 1 }));
      } else {
        updatedState.teamB.tokens += 1;
        setTeamBData(prev => ({ ...prev, tokens: prev.tokens + 1 }));
      }
      
      await updateGameState(updatedState);
      
      // Go to decision phase
      console.log('✅ Going to decision phase - LOCK STAYS');
      setWonCard(currentMovie);
      setDecisionTeam(team);
      setPhase('decision');
      
      // If QA Mode and Bot won, trigger bot decision
      if (isQAMode && team === 'B') {
        console.log('🤖 Bot won - triggering decision in 2s...');
        addTimeout(() => {
          botPlayer.makeDecision(
            currentMovie,
            teamBData.cards,
            (decision) => {
              console.log('🤖 Bot decision:', decision);
              if (decision.action === 'connect') {
                handleConnect(decision.targetCard, decision.connectionType, 'B');
              } else {
                handleSaveToken('B');
              }
            }
          );
        }, 2000);
      }
    } else {
      // Wrong answer
      showMessage(t('incorrect') || '❌ Incorrect', 'error');
      
      // Eliminate this answer
      setEliminatedAnswers(prev => [...prev, selectedAnswer]);
      
      // Check if both teams failed
      if (newAttemptedTeams.length >= 2) {
        showMessage(t('both_teams_failed') || '❌ Both teams failed - card will return!', 'warning');
        
        // UNLOCK and continue to next round
        console.log('🔓 Both teams failed - UNLOCKING');
        isRoundActiveRef.current = false;
        
        addTimeout(() => {
          switchToNextRound(requiredConnectionType);
        }, 2000);
      } else {
        // Switch to other team
        const nextTeam = team === 'A' ? 'B' : 'A';
        setCurrentTurn(nextTeam);
        
        console.log(`🔄 Switching to Team ${nextTeam} - LOCK STAYS`);
        
        // If QA Mode and Bot's turn, trigger bot answer
        if (isQAMode && nextTeam === 'B') {
          console.log('🤖 Bot turn after failed attempt - triggering in 1s...');
          addTimeout(() => {
            const correctAnswer = currentMovie.title[language];
            
            botPlayer.chooseAnswer(
              correctAnswer,
              answerOptions,
              (selectedAnswer, isCorrect) => {
                handleAnswerSelected(selectedAnswer, isCorrect, 'B');
              }
            );
          }, 1000);
        }
      }
    }
  };

// Handle connection attempt
const handleConnect = async (targetCard, connectionType, team = decisionTeam) => {
  // ✅ בדיקה קריטית - וודא שהכרטיסים קיימים
  if (!wonCard || !targetCard) {
    console.error('❌ Invalid cards for connection:', { wonCard, targetCard, team, connectionType });
    showMessage(t('error_invalid_cards') || 'Error: Invalid cards', 'error');
    return;
  }

  // ✅ בדיקה נוספת - וודא שיש title
  if (!wonCard.title || !targetCard.title) {
    console.error('❌ Cards missing title:', { wonCard, targetCard });
    showMessage(t('error_invalid_cards') || 'Error: Invalid cards', 'error');
    return;
  }

  console.log(`🔗 Team ${team} attempting to connect:`, wonCard.title.en, '→', targetCard.title.en, 'via', connectionType);
  
  // Validate connection
  const validation = validateConnection(wonCard, targetCard, connectionType);
  
  if (validation.valid) {
    // Success!
    const successMsg = getSuccessMessage(
      connectionType,
      validation.connection,
      language
    );
    showMessage(successMsg, 'success');
    
    // Add card to team + award 3 tokens
    const updatedState = { ...gameState };
    if (team === 'A') {
      updatedState.teamA.cards.push(wonCard);
      updatedState.teamA.tokens += 3;
      setTeamAData(prev => ({ 
        ...prev, 
        cards: [...prev.cards, wonCard],
        tokens: prev.tokens + 3
      }));
    } else {
      updatedState.teamB.cards.push(wonCard);
      updatedState.teamB.tokens += 3;
      setTeamBData(prev => ({ 
        ...prev, 
        cards: [...prev.cards, wonCard],
        tokens: prev.tokens + 3
      }));
    }
    
    // Update last connection type for diversity
    updatedState.lastConnectionType = connectionType;
    const nextReqType = getNextRequiredConnectionType(connectionType);
    setRequiredConnectionType(nextReqType);
    console.log(`🎨 Connection successful! Next required type: ${nextReqType}`);
    
    // Update Firebase
    await updateGameState(updatedState);
    
    // Check win condition
    const teamCards = team === 'A' ? updatedState.teamA.cards : updatedState.teamB.cards;
    if (checkWinCondition(teamCards)) {
      console.log('🔓 Game won - UNLOCKING');
      isRoundActiveRef.current = false;
      endGame(updatedState, team);
      return;
    }
    
    // Continue to next round with new required type
    console.log('🔓 Connection success - UNLOCKING for next round');
    isRoundActiveRef.current = false;
    
    addTimeout(() => {
      switchToNextRound(nextReqType);
    }, 2000);
  } else {
    // Failed connection - show hint
    const hint = getConnectionHint(wonCard, targetCard, language);
    showMessage(
      t('incorrect') + '\n💡 ' + hint.message,
      'error'
    );
    
    // Card stays in pool, continue to next round (keep same required type)
    console.log('🔓 Connection failed - UNLOCKING for next round');
    isRoundActiveRef.current = false;
    
    addTimeout(() => {
      switchToNextRound(requiredConnectionType);
    }, 3000);
  }
};

  // Handle save token
  const handleSaveToken = async (team = decisionTeam) => {
    showMessage(t('token_saved') || '🎫 Token saved!', 'info');
    
    // Award 1 token for saving
    const updatedState = { ...gameState };
    if (team === 'A') {
      updatedState.teamA.tokens += 1;
      setTeamAData(prev => ({ ...prev, tokens: prev.tokens + 1 }));
    } else {
      updatedState.teamB.tokens += 1;
      setTeamBData(prev => ({ ...prev, tokens: prev.tokens + 1 }));
    }
    
    await updateGameState(updatedState);
    
    // UNLOCK and continue to next round
    console.log('🔓 Token saved - UNLOCKING');
    isRoundActiveRef.current = false;
    
    addTimeout(() => {
      switchToNextRound(requiredConnectionType);
    }, 1500);
  };

  // Switch to next round
  const switchToNextRound = (nextReqType = requiredConnectionType) => {
    console.log('⏭️ Switching to next round...');
    const nextTurn = currentTurn === 'A' ? 'B' : 'A';
    setCurrentTurn(nextTurn);
    setWonCard(null);
    setDecisionTeam(null);
    
    startNewRound(gameState, allMovies, nextReqType);
  };

  // Update game state in Firebase
  const updateGameState = async (newState) => {
    try {
      const roomRef = ref(database, `rooms/${roomCode}/gameState`);
      await update(roomRef, newState);
      setGameState(newState);
    } catch (error) {
      console.error('Error updating game state:', error);
    }
  };

  // End game
  const endGame = async (state, winningTeam = null) => {
    console.log('🏁 Ending game...');
    let finalWinner = winningTeam;
    
    if (!finalWinner) {
      // Determine winner by card count
      if (state.teamA.cards.length >= 10) {
        finalWinner = 'A';
      } else if (state.teamB.cards.length >= 10) {
        finalWinner = 'B';
      }
    }
    
    setWinner(finalWinner);
    setPhase('finished');
    
    // Update Firebase
    const roomRef = ref(database, `rooms/${roomCode}/gameState`);
    await update(roomRef, {
      ...state,
      phase: 'finished',
      winner: finalWinner
    });
  };

  // Show message
  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    addTimeout(() => setMessage(null), 3000);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="game-screen loading">
        <div className="loading-spinner"></div>
        <p>{t('loading') || 'Loading game...'}</p>
      </div>
    );
  }

  // Anchor Reveal Phase
  if (phase === 'anchor_reveal' && anchorCards) {
    return (
      <AnchorReveal
        teamACard={anchorCards.teamA}
        teamBCard={anchorCards.teamB}
        onContinue={handleAnchorContinue}
        language={language}
      />
    );
  }

  // Finished state
  if (phase === 'finished' && winner) {
    return (
      <div className="game-screen finished">
        <div className="winner-container">
          <h1 className="winner-title">
            🏆 {t(winner === 'A' ? 'team_a' : 'team_b')} {t('wins') || 'Wins!'}
          </h1>
          <div className="final-scores">
            <div className="team-final-score">
              <h3>{t('team_a')}</h3>
              <p className="score">{teamAData.cards.length} {t('cards')}</p>
              <p className="tokens">{teamAData.tokens} {t('tokens')}</p>
            </div>
            <div className="vs">VS</div>
            <div className="team-final-score">
              <h3>{t('team_b')}</h3>
              <p className="score">{teamBData.cards.length} {t('cards')}</p>
              <p className="tokens">{teamBData.tokens} {t('tokens')}</p>
            </div>
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/')}
          >
            {t('play_again') || '🎮 Play Again'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-screen">
      <div className="container">
        {/* Message Banner */}
        {message && (
          <div className={`message-banner ${message.type}`}>
            {message.text}
          </div>
        )}

        {/* Team Status */}
        <TeamStatus 
          teamA={teamAData}
          teamB={teamBData}
          currentTurn={currentTurn}
        />

        {/* Trailer Phase */}
        {phase === 'trailer' && currentMovie && (
          <TrailerPlayer
            key={currentMovie.id}
            movieId={currentMovie.id}
            onTrailerEnd={handleTrailerEnd}
            autoPlay={true}
          />
        )}

        {/* Answering Phase */}
        {phase === 'answering' && currentMovie && (
          <AnswerOptions
            options={answerOptions}
            correctAnswer={currentMovie.title[language]}
            onAnswerSelected={(answer, isCorrect) => handleAnswerSelected(answer, isCorrect)}
            disabled={currentTurn !== myTeam && !isQAMode}
            eliminatedAnswers={eliminatedAnswers}
          />
        )}

        {/* Decision Phase */}
        {phase === 'decision' && wonCard && (
          <DecisionPhase
            wonCard={wonCard}
            teamCards={decisionTeam === 'A' ? teamAData.cards : teamBData.cards}
            onConnect={handleConnect}
            onSaveToken={handleSaveToken}
            language={language}
            disabled={decisionTeam !== myTeam && !isQAMode}
          />
        )}
      </div>
    </div>
  );
}

export default GameScreen;