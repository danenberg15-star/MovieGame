// src/screens/LobbyScreen.js
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ref, onValue, update, set, remove } from 'firebase/database';
import { database } from '../firebase';
import './LobbyScreen.css';

const ROWS = 3;
const COLS = 5;
const SEATS_PER_TEAM = ROWS * COLS;

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
  const [copied, setCopied] = useState(false);
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
            bot_player: {
              id: 'bot_player',
              name: t('team_b') === 'Team B' ? '🤖 AI Bot' : '🤖 בוט AI',
              team: 'B',
              seat: 0,
              ready: true,
              isHost: false,
              isBot: true,
            },
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

  // Copy room code
  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareLink = () => {
    const link = `${window.location.origin}/room/${roomCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            const initial = occupant?.name?.trim()?.charAt(0)?.toUpperCase() || '?';
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
                <span className="seat__occupant">
                  {occupant ? (occupant.isBot ? '🤖' : initial) : ''}
                </span>
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
          {/* Header — slim: just room code + share buttons (no CINEMASTER, no QA badge) */}
          <div className="lobby-header">
            <div className="room-code-display">
              <span className="label">{t('room_code')}:</span>
              <span className="code">{roomCode}</span>
            </div>
            {!isQAMode && (
              <div className="share-buttons">
                <button className="btn-share" onClick={handleCopyCode}>
                  {copied ? '✓ ' + t('copied') : '📋 ' + t('copy_code')}
                </button>
                <button className="btn-share" onClick={handleShareLink}>
                  📤 {t('share_link')}
                </button>
              </div>
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

export default LobbyScreen;
