// src/screens/GameScreen.js
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './GameScreen.css';
import AnchorReveal from '../components/AnchorReveal';
import TrailerPlayer from '../components/TrailerPlayer';
import DecisionPhase from '../components/DecisionPhase';
import { useGameState } from '../hooks/useGameState';
import { useGameActions, normalizeAttempts } from '../hooks/useGameActions';
import { useBotPlayer } from '../hooks/useBotPlayer';

function GameScreen() {
  const navigate = useNavigate();
  const { roomCode } = useParams();
  const searchParams = new URLSearchParams(window.location.search);
  const playerId = searchParams.get('playerId') || `player_${Date.now()}`;

  const language = 'en';
  const isQAMode = roomCode === '99999';
  const [botIsThinking, setBotIsThinking] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showConnectionMessage, setShowConnectionMessage] = useState(false);
  
  // Local state to track if trailer was watched for current movie
  const [localTrailerWatched, setLocalTrailerWatched] = useState(false);
  const trailerEndedForMovieRef = useRef(null);

  // Custom hook for game state management
  const {
    gameState,
    allMovies,
    loading,
    error,
    isInitializing,
    phase,
    setPhase,
    currentMovie,
    setCurrentMovie,
    answerOptions,
    setAnswerOptions,
    removedAnswers,
    setRemovedAnswers
  } = useGameState(roomCode, playerId, language);

  const currentTeam = gameState?.playerTeams?.[playerId] || 'A';
  
  const attempts = normalizeAttempts(gameState?.currentMovieAttempts);
  const botAlreadyTried = attempts.includes('B');
  const myTeamAlreadyTried = attempts.includes(currentTeam);

  // Multiplayer: currentTurn in Firebase switches to steal team after a wrong guess
  const isMyTurn = isQAMode
    ? (currentTeam === 'A' && !attempts.includes('A')) ||
      (currentTeam === 'B' && !botAlreadyTried)
    : !myTeamAlreadyTried && gameState?.currentTurn === currentTeam;

  // Trailer already played this round (Firebase — keeps all clients on the same screen)
  const trailerPlayedThisRound = !!gameState?.currentMovie?.trailerWatchedForTurn;

  // QA steal: after bot fails, player may guess without re-watching the trailer
  const canStealAfterBotTrailer =
    isQAMode && currentTeam === 'A' && botAlreadyTried;

  const trailerReadyForAnswers =
    trailerPlayedThisRound || localTrailerWatched || canStealAfterBotTrailer;

  const shouldShowTrailer =
    phase === 'playing' && currentMovie && !trailerReadyForAnswers;

  // Reset trailer flags when a new movie round starts
  useEffect(() => {
    if (!currentMovie?.id) return;
    if (trailerEndedForMovieRef.current !== currentMovie.id) {
      trailerEndedForMovieRef.current = null;
      setLocalTrailerWatched(false);
    }
  }, [currentMovie?.id]);

  // Sync from Firebase — when any client marks trailer watched, all clients show answers
  useEffect(() => {
    if (gameState?.currentMovie?.trailerWatchedForTurn) {
      setLocalTrailerWatched(true);
    }
  }, [gameState?.currentMovie?.trailerWatchedForTurn]);

  // Custom hook for game actions
  const {
    startNextRound,
    handleConnectionAttempt,
    handleSaveToken,
    handleBuyConnection,
    handleAnchorContinue,
    markTrailerWatched,
    handleAnswerSelect,
    selectedAnswer,
    showResult,
    resultMessage,
    isCorrect,
    connectionResult
  } = useGameActions(
    roomCode,
    gameState,
    allMovies,
    language,
    currentTeam,
    currentMovie,
    setCurrentMovie,
    setAnswerOptions,
    setRemovedAnswers,
    setPhase,
    localTrailerWatched
  );

  // Show success message when entering decision phase
  useEffect(() => {
    if (phase === 'decision' && gameState?.wonCard) {
      setShowSuccessMessage(true);
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [phase, gameState?.wonCard]);

  // Show connection result message
  useEffect(() => {
    if (connectionResult) {
      setShowConnectionMessage(true);
      const timer = setTimeout(() => {
        setShowConnectionMessage(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [connectionResult]);

  // When trailer ends: always transition locally; active team writes to Firebase
  const handleTrailerEnd = useCallback(async () => {
    const movieId = gameState?.currentMovie?.id;
    if (phase !== 'playing' || !movieId) return;

    if (trailerEndedForMovieRef.current === movieId) return;
    trailerEndedForMovieRef.current = movieId;

    console.log('🎬 Trailer ended — showing answer options');
    setLocalTrailerWatched(true);

    const activeTurn = gameState.currentTurn;
    const canWriteToFirebase =
      currentTeam === activeTurn || (isQAMode && activeTurn === 'B');

    if (canWriteToFirebase) {
      try {
        await markTrailerWatched();
      } catch (err) {
        console.error('❌ Failed to sync trailer watched to Firebase:', err);
      }
    }
  }, [
    phase,
    gameState?.currentMovie?.id,
    gameState?.currentTurn,
    currentTeam,
    isQAMode,
    markTrailerWatched
  ]);

  // Bot player hook - handles bot behavior in QA mode
  useBotPlayer(
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
    null,
    null,
    null,
    null,
    setRemovedAnswers,
    startNextRound,
    handleConnectionAttempt,
    handleSaveToken,
    handleBuyConnection,
    localTrailerWatched
  );

  // Translation helper
  const translations = {
    en: {
      loading: 'Loading...',
      error: 'Error',
      game_over: 'Game Over',
      winner: 'Winner',
      team_a: 'Team A',
      team_b: 'Team B',
      cards: 'cards',
      tokens: 'tokens',
      back_home: 'Back to Home',
      choose_answer: 'Choose the correct movie:',
      your_turn_to_guess: 'Your turn to guess!',
      waiting_for_guess: 'turn to guess',
      watching_trailer: 'Watching trailer...',
      waiting_for_decision: 'WAITING...',
      connect_or_save: 'Connect or Save Token'
    },
    he: {
      loading: 'טוען...',
      error: 'שגיאה',
      game_over: 'המשחק הסתיים',
      winner: 'המנצח',
      team_a: 'קבוצה A',
      team_b: 'קבוצה B',
      cards: 'קלפים',
      tokens: 'אסימונים',
      back_home: 'חזרה לדף הבית',
      choose_answer: 'בחר את הסרט הנכון:',
      your_turn_to_guess: 'תורך לנחש!',
      waiting_for_guess: 'תור לנחש',
      watching_trailer: 'צופה בטריילר...',
      waiting_for_decision: 'ממתין...',
      connect_or_save: 'חבר או שמור אסימון'
    }
  };

  const t = (key) => translations[language][key] || key;

  // Loading state
  if (loading || isInitializing) {
    return (
      <div className="game-screen">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="game-screen">
        <div className="error-screen">
          <h2>{t('error')}</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/')}>{t('back_home')}</button>
        </div>
      </div>
    );
  }

  // Anchor Reveal Screen
  if (phase === 'anchorReveal' || gameState.roundNumber === 0) {
    return (
      <AnchorReveal
        teamACard={gameState.teamA.cards[0]}
        teamBCard={gameState.teamB.cards[0]}
        onContinue={handleAnchorContinue}
        language={language}
      />
    );
  }

  // Game over screen
  if (phase === 'finished') {
    return (
      <div className="game-screen">
        <div className="game-main-layout">
          <div className="game-content">
            <div className="game-finished">
              <h1>🏆 {t('game_over')}</h1>
              <h2>{t('winner')}: {t(`team_${gameState.winner.toLowerCase()}`)}</h2>
              
              <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '30px' }}>
                <div>
                  <h3>{t('team_a')}</h3>
                  <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {gameState.teamA?.cards?.length || 0} {t('cards')}
                  </p>
                </div>
                <div>
                  <h3>{t('team_b')}</h3>
                  <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {gameState.teamB?.cards?.length || 0} {t('cards')}
                  </p>
                </div>
              </div>

              <button onClick={() => navigate('/')}>
                {t('back_home')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Game Screen with Sidebars
  const teamAData = gameState.teamA || { cards: [], tokens: 0 };
  const teamBData = gameState.teamB || { cards: [], tokens: 0 };

  return (
    <div className="game-screen">
      <div className="game-main-layout">
        {/* Left Sidebar - Team A */}
        <div className={`team-sidebar team-a ${currentTeam === 'A' ? 'active' : ''}`}>
          <div className="team-header">
            <h2>TEAM A</h2>
            {currentTeam === 'A' && <span className="you-badge">YOU</span>}
          </div>
          
          <div className="team-stats">
            <div className="stat">
              <span className="stat-icon">🎬</span>
              <div className="stat-info">
                <span className="stat-value">{teamAData.cards?.length || 0}/10</span>
                <span className="stat-label">CARDS</span>
              </div>
            </div>
            
            <div className="stat">
              <span className="stat-icon">🎫</span>
              <div className="stat-info">
                <span className="stat-value">{teamAData.tokens || 0}</span>
                <span className="stat-label">TOKENS</span>
              </div>
            </div>
          </div>

          <div className="team-cards">
            {teamAData.cards?.map((card, index) => (
              <div key={index} className="card-item">
                <span className="card-number">{index + 1}</span>
                <span className="card-title">{card.title?.en || 'Unknown'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Main Game Content */}
        <div className="game-content">
          {phase === 'decision' ? (
            <DecisionPhase
              wonCard={currentMovie}
              teamCards={currentTeam === 'A' ? teamAData.cards : teamBData.cards}
              teamTokens={
                (gameState.wonCard?.team === 'A' ? teamAData.tokens : teamBData.tokens) || 0
              }
              allMovies={allMovies}
              onConnect={handleConnectionAttempt}
              onSaveToken={handleSaveToken}
              onBuyConnection={handleBuyConnection}
              language={language}
              disabled={gameState.wonCard?.team !== currentTeam}
            />
          ) : (
            <div className="playing-phase">
              {/* 🔥 FIXED: Show trailer only if not watched (local OR Firebase) */}
              {shouldShowTrailer ? (
                <div className="trailer-container">
                  <TrailerPlayer
                    movieId={currentMovie?.id}
                    onTrailerEnd={handleTrailerEnd}
                    language={language}
                    autoPlay={true}
                  />
                  {!isMyTurn && (
                    <p className="trailer-wait-hint" style={{ textAlign: 'center', marginTop: '12px', opacity: 0.85 }}>
                      {t('watching_trailer')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="answer-section">
                  <h2>{t('choose_answer')}</h2>
                  {gameState?.currentTurn && (
                    <p className="turn-hint" style={{ textAlign: 'center', marginBottom: '12px', opacity: 0.9 }}>
                      {isMyTurn
                        ? `▶ ${t('your_turn_to_guess')}`
                        : `${t(`team_${gameState.currentTurn.toLowerCase()}`)} — ${t('waiting_for_guess')}`}
                    </p>
                  )}
                  <div className="answer-grid">
                    {answerOptions.filter(opt => !removedAnswers.includes(opt)).map((option, index) => (
                      <button
                        key={index}
                        className={`answer-option ${selectedAnswer === option ? (isCorrect ? 'correct' : 'incorrect') : ''}`}
                        onClick={() => handleAnswerSelect(option, isMyTurn, botIsThinking)}
                        disabled={!isMyTurn || selectedAnswer || botIsThinking}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  
                  {showResult && (
                    <div className="result-message" style={{
                      marginTop: '15px',
                      padding: '12px',
                      borderRadius: '8px',
                      textAlign: 'center',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      background: isCorrect ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                      border: `2px solid ${isCorrect ? '#4caf50' : '#f44336'}`,
                      color: isCorrect ? '#4caf50' : '#f44336'
                    }}>
                      {resultMessage}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {showSuccessMessage && (
            <div className="success-overlay">
              <div className="success-message">
                <h2>🎉 Correct!</h2>
                <p>+1 Token</p>
              </div>
            </div>
          )}

          {showConnectionMessage && connectionResult && (
            <div className="connection-overlay">
              <div className={`connection-message ${connectionResult.success ? 'success' : 'failure'}`}>
                <h2>{connectionResult.success ? '✅' : '❌'} {connectionResult.message}</h2>
                {connectionResult.hint && <p>{connectionResult.hint}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Team B */}
        <div className={`team-sidebar team-b ${currentTeam === 'B' ? 'active' : ''}`}>
          <div className="team-header">
            <h2>TEAM B</h2>
            {currentTeam === 'B' && <span className="you-badge">YOU</span>}
          </div>
          
          <div className="team-stats">
            <div className="stat">
              <span className="stat-icon">🎬</span>
              <div className="stat-info">
                <span className="stat-value">{teamBData.cards?.length || 0}/10</span>
                <span className="stat-label">CARDS</span>
              </div>
            </div>
            
            <div className="stat">
              <span className="stat-icon">🎫</span>
              <div className="stat-info">
                <span className="stat-value">{teamBData.tokens || 0}</span>
                <span className="stat-label">TOKENS</span>
              </div>
            </div>
          </div>

          <div className="team-cards">
            {teamBData.cards?.map((card, index) => (
              <div key={index} className="card-item">
                <span className="card-number">{index + 1}</span>
                <span className="card-title">{card.title?.en || 'Unknown'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default GameScreen;