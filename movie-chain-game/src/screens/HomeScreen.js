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

  // Load saved player name from localStorage
  useEffect(() => {
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
      setPlayerName(savedName);
    }
  }, []);

  // Generate random 6-digit room code
  const generateRoomCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  // Validate player name
  const validatePlayerName = () => {
    if (!playerName || playerName.trim().length < 2) {
      alert(t('enter_your_name') || 'Please enter your name (at least 2 characters)');
      return false;
    }
    return true;
  };

  // Create new game room
  const handleCreateGame = async () => {
    if (!validatePlayerName()) return;

    setIsLoading(true);
    const newRoomCode = generateRoomCode();
    
    // Save player name
    localStorage.setItem('playerName', playerName.trim());
    
    try {
      // Create room in Firebase
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

      // Navigate to lobby
      navigate(`/lobby/${newRoomCode}?playerId=${playerId}`);
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create room. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Join existing game room
  const handleJoinGame = async () => {
    if (!validatePlayerName()) return;
    
    if (!roomCode || roomCode.length !== 6) {
      alert(t('enter_room_code') || 'Please enter a valid 6-digit room code');
      return;
    }

    setIsLoading(true);
    
    // Save player name
    localStorage.setItem('playerName', playerName.trim());
    
    try {
      // Check if room exists
      const roomRef = ref(database, `rooms/${roomCode}`);
      const snapshot = await get(roomRef);
      
      if (snapshot.exists()) {
        const playerId = 'player_' + Date.now();
        
        // Add player to room
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

  // Join QA Mode (Room 99999)
  const handleQAMode = () => {
    if (!validatePlayerName()) return;
    
    // Save player name
    localStorage.setItem('playerName', playerName.trim());
    
    const playerId = 'player_' + Date.now();
    navigate(`/lobby/99999?playerId=${playerId}`);
  };

  return (
    <div className="home-screen">
      <div className="container">
        <div className="home-content">
          {/* Game Logo */}
          <h1 className="game-logo">🎬 {t('app_title')}</h1>
          
          {/* Welcome Text */}
          <p className="welcome-text">{t('welcome')}</p>

          {/* Player Name Input */}
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

          {/* Main Menu Buttons */}
          <div className="menu-buttons">
            <button 
              className="btn btn-primary"
              onClick={handleCreateGame}
              disabled={isLoading || !playerName.trim()}
            >
              {isLoading ? <span className="loading"></span> : '🎮 ' + t('create_game')}
            </button>

            {/* Join Game Section */}
            <div className="join-section">
              <input
                type="text"
                className="input"
                placeholder={t('enter_room_code') || 'Enter Room Code'}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength="6"
              />
              <button 
                className="btn btn-secondary"
                onClick={handleJoinGame}
                disabled={isLoading || !playerName.trim() || roomCode.length !== 6}
              >
                {isLoading ? <span className="loading"></span> : '🚪 ' + t('join_game')}
              </button>
            </div>

            {/* QA Mode Button */}
            <button 
              className="btn btn-qa"
              onClick={handleQAMode}
              disabled={!playerName.trim()}
            >
              🧪 {t('qa_mode')}
            </button>

            {/* How to Play Button */}
            <button className="btn btn-info">
              ❓ {t('how_to_play')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomeScreen;