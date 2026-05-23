// src/screens/HomeScreen.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ref, set, get } from 'firebase/database';
import { database } from '../firebase';
import './HomeScreen.css';

function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [gameMode, setGameMode] = useState(null); // 'bot' | 'teams'
  const [showHelp, setShowHelp] = useState(false);

  // Cinema curtain intro — show once per browser session
  const [curtainState, setCurtainState] = useState(() => {
    if (typeof window === 'undefined') return 'done';
    return sessionStorage.getItem('curtainShown') === '1' ? 'done' : 'closed';
  });

  useEffect(() => {
    if (curtainState !== 'closed') return;
    const openTimer = setTimeout(() => setCurtainState('opening'), 350);
    const doneTimer = setTimeout(() => {
      setCurtainState('done');
      sessionStorage.setItem('curtainShown', '1');
    }, 2400);
    return () => {
      clearTimeout(openTimer);
      clearTimeout(doneTimer);
    };
  }, [curtainState]);

  useEffect(() => {
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
      setPlayerName(savedName);
    }
  }, []);

  const generateRoomCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const validatePlayerName = () => {
    if (!playerName || playerName.trim().length < 2) {
      alert(t('enter_your_name') || 'Please enter your name (at least 2 characters)');
      return false;
    }
    return true;
  };

  const handleCreateGame = async () => {
    if (!validatePlayerName()) return;

    setIsLoading(true);
    const newRoomCode = generateRoomCode();
    localStorage.setItem('playerName', playerName.trim());

    try {
      const roomRef = ref(database, `rooms/${newRoomCode}`);
      const playerId = 'player_' + Date.now();

      await set(roomRef, {
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
            ready: false,
            isHost: true
          }
        }
      });

      navigate(`/lobby/${newRoomCode}?playerId=${playerId}`);
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create room. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinGame = async () => {
    if (!validatePlayerName()) return;

    if (!roomCode || roomCode.length !== 6) {
      alert(t('enter_room_code') || 'Please enter a valid 6-digit room code');
      return;
    }

    setIsLoading(true);
    localStorage.setItem('playerName', playerName.trim());

    try {
      const roomRef = ref(database, `rooms/${roomCode}`);
      const snapshot = await get(roomRef);

      if (snapshot.exists()) {
        const playerId = 'player_' + Date.now();
        const playerRef = ref(database, `rooms/${roomCode}/players/${playerId}`);
        await set(playerRef, {
          id: playerId,
          name: playerName.trim(),
          team: null,
          ready: false,
          isHost: false
        });

        navigate(`/lobby/${roomCode}?playerId=${playerId}`);
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

  const handleBotMode = () => {
    if (!validatePlayerName()) return;
    localStorage.setItem('playerName', playerName.trim());
    const playerId = 'player_' + Date.now();
    navigate(`/lobby/99999?playerId=${playerId}`);
  };

  const nameValid = playerName.trim().length >= 2;

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

      <div className="container">
        <div className="home-content">
          <div className="marquee-frame">
            <span className="marquee-bulbs marquee-bulbs--top" aria-hidden="true" />
            <span className="marquee-bulbs marquee-bulbs--side marquee-bulbs--left" aria-hidden="true" />
            <span className="marquee-bulbs marquee-bulbs--side marquee-bulbs--right" aria-hidden="true" />
            <h1 className="game-logo marquee-title">{t('app_title')}</h1>
            <span className="marquee-bulbs marquee-bulbs--bottom" aria-hidden="true" />
          </div>

          <div className="home-controls">
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

          <div className="mode-section">
            <p className="mode-label">{t('choose_mode')}</p>
            <div className="mode-toggle" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={gameMode === 'bot'}
                className={`mode-tab ${gameMode === 'bot' ? 'active' : ''}`}
                onClick={() => setGameMode('bot')}
              >
                🤖 {t('play_vs_bot')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={gameMode === 'teams'}
                className={`mode-tab ${gameMode === 'teams' ? 'active' : ''}`}
                onClick={() => setGameMode('teams')}
              >
                👥 {t('play_vs_teams')}
              </button>
            </div>
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

          {gameMode === 'teams' && (
            <div className="menu-buttons mode-options">
              <p className="mode-hint">{t('vs_teams_hint')}</p>
              <button
                className="btn btn-primary"
                onClick={handleCreateGame}
                disabled={isLoading || !nameValid}
              >
                {isLoading ? <span className="loading"></span> : '🎮 ' + t('create_game')}
              </button>

              <div className="join-section">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="input join-input"
                  placeholder={t('enter_room_code') || 'Enter Room Code'}
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && roomCode.length === 6 && nameValid && !isLoading) {
                      e.preventDefault();
                      handleJoinGame();
                    }
                  }}
                  maxLength="6"
                  aria-label={t('enter_room_code')}
                />
                <span className="join-hint" aria-live="polite">
                  {roomCode.length === 6 ? '↵ ' + t('join_game') : ''}
                </span>
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
            <h2>❓ {t('how_to_play')}</h2>
            <p>{t('welcome')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default HomeScreen;
