// src/screens/HomeScreen.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ref, set, get } from 'firebase/database';
import { database } from '../firebase';
import {
  getActiveSession,
  clearActiveSession,
  buildResumeUrl,
} from '../utils/activeSession';
import { buildBotRoster } from '../utils/botRoom';
import './HomeScreen.css';

function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { roomCode: roomCodeFromUrl } = useParams();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [gameMode, setGameMode] = useState(null); // 'bot' | 'teams' | 'race'
  const [showHelp, setShowHelp] = useState(false);
  const [resumeSession, setResumeSession] = useState(null);

  // Cinema curtain intro — show once per browser session
  const [curtainState, setCurtainState] = useState(() => {
    if (typeof window === 'undefined') return 'done';
    return sessionStorage.getItem('curtainShown') === '1' ? 'done' : 'closed';
  });

  // Run the intro once on mount — do NOT depend on curtainState here.
  // When curtainState flips to 'opening', a [curtainState] effect would
  // cleanup and cancel the done-timer, leaving the curtain stuck forever.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('curtainShown') === '1') return;

    const openTimer = setTimeout(() => setCurtainState('opening'), 350);
    const doneTimer = setTimeout(() => {
      setCurtainState('done');
      sessionStorage.setItem('curtainShown', '1');
    }, 2400);
    return () => {
      clearTimeout(openTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  useEffect(() => {
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
      setPlayerName(savedName);
    }
  }, []);

  // If the user had an active game/lobby when they were interrupted
  // (incoming call, crash, accidental close), offer to resume.
  useEffect(() => {
    const session = getActiveSession();
    if (session) {
      setResumeSession(session);
    }
  }, []);

  const handleResume = () => {
    if (!resumeSession) return;
    const url = buildResumeUrl(resumeSession);
    if (url) navigate(url);
  };

  const handleDismissResume = () => {
    clearActiveSession();
    setResumeSession(null);
  };

  // Came via a shared invite link (/room/:roomCode) — preselect "teams"
  // mode and prefill the join code so the friend just types a name.
  useEffect(() => {
    if (!roomCodeFromUrl) return;
    const cleaned = roomCodeFromUrl.replace(/\D/g, '').slice(0, 4);
    if (!cleaned) return;
    setGameMode('teams');
    setRoomCode(cleaned);
  }, [roomCodeFromUrl]);

  const generateRoomCode = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  const validatePlayerName = () => {
    if (!playerName || playerName.trim().length < 2) {
      alert(t('enter_your_name') || 'Please enter your name (at least 2 characters)');
      return false;
    }
    return true;
  };

  const handleCreateGame = async ({ isRaceMode = false } = {}) => {
    if (!validatePlayerName()) return;

    setIsLoading(true);
    const newRoomCode = generateRoomCode();
    localStorage.setItem('playerName', playerName.trim());

    try {
      const roomRef = ref(database, `rooms/${newRoomCode}`);
      const playerId = 'player_' + Date.now();

      const baseRoom = {
        code: newRoomCode,
        host: playerId,
        created: Date.now(),
        status: 'waiting',
        teams: {
          teamA: [],
          teamB: []
        },
        players: {
          [playerId]: {
            id: playerId,
            name: playerName.trim(),
            team: null,
            seat: null,
            ready: false,
            isHost: true
          }
        }
      };

      if (isRaceMode) baseRoom.isRaceMode = true;

      await set(roomRef, baseRoom);

      navigate(`/lobby/${newRoomCode}?playerId=${playerId}`);
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create room. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinGame = async (overrideCode) => {
    if (!validatePlayerName()) return;

    const codeToJoin = typeof overrideCode === 'string' ? overrideCode : roomCode;

    if (!codeToJoin || codeToJoin.length !== 4) {
      alert(t('enter_room_code') || 'Please enter a valid 4-digit room code');
      return;
    }

    setIsLoading(true);
    localStorage.setItem('playerName', playerName.trim());

    try {
      const roomRef = ref(database, `rooms/${codeToJoin}`);
      const snapshot = await get(roomRef);

      if (snapshot.exists()) {
        const playerId = 'player_' + Date.now();
        const playerRef = ref(database, `rooms/${codeToJoin}/players/${playerId}`);
        await set(playerRef, {
          id: playerId,
          name: playerName.trim(),
          team: null,
          seat: null,
          ready: false,
          isHost: false
        });

        navigate(`/lobby/${codeToJoin}?playerId=${playerId}`);
      } else {
        alert('Room not found. Please check the code.');
      }
    } catch (error) {
      console.error('Error joining room:', error);
      alert('Failed to join room. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBotMode = async () => {
    if (!validatePlayerName()) return;

    setIsLoading(true);
    const newRoomCode = generateRoomCode();
    localStorage.setItem('playerName', playerName.trim());

    try {
      const playerId = 'player_' + Date.now();
      const lang = localStorage.getItem('preferredLanguage') || 'en';

      await set(ref(database, `rooms/${newRoomCode}`), {
        code: newRoomCode,
        host: playerId,
        created: Date.now(),
        status: 'waiting',
        isBotMode: true,
        teams: { teamA: [], teamB: [] },
        players: {
          [playerId]: {
            id: playerId,
            name: playerName.trim(),
            team: null,
            seat: null,
            ready: false,
            isHost: true,
          },
          ...buildBotRoster(lang),
        },
      });

      navigate(`/lobby/${newRoomCode}?playerId=${playerId}`);
    } catch (error) {
      console.error('Error creating bot room:', error);
      alert('Failed to start bot game. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const nameValid = playerName.trim().length >= 2;

  // Auto-submit the join form when 4 digits are entered (no Enter needed).
  // We guard with isLoading so quick paste / extra change events don't double-fire.
  const handleRoomCodeChange = (nextValue) => {
    const cleaned = nextValue.replace(/\D/g, '').slice(0, 4);
    setRoomCode(cleaned);
    if (cleaned.length === 4 && nameValid && !isLoading) {
      handleJoinGame(cleaned);
    }
  };

  return (
    <div className="home-screen">
      {curtainState !== 'done' && (
        <div
          className={`cinema-curtain ${curtainState === 'opening' ? 'is-open' : ''}`}
          aria-hidden="true"
        >
          <div className="cinema-curtain__panel cinema-curtain__panel--left">
            <div className="cinema-curtain__valance" />
            <div className="cinema-curtain__rope" />
          </div>
          <div className="cinema-curtain__panel cinema-curtain__panel--right">
            <div className="cinema-curtain__valance" />
            <div className="cinema-curtain__rope" />
          </div>
        </div>
      )}

      <button
        type="button"
        className="help-btn"
        onClick={() => setShowHelp(true)}
        aria-label={t('help')}
        title={t('how_to_play')}
      >
        ❓
      </button>

      {resumeSession && (
        <div className="resume-banner" role="dialog" aria-live="polite">
          <div className="resume-banner__text">
            <span className="resume-banner__title">
              🎬 {t('resume_game_title')}
            </span>
            <span className="resume-banner__sub">
              {t('resume_game_sub', { code: resumeSession.roomCode })}
            </span>
          </div>
          <div className="resume-banner__actions">
            <button
              type="button"
              className="btn btn-primary resume-banner__btn"
              onClick={handleResume}
            >
              ▶️ {t('resume_game')}
            </button>
            <button
              type="button"
              className="resume-banner__dismiss"
              onClick={handleDismissResume}
              aria-label={t('dismiss')}
              title={t('dismiss')}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="home-marquee-wrap">
        <div className="marquee-frame">
          <span className="marquee-bulbs marquee-bulbs--top" aria-hidden="true" />
          <span className="marquee-bulbs marquee-bulbs--side marquee-bulbs--left" aria-hidden="true" />
          <span className="marquee-bulbs marquee-bulbs--side marquee-bulbs--right" aria-hidden="true" />
          <h1 className="game-logo marquee-title">
            <span className="marquee-word">CINE</span>
            <span className="marquee-word">MASTER</span>
          </h1>
          <span className="marquee-bulbs marquee-bulbs--bottom" aria-hidden="true" />
        </div>
      </div>

      <div className="container">
        <div className="home-content">
          <div className="home-controls">
            {/* Step 1 — pick the kind of game */}
            {!gameMode && (
              <div className="mode-section mode-section--step1">
                <p className="mode-label">{t('choose_mode')}</p>
                <div className="mode-toggle" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={false}
                    className="mode-tab"
                    onClick={() => setGameMode('bot')}
                  >
                    🤖 {t('play_vs_bot')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={false}
                    className="mode-tab"
                    onClick={() => setGameMode('teams')}
                  >
                    👥 {t('play_vs_teams')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={false}
                    className="mode-tab"
                    onClick={() => setGameMode('race')}
                  >
                    ⏱️ {t('play_vs_clock')}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 — once a mode is chosen, show only the relevant inputs */}
            {gameMode && (
              <div className="mode-step2">
                <button
                  type="button"
                  className="mode-back"
                  onClick={() => setGameMode(null)}
                  aria-label={t('change_mode')}
                  title={t('change_mode')}
                >
                  <span className="mode-back__arrow" aria-hidden="true">←</span>
                  <span className="mode-back__text">{t('change_mode')}</span>
                </button>

                <div className="mode-step2__body">
                  <div className="mode-current-label">
                    {gameMode === 'bot' && <>🤖 {t('play_vs_bot')}</>}
                    {gameMode === 'teams' && <>👥 {t('play_vs_teams')}</>}
                    {gameMode === 'race' && <>⏱️ {t('play_vs_clock')}</>}
                  </div>

                  <div className="name-section">
                    <input
                      type="text"
                      className="input name-input"
                      placeholder={t('enter_your_name') || 'Enter your name'}
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      maxLength="20"
                    />
                  </div>

                {gameMode === 'bot' && (
                  <div className="menu-buttons mode-options">
                    <p className="mode-hint">{t('vs_bot_hint')}</p>
                    <button
                      className="btn btn-primary"
                      onClick={handleBotMode}
                      disabled={!nameValid}
                    >
                      ▶️ {t('start_game')}
                    </button>
                  </div>
                )}

                {(gameMode === 'teams' || gameMode === 'race') && (
                  <div className="menu-buttons mode-options">
                    <p className="mode-hint">
                      {gameMode === 'teams' ? t('vs_teams_hint') : t('vs_clock_hint')}
                    </p>
                    <button
                      className="btn btn-primary"
                      onClick={() =>
                        handleCreateGame({ isRaceMode: gameMode === 'race' })
                      }
                      disabled={isLoading || !nameValid}
                    >
                      {isLoading ? (
                        <span className="loading"></span>
                      ) : (
                        (gameMode === 'race' ? '⏱️ ' : '🎮 ') + t('create_game')
                      )}
                    </button>

                    <div className="join-section">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="input join-input"
                        placeholder={t('enter_room_code') || 'Enter Room Code'}
                        value={roomCode}
                        onChange={(e) => handleRoomCodeChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === 'Enter' &&
                            roomCode.length === 4 &&
                            nameValid &&
                            !isLoading
                          ) {
                            e.preventDefault();
                            handleJoinGame();
                          }
                        }}
                        maxLength="4"
                        aria-label={t('enter_room_code')}
                      />
                      <span className="join-hint" aria-live="polite">
                        {roomCode.length === 4
                          ? (isLoading ? t('loading') : t('joining'))
                          : ''}
                      </span>
                    </div>
                  </div>
                )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showHelp && (
        <div className="help-modal-backdrop" onClick={() => setShowHelp(false)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="help-close"
              onClick={() => setShowHelp(false)}
              aria-label="Close"
            >
              ✕
            </button>

            <h2>🎬 {t('rules_title')}</h2>
            <p className="help-modal__intro">{t('rules_intro')}</p>

            <ol className="help-rules">
              {(t('rules', { returnObjects: true }) || []).map((rule, idx) => (
                <li key={idx} className="help-rules__item">
                  <span className="help-rules__num">{idx + 1}</span>
                  <span className="help-rules__text">{rule}</span>
                </li>
              ))}
            </ol>

            <button
              type="button"
              className="help-modal__cta"
              onClick={() => setShowHelp(false)}
            >
              {t('rules_close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default HomeScreen;
