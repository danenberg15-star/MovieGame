// src/screens/GameScreen.js
import React, { useState, useEffect, useCallback } from 'react';
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
  getNextRequiredConnectionType
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

  // Get current language
  const language = i18n.language;

 // Start new round
const startNewRound = useCallback((state, movies, reqConnectionType) => {
    console.log('🔄 Starting new round...');
    console.log('🎨 Required connection type:', reqConnectionType);
    
    const nextMovie = selectNextMovie(
      movies,
      state.usedMovieIds,
      state.teamA.cards,
      state.teamB.cards,
      currentTurn,
      reqConnectionType
    );
  
    console.log('🎬 Next movie selected:', nextMovie);
  
    if (!nextMovie) {
      console.log('⚠️ No more movies - ending game');
      endGame(state);
      return;
    }
  
    setCurrentMovie(nextMovie);
    const options = generateAnswerOptions(nextMovie, movies, language);
    console.log('📝 Answer options generated:', options);
    
    setAnswerOptions(options);
    setEliminatedAnswers([]);
    setAttemptedTeams([]);
    setPhase('trailer');
    
    console.log('✅ Round started - Phase: trailer');
    showMessage(t('watch_trailer') || 'Watch the trailer carefully!', 'info');
  }, [language, t, currentTurn]);

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
          console.log('🎬 Starting round from existing state...');
          
          // Start the round
          startNewRound(existingState, movies, reqType);
        } else {
          console.log('🆕 Step 4: Initializing NEW game...');
          
          // Initialize new game
          const anchorCards = selectAnchorCards(movies);
          console.log('⚓ Anchor cards selected:', anchorCards);
          
          const initialState = initializeGameState(anchorCards, movies);
          initialState.lastConnectionType = null; // Start with no preference
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
          
          console.log('🎬 Starting first round...');
          // Start first round
          startNewRound(initialState, movies, 'actor');
        }

        setIsLoading(false);
        setGameInitialized(true);
        console.log('✅ Game initialization complete!');
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
  }, [roomCode, playerId, navigate, gameInitialized, startNewRound]);

  // Listen to game state changes - but DON'T override local phase
  useEffect(() => {
    if (!roomCode || !gameInitialized) return;

    console.log('👂 Setting up Firebase listener...');
    const gameStateRef = ref(database, `rooms/${roomCode}/gameState`);
    const unsubscribe = onValue(gameStateRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        console.log('🔥 Firebase update received - but keeping local phase');
        // Update game state but keep local phase control
        setGameState(data);
        setTeamAData(data.teamA);
        setTeamBData(data.teamB);
        setCurrentTurn(data.currentTurn);
        
        if (data.winner) {
          setWinner(data.winner);
          setPhase('finished');
        }
      }
    });

    return () => unsubscribe();
  }, [roomCode, gameInitialized]);

  // Handle trailer end
  const handleTrailerEnd = () => {
    console.log('🎬 Trailer ended - switching to answering phase');
    setPhase('answering');
    showMessage(
      currentTurn === myTeam 
        ? t('your_turn') 
        : `${t(currentTurn === 'A' ? 'team_a' : 'team_b')}'s turn`,
      'info'
    );

    // Bot's turn in QA mode
    if (isQAMode && currentTurn === 'B') {
      console.log('🤖 Bot turn - handling answer');
      handleBotAnswer();
    }
  };

  // Handle bot answer (QA Mode)
  const handleBotAnswer = async () => {
    console.log('🤖 Bot choosing answer...');
    const correctAnswer = currentMovie.title[language];
    const answer = await botPlayer.chooseAnswer(correctAnswer, answerOptions);
    console.log('🤖 Bot selected:', answer);
    
    setTimeout(() => {
      handleAnswerSelected(answer, answer === correctAnswer, 'B');
    }, 500);
  };

  // Handle answer selected
  const handleAnswerSelected = async (answer, isCorrect, team = currentTurn) => {
    console.log(`📝 Answer selected by Team ${team}:`, answer, 'Correct:', isCorrect);
    
    // Add to attempted teams
    setAttemptedTeams(prev => [...prev, team]);
    
    if (isCorrect) {
      // Correct answer - earn 1 token
      showMessage(t('correct') || '✅ Correct!', 'success');
      
      const updatedState = { ...gameState };
      if (team === 'A') {
        updatedState.teamA.tokens += 1;
        setTeamAData(prev => ({ ...prev, tokens: prev.tokens + 1 }));
      } else {
        updatedState.teamB.tokens += 1;
        setTeamBData(prev => ({ ...prev, tokens: prev.tokens + 1 }));
      }
      
      // Update Firebase
      await updateGameState(updatedState);
      
      // Move to decision phase
      setWonCard(currentMovie);
      setDecisionTeam(team);
      setPhase('decision');
      
      // Bot's decision in QA mode
      if (isQAMode && team === 'B') {
        setTimeout(() => {
          handleBotDecision();
        }, 1000);
      }
    } else {
      // Wrong answer
      showMessage(t('incorrect') || '❌ Incorrect', 'error');
      setEliminatedAnswers(prev => [...prev, answer]);
      
      // Check if both teams already attempted
      const bothAttempted = attemptedTeams.includes('A') && attemptedTeams.includes('B');
      
      if (bothAttempted) {
        // Both teams failed - card returns to pool
        showMessage(
          t('both_teams_failed') || '🔄 Both teams failed - card returns!',
          'warning'
        );
        
        setTimeout(() => {
          switchToNextRound();
        }, 2000);
      } else {
        // Switch turn to other team
        const nextTurn = team === 'A' ? 'B' : 'A';
        setCurrentTurn(nextTurn);
        
        console.log('🔄 Switching turn to:', nextTurn);
        
        showMessage(
          `${t(nextTurn === 'A' ? 'team_a' : 'team_b')}'s turn`,
          'info'
        );
        
        // Bot's turn in QA mode
        if (isQAMode && nextTurn === 'B') {
          setTimeout(() => {
            handleBotAnswer();
          }, 1000);
        }
      }
    }
  };

  // Handle bot decision (QA Mode)
  const handleBotDecision = async () => {
    const teamCards = teamBData.cards;
    const decision = await botPlayer.tryConnect(currentMovie, teamCards);
    
    setTimeout(() => {
      if (decision.action === 'connect') {
        handleConnect(decision.targetCard, decision.connectionType, 'B');
      } else {
        handleSaveToken('B');
      }
    }, 500);
  };

  // Handle connect attempt
  const handleConnect = async (targetCard, connectionType, team = decisionTeam) => {
    const validation = validateConnection(wonCard, targetCard, connectionType);
    
    if (validation.valid) {
      // Successful connection - earn 3 tokens
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
        endGame(updatedState, team);
        return;
      }
      
      // Continue to next round with new required type
      setTimeout(() => {
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
      setTimeout(() => {
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
    
    // Card stays in pool
    // Continue to next round (keep same required type)
    setTimeout(() => {
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
    setTimeout(() => setMessage(null), 3000);
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
          />
        )}
      </div>
    </div>
  );
}

export default GameScreen;