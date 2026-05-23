// src/screens/GameScreen.js

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './GameScreen.css';
import AnchorReveal from '../components/AnchorReveal';
import TrailerPlayer from '../components/TrailerPlayer';
import DecisionPhase from '../components/DecisionPhase';
import { useGameState } from '../hooks/useGameState';
import { useGameActions } from '../hooks/useGameActions';
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
  const isMyTurn = gameState?.currentTurn === currentTeam;
  const trailerReady =
    gameState?.currentMovie?.trailerWatchedForTurn === gameState?.currentTurn;

  // Custom hook for game actions
  const {
    startNextRound,
    handleConnectionAttempt,
    handleSaveToken,
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
    setPhase
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

  // When active team finishes trailer locally, sync to Firebase for all clients
  const handleTrailerEnd = useCallback(() => {
    if (phase !== 'playing' || !gameState?.currentMovie?.id) return;

    const canMarkWatched =
      isMyTurn || (isQAMode && gameState.currentTurn === 'B');

    if (!canMarkWatched) {
      console.log('🎬 Trailer ended locally (observer) — waiting for active team');
      return;
    }

    console.log('🎬 Trailer ended — marking watched for team', gameState.currentTurn);
    markTrailerWatched();
  }, [phase, gameState?.currentMovie?.id, gameState?.currentTurn, isMyTurn, isQAMode, markTrailerWatched]);

  // Custom hook for bot player
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
    (value) => {},
    (value) => {},
    (msg) => {},
    (show) => {},
    setRemovedAnswers,
    startNextRound,
    handleConnectionAttempt,
    handleSaveToken
  );

  // Translations
  const t = (key) => {
    const translations = {
      en: {
        team_a: 'Team A',
        team_b: 'Team B',
        cards: 'Cards',
        tokens: 'Tokens',
        your_turn: 'Your Turn',
        waiting: 'Waiting...',
        watching_trailer: 'Watch the trailer...',
        opponent_guessing: 'Opponent is choosing...',
        choose_answer: 'Choose the correct movie:',
        game_over: 'Game Over!',
        winner: 'Winner',
        back_home: 'Back to Home',
        success_message: 'Correct! +1 Token',
        now_connect: 'Now connect this movie to your collection'
      },
      he: {
        team_a: 'קבוצה א\'',
        team_b: 'קבוצה ב\'',
        cards: 'כרטיסים',
        tokens: 'אסימונים',
        your_turn: 'התור שלך',
        waiting: 'ממתין...',
        watching_trailer: 'צפו בטריילר...',
        opponent_guessing: 'היריב בוחר...',
        choose_answer: 'בחרו את הסרט הנכון:',
        game_over: 'המשחק הסתיים!',
        winner: 'מנצח',
        back_home: 'חזרה לדף הבית',
        success_message: 'כל הכבוד! +1 אסימון',
        now_connect: 'עכשיו שייכו את הסרט לאוסף שלכם'
      }
    };
    return translations[language]?.[key] || key;
  };

  if (loading || isInitializing) {
    return (
      <div className="game-screen loading">
        <div className="loading-spinner">🎬</div>
        <p>{language === 'he' ? 'טוען משחק...' : 'Loading game...'}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="game-screen error">
        <h2>{language === 'he' ? 'שגיאה' : 'Error'}</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/')}>
          {language === 'he' ? 'חזרה לדף הבית' : 'Back to Home'}
        </button>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="game-screen loading">
        <p>{language === 'he' ? 'ממתין למשחק...' : 'Waiting for game...'}</p>
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
    <div className={`game-screen ${language === 'he' ? 'rtl' : 'ltr'}`}>
      <div className="game-main-layout">
        
        {/* Left Sidebar - Team A */}
        <div className="team-sidebar left">
          <div className="team-sidebar-label">{t('team_a')}</div>
          
          <div className="team-stat">
            <div className="team-stat-icon">🎬</div>
            <div className="team-stat-value">{teamAData.cards.length}/10</div>
            <div className="team-stat-label">{t('cards')}</div>
          </div>
          
          <div className="team-stat">
            <div className="team-stat-icon">🎫</div>
            <div className="team-stat-value">{teamAData.tokens}</div>
            <div className="team-stat-label">{t('tokens')}</div>
          </div>

          {gameState.currentTurn === 'A' && (
            <div className="turn-indicator">
              {currentTeam === 'A' ? t('your_turn') : t('waiting')}
            </div>
          )}
        </div>

        {/* Center Content Area */}
        <div className="game-content">
          {/* Success Message Screen */}
          {showSuccessMessage && phase === 'decision' && (
            <div className="success-message-screen">
              <div className="success-icon">🎉</div>
              <h1 className="success-title">{t('success_message')}</h1>
              <p className="success-subtitle">{t('now_connect')}</p>
            </div>
          )}

          {/* Connection Result Message */}
          {showConnectionMessage && connectionResult && (
            <div className={`connection-message-screen ${connectionResult.success ? 'success' : 'failure'}`}>
              <div className="connection-icon">{connectionResult.success ? '✅' : '❌'}</div>
              <h1 className="connection-title">{connectionResult.message}</h1>
              {connectionResult.hint && (
                <p className="connection-hint">{connectionResult.hint}</p>
              )}
            </div>
          )}

          {/* Playing Phase */}
          {phase === 'playing' && currentMovie && !showSuccessMessage && !showConnectionMessage && (
            <div className="answering-phase">
              {!trailerReady ? (
                <div className="trailer-container">
                  <TrailerPlayer
                    key={`${currentMovie.id}-${gameState.currentTurn}`}
                    movieId={currentMovie.id}
                    onTrailerEnd={handleTrailerEnd}
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

          {/* Decision Phase */}
          {phase === 'decision' && !showSuccessMessage && !showConnectionMessage && gameState.wonCard && (
            <DecisionPhase
              wonCard={allMovies.find(m => m.id === gameState.wonCard.movieId)}
              teamCards={(gameState.wonCard.team === 'A' ? teamAData : teamBData).cards}
              onConnect={handleConnectionAttempt}
              onSaveToken={handleSaveToken}
              language={language}
              connectionResult={connectionResult}
              disabled={gameState.wonCard.team !== currentTeam}
            />
          )}
        </div>

        {/* Right Sidebar - Team B */}
        <div className="team-sidebar right">
          <div className="team-sidebar-label">{t('team_b')}</div>
          
          <div className="team-stat">
            <div className="team-stat-icon">🎬</div>
            <div className="team-stat-value">{teamBData.cards.length}/10</div>
            <div className="team-stat-label">{t('cards')}</div>
          </div>
          
          <div className="team-stat">
            <div className="team-stat-icon">🎫</div>
            <div className="team-stat-value">{teamBData.tokens}</div>
            <div className="team-stat-label">{t('tokens')}</div>
          </div>

          {gameState.currentTurn === 'B' && (
            <div className="turn-indicator">
              {currentTeam === 'B' ? t('your_turn') : t('waiting')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GameScreen;