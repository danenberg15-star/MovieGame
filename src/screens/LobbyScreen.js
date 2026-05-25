// src/screens/LobbyScreen.js
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ref, onValue, update, set, remove } from 'firebase/database';
import { database } from '../firebase';
import './LobbyScreen.css';

const ROWS = 3;
const COLS = 4;
const SEATS_PER_TEAM = ROWS * COLS;

// Distinct "robot" avatars for decorative bots in vs-Bot / QA mode
const BOT_EMOJIS = [
  '🤖', '👾', '🛸', '🦾', '🦿', '⚙️',
  '🪐', '🛰️', '🎬', '🎯', '🎮', '🕹️',
];

const buildBotRoster = (lang) => {
  const roster = {};
  for (let i = 0; i < SEATS_PER_TEAM; i++) {
    // First bot keeps the legacy id `bot_player` — that's the one the
    // game logic actually plays against (see useGameState / botPlayer.isBot).
    const id = i === 0 ? 'bot_player' : `bot_${i + 1}`;
    const emoji = BOT_EMOJIS[i % BOT_EMOJIS.length];
    const label = `BOT${i + 1}`;
    roster[id] = {
      id,
      name: lang === 'he' ? `${emoji} ${label}` : `${emoji} ${label}`,
      team: 'B',
      seat: i,
      ready: true,
      isHost: false,
      isBot: true,
      botEmoji: emoji,
      botLabel: label,
    };
  }
  return roster;
};

function LobbyScreen() {
  const { t } = useTranslation();
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const playerId = searchParams.get('playerId');

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [allReady, setAllReady] = useState(false);
  const [isQAMode, setIsQAMode] = useState(false);

  // Initialize QA Mode (Room 99999)
  useEffect(() => {
    const initQAMode = async () => {
      if (roomCode !== '99999') return;

      setIsQAMode(true);

      try {
        const roomRef = ref(database, `rooms/99999`);
        const gameRef = ref(database, `games/99999`);

        await remove(roomRef);
        await remove(gameRef);
        console.log('🗑️ QA Room and Game 99999 deleted (reset)');

        await new Promise((resolve) => setTimeout(resolve, 500));

        const playerName = localStorage.getItem('playerName') || 'Player 1';
        const lang = t('team_b') === 'Team B' ? 'en' : 'he';

        await set(roomRef, {
          code: '99999',
          host: playerId,
          created: Date.now(),
          status: 'waiting',
          isQAMode: true,
          teams: { teamA: [], teamB: [] },
          players: {
            [playerId]: {
              id: playerId,
              name: playerName,
              team: null,
              seat: null,
              ready: false,
              isHost: true,
            },
            // Fill the whole Team B auditorium with decorative bots
            ...buildBotRoster(lang),
          },
        });

        console.log('✅ Fresh QA Room 99999 created successfully');
      } catch (error) {
        console.error('Error initializing QA mode:', error);
        alert('Failed to initialize QA mode: ' + error.message);
      }
    };

    if (roomCode && playerId) initQAMode();
  }, [roomCode, playerId, t]);

  // Listen to room changes
  useEffect(() => {
    if (!roomCode || !playerId) {
      navigate('/');
      return;
    }

    const roomRef = ref(database, `rooms/${roomCode}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        if (roomCode !== '99999') {
          alert('Room not found');
          navigate('/');
        }
        return;
      }

      setRoom(data);
      setIsHost(data.host === playerId);

      const playersList = data.players ? Object.values(data.players) : [];
      setPlayers(playersList);

      const humanPlayers = playersList.filter((p) => !p.isBot);
      const ready =
        humanPlayers.length >= 1 &&
        humanPlayers.every((p) => p.ready && p.team && p.seat !== null && p.seat !== undefined);
      setAllReady(ready);
    });

    return () => unsubscribe();
  }, [roomCode, playerId, navigate]);

  // Navigate all players when host starts the game
  useEffect(() => {
    if (room?.status === 'playing' && roomCode && playerId) {
      navigate(`/game/${roomCode}?playerId=${playerId}`);
    }
  }, [room?.status, roomCode, playerId, navigate]);

  // Pick a seat (team + seat index) — replaces join-team + ready toggle
  const handlePickSeat = async (team, seatIdx) => {
    if (isQAMode && team === 'B') return; // bot owns Team B in QA
    // Is this seat already taken by someone else?
    const taken = players.find(
      (p) => p.team === team && (p.seat ?? -1) === seatIdx && p.id !== playerId,
    );
    if (taken) return;

    try {
      const playerRef = ref(database, `rooms/${roomCode}/players/${playerId}`);
      await update(playerRef, { team, seat: seatIdx, ready: true });
    } catch (error) {
      console.error('Error picking seat:', error);
    }
  };

  // Start game (host only)
  const handleStartGame = async () => {
    if (!isHost || !allReady) return;
    try {
      const roomRef = ref(database, `rooms/${roomCode}`);
      await update(roomRef, { status: 'playing' });
    } catch (error) {
      console.error('Error starting game:', error);
    }
  };

  // Share the lobby link straight to WhatsApp.
  // We point friends to /room/:code (HomeScreen) so they get to enter
  // their own name before joining the lobby.
  const handleShareWhatsApp = () => {
    const link = `${window.location.origin}/room/${roomCode}`;
    const text =
      t('whatsapp_invite', { code: roomCode, link }) ||
      `🎬 Join my CINEMASTER game! Room ${roomCode}\n${link}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleExitToHome = () => {
    navigate('/');
  };

  // Build a quick lookup of seat → player per team
  const teamSeatMap = useMemo(() => {
    const map = { A: new Map(), B: new Map() };
    players.forEach((p) => {
      if ((p.team === 'A' || p.team === 'B') && p.seat !== null && p.seat !== undefined) {
        map[p.team].set(p.seat, p);
      }
    });
    return map;
  }, [players]);

  if (!room) {
    return (
      <div className="lobby-screen">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  const renderTheater = (team) => {
    const seatMap = teamSeatMap[team];
    const isTeamLocked = isQAMode && team === 'B';

    return (
      <div className={`theater theater--${team.toLowerCase()}`}>
        {/* Curved cinema screen with team name */}
        <div className="theater__screen-wrap">
          <div className="theater__screen">
            <span className="theater__screen-glow" aria-hidden="true" />
            <span className="theater__screen-label">
              {team === 'A' ? t('team_a') : t('team_b')}
            </span>
          </div>
          <div className="theater__screen-shadow" aria-hidden="true" />
        </div>

        {/* Seat grid (top-down view of cinema hall) */}
        <div
          className="theater__seats"
          style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
        >
          {Array.from({ length: SEATS_PER_TEAM }).map((_, idx) => {
            const occupant = seatMap.get(idx);
            const isMine = occupant?.id === playerId;
            const isOther = !!occupant && !isMine;
            const disabled = isTeamLocked || isOther;
            const label = occupant ? occupant.name : `Seat ${idx + 1}`;

            const cls = [
              'seat',
              isMine && 'seat--mine',
              isOther && 'seat--taken',
              isTeamLocked && !occupant && 'seat--locked',
              occupant?.isBot && 'seat--bot',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={idx}
                type="button"
                className={cls}
                onClick={() => handlePickSeat(team, idx)}
                disabled={disabled}
                title={label}
                aria-label={label}
              >
                <span className="seat__back" aria-hidden="true" />
                <span className="seat__cushion" aria-hidden="true" />
                {occupant && (
                  <span className="seat__occupant">
                    {occupant.isBot ? (
                      <>
                        <span className="seat__emoji">{occupant.botEmoji || '🤖'}</span>
                        <span className="seat__name">{occupant.botLabel || occupant.name}</span>
                      </>
                    ) : (
                      <span className="seat__name seat__name--player">{occupant.name}</span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Aisle / footer */}
        <div className="theater__aisle" aria-hidden="true" />
      </div>
    );
  };

  // Human players list status (for hint)
  const humans = players.filter((p) => !p.isBot);
  const seated = humans.filter((p) => p.team && p.seat !== null && p.seat !== undefined).length;

  return (
    <div className="lobby-screen">
      <div className="container">
        <div className="lobby-content">
          {/* Header — exit (X), room code, and WhatsApp invite */}
          <div className="lobby-header">
            <button
              type="button"
              className="exit-btn"
              onClick={handleExitToHome}
              aria-label={t('exit_to_home') || 'Exit to home'}
              title={t('exit_to_home') || 'Exit to home'}
            >
              ✕
            </button>

            <div className="room-code-display">
              <span className="label">{t('room_code')}:</span>
              <span className="code">{roomCode}</span>
            </div>

            {!isQAMode && (
              <button
                type="button"
                className="btn-whatsapp"
                onClick={handleShareWhatsApp}
                aria-label={t('share_whatsapp') || 'Share on WhatsApp'}
                title={t('share_whatsapp') || 'Share on WhatsApp'}
              >
                <WhatsAppIcon />
              </button>
            )}
          </div>

          {/* Teams (cinema halls from above) */}
          <div className="teams-container">
            {renderTheater('A')}
            <div className="vs-divider">VS</div>
            {renderTheater('B')}
          </div>

          {/* Pick-seat hint */}
          {!allReady && (
            <div className="seat-hint">
              {t('pick_seat_hint')}{' '}
              <span className="seat-hint__count">
                ({seated}/{humans.length})
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="lobby-actions">
            {isHost && (
              <button
                className="btn btn-start"
                onClick={handleStartGame}
                disabled={!allReady}
              >
                {allReady ? '🎮 ' + t('start_game') : t('waiting_for_all')}
              </button>
            )}

            {!isHost && allReady && (
              <div className="waiting-host">{t('waiting_for_host')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16.002 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.255.59 4.46 1.713 6.4L3.2 28.8l6.55-1.713a12.79 12.79 0 006.25 1.6h.002c7.06 0 12.8-5.74 12.8-12.8s-5.74-12.687-12.8-12.687zm0 23.36h-.002a10.58 10.58 0 01-5.397-1.477l-.387-.23-3.886 1.017 1.04-3.787-.252-.39a10.555 10.555 0 01-1.628-5.69c0-5.842 4.754-10.6 10.6-10.6 2.832 0 5.493 1.103 7.494 3.107a10.55 10.55 0 013.106 7.496c0 5.846-4.755 10.554-10.69 10.554zm5.815-7.91c-.318-.16-1.883-.93-2.175-1.037-.292-.106-.504-.16-.717.16-.213.318-.823 1.037-1.01 1.25-.186.213-.372.24-.69.08-.318-.16-1.346-.495-2.564-1.58-.947-.844-1.587-1.888-1.773-2.206-.186-.318-.02-.49.14-.65.143-.143.318-.372.477-.558.16-.186.213-.318.32-.53.106-.213.053-.398-.027-.558-.08-.16-.717-1.726-.983-2.364-.26-.62-.523-.536-.717-.546l-.61-.011a1.17 1.17 0 00-.849.398c-.292.318-1.116 1.09-1.116 2.656 0 1.566 1.143 3.08 1.302 3.293.16.213 2.249 3.43 5.45 4.81.762.328 1.357.524 1.82.67.764.243 1.46.21 2.01.127.613-.092 1.883-.77 2.15-1.514.265-.744.265-1.382.186-1.514-.08-.133-.293-.213-.61-.372z"
        fill="#25D366"
      />
    </svg>
  );
}

export default LobbyScreen;
