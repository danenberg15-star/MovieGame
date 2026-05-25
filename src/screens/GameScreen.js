// src/screens/GameScreen.js
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './GameScreen.css';
import AnchorReveal from '../components/AnchorReveal';
import TrailerPlayer from '../components/TrailerPlayer';
import DecisionPhase from '../components/DecisionPhase';
import { useGameState } from '../hooks/useGameState';
import { useGameActions, normalizeAttempts } from '../hooks/useGameActions';
import { useBotPlayer } from '../hooks/useBotPlayer';
import { setActiveSession, clearActiveSession } from '../utils/activeSession';
import { pickOscarQuip } from '../utils/oscarQuips';
import OscarPopup from '../components/OscarPopup';

function GameScreen() {
  const navigate = useNavigate();
  const { roomCode } = useParams();
  const [playerId] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('playerId');
    if (fromUrl) {
      try {
        localStorage.setItem(`cinemaster_player_${roomCode}`, fromUrl);
      } catch {
        /* ignore */
      }
      return fromUrl;
    }
    try {
      const stored = localStorage.getItem(`cinemaster_player_${roomCode}`);
      if (stored) return stored;
    } catch {
      /* ignore */
    }
    const id = `player_${Date.now()}`;
    try {
      localStorage.setItem(`cinemaster_player_${roomCode}`, id);
    } catch {
      /* ignore */
    }
    return id;
  });

  // Restore playerId in URL after refresh / service-worker navigation (keeps team assignment)
  useEffect(() => {
    if (!roomCode) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('playerId') === playerId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('playerId', playerId);
    window.history.replaceState({}, '', url.toString());
  }, [roomCode, playerId]);

  // Track this as the active session so the player can resume after a
  // crash / incoming call / accidental swipe-away.
  useEffect(() => {
    if (!roomCode || !playerId) return;
    setActiveSession({ roomCode, playerId, screen: 'game' });
  }, [roomCode, playerId]);

  const language = 'en';
  const isQAMode = roomCode === '99999';
  const [botIsThinking, setBotIsThinking] = useState(false);

  // Oscar-style feedback popup. We funnel both "you guessed the movie" and
  // "you connected/failed a card" through the same award-ceremony popup.
  const [oscarPopup, setOscarPopup] = useState(null);
  // { variant: 'success'|'failure', quip: string, subText?: string }
  
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

  const currentTeam = gameState?.playerTeams?.[playerId] ?? null;
  const teamKnown = currentTeam === 'A' || currentTeam === 'B';
  
  const attempts = normalizeAttempts(gameState?.currentMovieAttempts);
  const botAlreadyTried = attempts.includes('B');
  const myTeamAlreadyTried = teamKnown && attempts.includes(currentTeam);

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
    setSelectedAnswer,
    setShowResult,
    setResultMessage,
    setIsCorrect,
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

  // Multiplayer: currentTurn in Firebase switches to steal team after a wrong guess
  const isMyTurn = teamKnown && (isQAMode
    ? (currentTeam === 'A' && !attempts.includes('A')) ||
      (currentTeam === 'B' && !botAlreadyTried)
    : !myTeamAlreadyTried && gameState?.currentTurn === currentTeam);

  const canAnswer =
    isMyTurn && trailerReadyForAnswers && !selectedAnswer && !botIsThinking;

  // During decision, keep the won movie even if Firebase drops currentMovie
  const wonCardForDecision = useMemo(() => {
    if (currentMovie) return currentMovie;
    const movieId = gameState?.wonCard?.movieId;
    if (!movieId || !allMovies?.length) return null;
    return allMovies.find((m) => String(m.id) === String(movieId)) ?? null;
  }, [currentMovie, gameState?.wonCard?.movieId, allMovies]);

  const decisionTeam = gameState?.wonCard?.team ?? currentTeam;
  const decisionTeamCards =
    decisionTeam === 'A'
      ? gameState?.teamA?.cards || []
      : gameState?.teamB?.cards || [];

  // Show an Oscar popup right after a correct trailer guess.
  // This fires when the round transitions to the decision phase.
  useEffect(() => {
    if (phase === 'decision' && gameState?.wonCard) {
      const quip = pickOscarQuip({ success: true, language });
      setOscarPopup({
        variant: 'success',
        quip,
        subText: language === 'he' ? '+1 אסימון' : '+1 Token',
        duration: 2200,
      });
    }
  }, [phase, gameState?.wonCard, language]);

  // Show an Oscar popup for connection results (connect / buy / fail).
  useEffect(() => {
    if (!connectionResult) return;
    const quip = pickOscarQuip({
      success: connectionResult.success,
      language,
      value: connectionResult.value,
    });
    const subText = connectionResult.success
      ? (language === 'he' ? 'הקלף שלך' : 'Card won')
      : (language === 'he' ? 'הקלף חוזר' : 'Card returns');
    setOscarPopup({
      variant: connectionResult.success ? 'success' : 'failure',
      quip,
      subText,
      duration: 3000,
    });
  }, [connectionResult, language]);

  // When trailer ends: always transition locally; active team writes to Firebase
  const handleTrailerEnd = useCallback(async () => {
    const movieId = gameState?.currentMovie?.id;
    if (phase !== 'playing' || !movieId) return;

    if (trailerEndedForMovieRef.current === movieId) return;
    trailerEndedForMovieRef.current = movieId;

    console.log('🎬 Trailer ended — showing answer options');
    setLocalTrailerWatched(true);

    const activeTurn = gameState.currentTurn;
    if (teamKnown && currentTeam === activeTurn) {
      setSelectedAnswer(null);
      setShowResult(false);
      setResultMessage('');
      setIsCorrect(false);
    }

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
    teamKnown,
    isQAMode,
    markTrailerWatched,
    setSelectedAnswer,
    setShowResult,
    setResultMessage,
    setIsCorrect
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

              <button onClick={() => { clearActiveSession(); navigate('/'); }}>
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
              wonCard={wonCardForDecision}
              teamCards={decisionTeamCards}
              teamTokens={
                (decisionTeam === 'A' ? teamAData.tokens : teamBData.tokens) || 0
              }
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
                  {!teamKnown && (
                    <p className="turn-hint" style={{ textAlign: 'center', marginBottom: '12px', color: '#ff9800' }}>
                      {language === 'he'
                        ? 'מזהה שחקן לא נמצא — רענן מהלובי עם אותו קישור'
                        : 'Player identity missing — rejoin from lobby with the same link'}
                    </p>
                  )}
                  {gameState?.currentTurn && teamKnown && (
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
                        disabled={!canAnswer}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  
                  {/* For "wrong answer" we still show a small inline message;
                      correct answers are celebrated via the Oscar popup. */}
                  {showResult && !isCorrect && (
                    <div className="result-message result-message--wrong">
                      {resultMessage}
                    </div>
                  )}
                </div>
              )}
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

      <OscarPopup
        open={!!oscarPopup}
        variant={oscarPopup?.variant}
        quip={oscarPopup?.quip}
        subText={oscarPopup?.subText}
        duration={oscarPopup?.duration || 3000}
        onClose={() => setOscarPopup(null)}
      />
    </div>
  );
}

export default GameScreen;