// src/screens/LobbyScreen.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ref, onValue, update, set } from 'firebase/database';
import { database } from '../firebase';
import './LobbyScreen.css';

function LobbyScreen() {
  const { t } = useTranslation();
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const playerId = searchParams.get('playerId');

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [myTeam, setMyTeam] = useState(null);
  const [myReady, setMyReady] = useState(false);
  const [allReady, setAllReady] = useState(false);
  const [copied, setCopied] = useState(false);

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
        alert('Room not found');
        navigate('/');
        return;
      }

      setRoom(data);
      
      // Check if I'm the host
      setIsHost(data.host === playerId);

      // Get players list
      const playersList = data.players ? Object.values(data.players) : [];
      setPlayers(playersList);

      // Get my data
      const myData = data.players?.[playerId];
      if (myData) {
        setMyTeam(myData.team);
        setMyReady(myData.ready || false);
      }

      // Check if all players ready
      const ready = playersList.every(p => p.ready);
      setAllReady(ready && playersList.length >= 2);
    });

    return () => unsubscribe();
  }, [roomCode, playerId, navigate]);

  // Join team
  const handleJoinTeam = async (team) => {
    if (myReady) return; // Can't change team after ready

    try {
      const playerRef = ref(database, `rooms/${roomCode}/players/${playerId}`);
      await update(playerRef, { team });
    } catch (error) {
      console.error('Error joining team:', error);
    }
  };

  // Toggle ready
  const handleToggleReady = async () => {
    if (!myTeam) {
      alert(t('choose_team_first') || 'Please choose a team first');
      return;
    }

    try {
      const playerRef = ref(database, `rooms/${roomCode}/players/${playerId}`);
      await update(playerRef, { ready: !myReady });
    } catch (error) {
      console.error('Error toggling ready:', error);
    }
  };

  // Start game (host only)
  const handleStartGame = async () => {
    if (!isHost || !allReady) return;

    try {
      const roomRef = ref(database, `rooms/${roomCode}`);
      await update(roomRef, { status: 'playing' });
      
      // Navigate to game screen
      navigate(`/game/${roomCode}?playerId=${playerId}`);
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

  // Share link
  const handleShareLink = () => {
    const link = `${window.location.origin}/room/${roomCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get players by team
  const teamAPlayers = players.filter(p => p.team === 'A');
  const teamBPlayers = players.filter(p => p.team === 'B');
  const noTeamPlayers = players.filter(p => !p.team);

  if (!room) {
    return (
      <div className="lobby-screen">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="lobby-screen">
      <div className="container">
        <div className="lobby-content">
          {/* Header */}
          <div className="lobby-header">
            <h1 className="game-logo">🎬 {t('app_title')}</h1>
            <div className="room-code-display">
              <span className="label">{t('room_code')}:</span>
              <span className="code">{roomCode}</span>
            </div>
            <div className="share-buttons">
              <button className="btn-share" onClick={handleCopyCode}>
                {copied ? '✓ ' + t('copied') : '📋 ' + t('copy_code')}
              </button>
              <button className="btn-share" onClick={handleShareLink}>
                📤 {t('share_link')}
              </button>
            </div>
          </div>

          {/* Teams */}
          <div className="teams-container">
            {/* Team A */}
            <div className="team-box">
              <h2 className="team-title">{t('team_a')}</h2>
              <div className="players-list">
                {teamAPlayers.length === 0 && (
                  <div className="empty-team">{t('waiting_for_players')}</div>
                )}
                {teamAPlayers.map(player => (
                  <div
                    key={player.id}
                    className={`player-card ${player.id === playerId ? 'me' : ''} ${player.ready ? 'ready' : ''}`}
                  >
                    <span className="player-name">
                      {player.name} {player.id === playerId && '(You)'}
                      {player.isHost && ' 👑'}
                    </span>
                    {player.ready && <span className="ready-badge">✅</span>}
                  </div>
                ))}
              </div>
              {!myTeam && (
                <button
                  className="btn-join-team"
                  onClick={() => handleJoinTeam('A')}
                >
                  {t('join_team')} A
                </button>
              )}
            </div>

            {/* VS */}
            <div className="vs-divider">VS</div>

            {/* Team B */}
            <div className="team-box">
              <h2 className="team-title">{t('team_b')}</h2>
              <div className="players-list">
                {teamBPlayers.length === 0 && (
                  <div className="empty-team">{t('waiting_for_players')}</div>
                )}
                {teamBPlayers.map(player => (
                  <div
                    key={player.id}
                    className={`player-card ${player.id === playerId ? 'me' : ''} ${player.ready ? 'ready' : ''}`}
                  >
                    <span className="player-name">
                      {player.name} {player.id === playerId && '(You)'}
                      {player.isHost && ' 👑'}
                    </span>
                    {player.ready && <span className="ready-badge">✅</span>}
                  </div>
                ))}
              </div>
              {!myTeam && (
                <button
                  className="btn-join-team"
                  onClick={() => handleJoinTeam('B')}
                >
                  {t('join_team')} B
                </button>
              )}
            </div>
          </div>

          {/* No Team Players */}
          {noTeamPlayers.length > 0 && (
            <div className="no-team-section">
              <h3>{t('choose_team')}:</h3>
              {noTeamPlayers.map(player => (
                <div key={player.id} className="player-card">
                  {player.name} {player.id === playerId && '(You)'}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="lobby-actions">
            {myTeam && (
              <button
                className={`btn ${myReady ? 'btn-unready' : 'btn-ready'}`}
                onClick={handleToggleReady}
              >
                {myReady ? '❌ ' + t('not_ready') : '✅ ' + t('ready')}
              </button>
            )}

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
              <div className="waiting-host">
                {t('waiting_for_host')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LobbyScreen;