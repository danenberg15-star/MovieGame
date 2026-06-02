// src/screens/GameScreen.js
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './GameScreen.css';
import AnchorReveal from '../components/AnchorReveal';
import TrailerPlayer from '../components/TrailerPlayer';
import DecisionPhase from '../components/DecisionPhase';
import VictoryScreen from '../components/VictoryScreen';
import { useGameState } from '../hooks/useGameState';
import { useGameActions, normalizeAttempts } from '../hooks/useGameActions';
import { useBotPlayer } from '../hooks/useBotPlayer';
import { preloadTrailer } from '../utils/gameLogic';
import { getTrailerUrl } from '../utils/trailerUrl';
import { setActiveSession, clearActiveSession, getActiveSession } from '../utils/activeSession';
import { pickOscarQuip } from '../utils/oscarQuips';
import OscarPopup from '../components/OscarPopup';

/* ----- Projection-room sidebar panel ----- */
function TeamSidebar({ side, label, mine, cards, tokens }) {
  const { t } = useTranslation();
  return (
    <aside
      className={`team-sidebar team-sidebar--${side}${mine ? ' team-sidebar--mine' : ''}`}
      aria-label={label}
    >
      <div className="team-sidebar__header">
        <span className="team-sidebar__label">{label}</span>
        {mine && <span className="team-sidebar__you">{t('you_label')}</span>}
      </div>

      <div className="team-sidebar__gauges">
        <div className="team-gauge">
          <FilmReelIcon />
          <span className="team-gauge__value">{cards}<span className="team-gauge__total">/10</span></span>
          <span className="team-gauge__label">{t('cards_label')}</span>
        </div>
        <div className="team-gauge">
          <CinemaTokenIcon />
          <span className="team-gauge__value">{tokens}</span>
          <span className="team-gauge__label">{t('tokens_label')}</span>
        </div>
      </div>
    </aside>
  );
}

/* Golden physical film reel — SVG */
function FilmReelIcon() {
  return (
    <svg className="team-sidebar__icon team-sidebar__icon--reel" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <radialGradient id="reelGold" cx="35%" cy="30%" r="75%">
          <stop offset="0%"  stopColor="#fff5c2" />
          <stop offset="35%" stopColor="#ffd766" />
          <stop offset="75%" stopColor="#b8862d" />
          <stop offset="100%" stopColor="#6b4d12" />
        </radialGradient>
        <radialGradient id="reelInner" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#3a2a0a" />
          <stop offset="100%" stopColor="#1a1004" />
        </radialGradient>
      </defs>
      {/* Outer disc */}
      <circle cx="24" cy="24" r="22" fill="url(#reelGold)" stroke="#5a3f10" strokeWidth="0.8" />
      <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(255,248,214,0.45)" strokeWidth="0.6" />
      {/* Holes around the rim */}
      <g fill="url(#reelInner)" stroke="#3a2a0a" strokeWidth="0.4">
        <circle cx="24" cy="10" r="3" />
        <circle cx="36" cy="17" r="3" />
        <circle cx="36" cy="31" r="3" />
        <circle cx="24" cy="38" r="3" />
        <circle cx="12" cy="31" r="3" />
        <circle cx="12" cy="17" r="3" />
      </g>
      {/* Central hub */}
      <circle cx="24" cy="24" r="5" fill="url(#reelInner)" stroke="#8c6320" strokeWidth="0.8" />
      <circle cx="24" cy="24" r="2" fill="#fff5c2" />
      {/* Sheen */}
      <ellipse cx="17" cy="14" rx="6" ry="3" fill="rgba(255,255,255,0.45)" />
    </svg>
  );
}

/* Casino-style cinema token — SVG */
function CinemaTokenIcon() {
  return (
    <svg className="team-sidebar__icon team-sidebar__icon--token" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <radialGradient id="tokenGold" cx="35%" cy="30%" r="80%">
          <stop offset="0%"  stopColor="#fff5c2" />
          <stop offset="35%" stopColor="#ffd766" />
          <stop offset="80%" stopColor="#b8862d" />
          <stop offset="100%" stopColor="#6b4d12" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#tokenGold)" stroke="#5a3f10" strokeWidth="0.8" />
      {/* Notched outer rim */}
      <g fill="#3a2a0a">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <rect
            key={deg}
            x="23"
            y="2"
            width="2"
            height="4"
            transform={`rotate(${deg} 24 24)`}
          />
        ))}
      </g>
      {/* Inner ring */}
      <circle cx="24" cy="24" r="15" fill="none" stroke="#5a3f10" strokeWidth="1" />
      <circle cx="24" cy="24" r="13" fill="none" stroke="rgba(255,248,214,0.45)" strokeWidth="0.5" />
      {/* Center star */}
      <path
        d="M24 12 L26.4 19.6 L34 19.6 L27.8 24 L30.2 31.4 L24 27 L17.8 31.4 L20.2 24 L14 19.6 L21.6 19.6 Z"
        fill="#3a2a0a"
      />
      {/* Sheen */}
      <ellipse cx="17" cy="14" rx="6" ry="3" fill="rgba(255,255,255,0.45)" />
    </svg>
  );
}

function GameScreen() {
  const navigate = useNavigate();
  const { roomCode } = useParams();
  const [playerId] = useState(() => {
    const persist = (id) => {
      try {
        localStorage.setItem(`cinemaster_player_${roomCode}`, id);
      } catch {
        /* ignore */
      }
      return id;
    };

    const fromUrl = new URLSearchParams(window.location.search).get('playerId');
    if (fromUrl) return persist(fromUrl);

    try {
      const stored = localStorage.getItem(`cinemaster_player_${roomCode}`);
      if (stored) return stored;
    } catch {
      /* ignore */
    }

    const session = getActiveSession();
    if (session?.roomCode === roomCode && session.playerId) {
      return persist(session.playerId);
    }

    return null;
  });

  useEffect(() => {
    if (playerId || !roomCode) return;
    navigate(`/lobby/${roomCode}`, { replace: true });
  }, [playerId, roomCode, navigate]);

  // Restore playerId in URL after refresh / service-worker navigation (keeps team assignment)
  useEffect(() => {
    if (!roomCode || !playerId) return;
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

  const { t, i18n } = useTranslation();
  const language = i18n.language === 'he' ? 'he' : 'en';
  const [botIsThinking, setBotIsThinking] = useState(false);

  // Oscar-style feedback popup. We funnel both "you guessed the movie" and
  // "you connected/failed a card" through the same award-ceremony popup.
  const [oscarPopup, setOscarPopup] = useState(null);
  // { variant: 'success'|'failure', quip: string, subText?: string }
  
  // Local state to track if trailer was watched for current movie
  const [localTrailerWatched, setLocalTrailerWatched] = useState(false);
  const trailerEndedForMovieRef = useRef(null);
  const lastRoundNumberRef = useRef(null);

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
    setRemovedAnswers,
    currentPlayerTeam
  } = useGameState(roomCode, playerId, language);

  const isBotMode = Boolean(gameState?.isBotMode || gameState?.isQAMode);
  const isRaceMode = Boolean(gameState?.isRaceMode);

  const currentTeam = currentPlayerTeam;
  const teamKnown = currentTeam === 'A' || currentTeam === 'B';
  
  const attempts = normalizeAttempts(gameState?.currentMovieAttempts);
  const botAlreadyTried = attempts.includes('B');
  const myTeamAlreadyTried = teamKnown && attempts.includes(currentTeam);

  // Trailer already played this round (Firebase — keeps all clients on the same screen)
  const trailerPlayedThisRound = !!gameState?.currentMovie?.trailerWatchedForTurn;

  // QA steal: after bot fails, player may guess without re-watching the trailer
  const canStealAfterBotTrailer =
    isBotMode && currentTeam === 'A' && botAlreadyTried;

  const trailerReadyForAnswers =
    isRaceMode ||
    trailerPlayedThisRound ||
    localTrailerWatched ||
    canStealAfterBotTrailer;

  const shouldShowTrailer =
    phase === 'playing' && currentMovie && !trailerReadyForAnswers;

  // Reset trailer flags when Firebase advances roundNumber (new trailer round).
  // Also reset when movie id changes — covers re-picks of the same movie id.
  useEffect(() => {
    const rn = gameState?.roundNumber;
    if (rn != null && lastRoundNumberRef.current !== rn) {
      lastRoundNumberRef.current = rn;
      trailerEndedForMovieRef.current = null;
      setLocalTrailerWatched(false);
      return;
    }
    if (!currentMovie?.id) return;
    if (trailerEndedForMovieRef.current !== currentMovie.id) {
      trailerEndedForMovieRef.current = null;
      setLocalTrailerWatched(false);
    }
  }, [gameState?.roundNumber, currentMovie?.id]);

  // Sync from Firebase — when any client marks trailer watched, all clients show answers
  useEffect(() => {
    if (gameState?.currentMovie?.trailerWatchedForTurn) {
      setLocalTrailerWatched(true);
    }
  }, [gameState?.currentMovie?.trailerWatchedForTurn]);

  useEffect(() => {
    if (phase !== 'anchorReveal') return;
    const firstMovieId = gameState?.pendingFirstRound?.movieId;
    if (!firstMovieId) return;

    preloadTrailer(firstMovieId).catch((error) => {
      console.warn('⚠️ Failed to warm first trailer on anchor screen:', error);
    });
  }, [phase, gameState?.pendingFirstRound?.movieId]);

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

  // Multiplayer: currentTurn in Firebase switches to steal team after a wrong guess.
  // Race-the-Clock: every human team can answer every round (no turn rotation).
  let isMyTurn = false;
  if (teamKnown) {
    if (isRaceMode) {
      isMyTurn = true;
    } else if (isBotMode) {
      isMyTurn =
        (currentTeam === 'A' && !attempts.includes('A')) ||
        (currentTeam === 'B' && !botAlreadyTried);
    } else {
      isMyTurn = !myTeamAlreadyTried && gameState?.currentTurn === currentTeam;
    }
  }

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
      ? t('card_won')
      : t('card_returns');
    setOscarPopup({
      variant: connectionResult.success ? 'success' : 'failure',
      quip,
      subText,
      duration: 2500,
    });
  }, [connectionResult, language, t]);

  // Pick a deterministic "primary" client so trailer-expired round advances happen exactly once.
  const primaryPlayerId = useMemo(() => {
    const ids = Object.keys(gameState?.players || {})
      .filter((id) => id !== 'bot_player')
      .sort();
    return ids[0] || null;
  }, [gameState?.players]);
  const isPrimaryClient = !!playerId && primaryPlayerId === playerId;

  // When trailer ends: always transition locally; active team writes to Firebase
  const handleTrailerEnd = useCallback(async () => {
    const movieId = gameState?.currentMovie?.id;
    if (phase !== 'playing' || !movieId) return;

    if (trailerEndedForMovieRef.current === movieId) return;
    trailerEndedForMovieRef.current = movieId;

    console.log('🎬 Trailer ended — showing answer options');
    setLocalTrailerWatched(true);

    const activeTurn = gameState.currentTurn;
    if (teamKnown && (isRaceMode || currentTeam === activeTurn)) {
      setSelectedAnswer(null);
      setShowResult(false);
      setResultMessage('');
      setIsCorrect(false);
    }

    // Race-the-Clock: nobody guessed before the trailer finished → roast and advance.
    if (isRaceMode && !gameState?.wonCard) {
      const quip = pickOscarQuip({ success: false, language });
      setOscarPopup({
        variant: 'failure',
        quip,
        subText: t('card_returns'),
        duration: 2200,
      });
      if (isPrimaryClient) {
        setTimeout(() => {
          startNextRound();
        }, 1500);
      }
      return;
    }

    // Race mode: any client may finalise the "trailer watched" signal.
    const canWriteToFirebase =
      isRaceMode ||
      currentTeam === activeTurn ||
      (isBotMode && activeTurn === 'B');

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
    gameState?.wonCard,
    currentTeam,
    teamKnown,
    isBotMode,
    isRaceMode,
    isPrimaryClient,
    language,
    t,
    startNextRound,
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
    isBotMode,
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
      />
    );
  }

  // Game over screen — cinematic victory celebration for winners,
  // cinematic defeat screen for losers (variant picked inside the
  // component based on `myTeam` vs `winner`).
  if (phase === 'finished') {
    return (
      <VictoryScreen
        winner={gameState.winner}
        myTeam={currentTeam}
        teamACards={gameState.teamA?.cards?.length || 0}
        teamBCards={gameState.teamB?.cards?.length || 0}
        onBackHome={() => { clearActiveSession(); navigate('/'); }}
      />
    );
  }

  // Main Game Screen with Sidebars
  const teamAData = gameState.teamA || { cards: [], tokens: 0 };
  const teamBData = gameState.teamB || { cards: [], tokens: 0 };

  return (
    <div className="game-screen">
      <div className="game-main-layout">
        <TeamSidebar
          side="left"
          label={t('team_label_a')}
          mine={currentTeam === 'A'}
          cards={teamAData.cards?.length || 0}
          tokens={teamAData.tokens || 0}
        />

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
              disabled={gameState.wonCard?.team !== currentTeam}
            />
          ) : (
            <div className={`playing-phase${isRaceMode && currentMovie ? ' playing-phase--race' : ''}`}>
              {/* Race-the-Clock: trailer + answers visible together */}
              {isRaceMode && currentMovie ? (
                <>
                  <div className="trailer-container race-trailer">
                    <TrailerPlayer
                      movieId={currentMovie?.id}
                      trailerSrc={getTrailerUrl(currentMovie)}
                      onTrailerEnd={handleTrailerEnd}
                      language={language}
                      autoPlay={true}
                    />
                  </div>
                  <div className="answer-section race-answers">
                    {!teamKnown && (
                      <p className="turn-hint" style={{ textAlign: 'center', marginBottom: '8px', color: '#ff9800' }}>
                        {t('player_id_missing')}
                      </p>
                    )}
                    {teamKnown && (
                      <p className="turn-hint" style={{ textAlign: 'center', marginBottom: '8px', opacity: 0.9 }}>
                        {`⏱️ ${t('race_round_open')}`}
                      </p>
                    )}
                    <div className="answer-grid">
                      {answerOptions.filter((opt) => !removedAnswers.includes(opt)).map((option, index) => (
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
                    {showResult && !isCorrect && (
                      <div className="result-message result-message--wrong">
                        {resultMessage}
                      </div>
                    )}
                  </div>
                </>
              ) : shouldShowTrailer ? (
                <div className="trailer-container">
                  <TrailerPlayer
                    movieId={currentMovie?.id}
                    trailerSrc={getTrailerUrl(currentMovie)}
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
              ) : !currentMovie ? (
                /* Between rounds — show a cinematic "changing reels" placeholder
                   so the previous answer grid never flashes back while the new
                   movie + trailer are loading from Firebase. */
                <div className="reel-changeover" aria-live="polite">
                  <div className="reel-changeover__reel">
                    <FilmReelIcon />
                  </div>
                  <p className="reel-changeover__text">
                    {t('reel_changeover')}
                  </p>
                </div>
              ) : (
                <div className="answer-section">
                  <h2>{t('choose_answer')}</h2>
                  {!teamKnown && (
                    <p className="turn-hint" style={{ textAlign: 'center', marginBottom: '12px', color: '#ff9800' }}>
                      {t('player_id_missing')}
                    </p>
                  )}
                  {teamKnown && (
                    <p className="turn-hint" style={{ textAlign: 'center', marginBottom: '12px', opacity: 0.9 }}>
                      {isRaceMode
                        ? `⏱️ ${t('race_round_open')}`
                        : isMyTurn
                          ? `▶ ${t('your_turn_to_guess')}`
                          : `${t(`team_${(gameState?.currentTurn || 'A').toLowerCase()}`)} — ${t('waiting_for_guess')}`}
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

        <TeamSidebar
          side="right"
          label={t('team_label_b')}
          mine={currentTeam === 'B'}
          cards={teamBData.cards?.length || 0}
          tokens={teamBData.tokens || 0}
        />
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