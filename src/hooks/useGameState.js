// src/hooks/useGameState.js
import { useState, useEffect, useRef } from 'react';
import { ref, onValue, get, update, runTransaction } from 'firebase/database';
import { database } from '../firebase';
import {
  loadMoviesData,
  buildLobbyWarmupPayload,
  initializeGameState
} from '../utils/gameLogic';
import { isBotModeRoom, isRaceModeRoom } from '../utils/botRoom';

// Read team chosen in lobby (rooms/{code}/players/{id}.team)
const getLobbyTeam = async (roomCode, playerId) => {
  if (!roomCode || !playerId) return null;
  try {
    const snap = await get(ref(database, `rooms/${roomCode}/players/${playerId}/team`));
    const team = snap.val();
    return team === 'A' || team === 'B' ? team : null;
  } catch {
    return null;
  }
};

const assignTeam = (lobbyTeam, playerTeams) => {
  if (lobbyTeam) return lobbyTeam;
  const teamACount = Object.values(playerTeams || {}).filter((t) => t === 'A').length;
  const teamBCount = Object.values(playerTeams || {}).filter((t) => t === 'B').length;
  return teamACount <= teamBCount ? 'A' : 'B';
};

/** Seed players + teams from everyone already seated in the lobby. */
const seedFromRoom = (roomData) => {
  const players = {};
  const playerTeams = {};
  const roomPlayers = roomData?.players || {};
  for (const [id, p] of Object.entries(roomPlayers)) {
    if (p?.isBot) continue;
    players[id] = {
      id,
      name: p.name || `Player ${id.slice(-4)}`,
      joinedAt: p.joinedAt || Date.now()
    };
    if (p.team === 'A' || p.team === 'B') {
      playerTeams[id] = p.team;
    }
  }
  return { players, playerTeams };
};

/** Ensure this client is registered in the game document (never wipe existing game). */
const ensurePlayerInGame = async (gameRef, roomCode, playerId, roomData) => {
  if (!playerId) return;
  const snap = await get(gameRef);
  if (!snap.exists()) return;

  const game = snap.val();
  const lobbyTeam = await getLobbyTeam(roomCode, playerId);
  const resolvedTeam = assignTeam(lobbyTeam, game.playerTeams);
  const lobbyPlayer = roomData?.players?.[playerId];
  const displayName =
    lobbyPlayer?.name ||
    game.players?.[playerId]?.name ||
    `Player ${playerId.slice(-4)}`;

  const updates = {};
  if (!game.players?.[playerId]) {
    updates[`players/${playerId}`] = {
      id: playerId,
      name: displayName,
      joinedAt: Date.now()
    };
  }
  const teamInGame = game.playerTeams?.[playerId];
  const teamValid = teamInGame === 'A' || teamInGame === 'B';
  if (!teamValid) {
    updates[`playerTeams/${playerId}`] = lobbyTeam || resolvedTeam;
  } else if (lobbyTeam && teamInGame !== lobbyTeam) {
    updates[`playerTeams/${playerId}`] = lobbyTeam;
  }

  if (Object.keys(updates).length > 0) {
    await update(gameRef, updates);
    console.log('✅ Ensured player in game', { playerId, team: updates[`playerTeams/${playerId}`] });
  }
};

export const useGameState = (roomCode, playerId, language) => {
  const [gameState, setGameState] = useState(null);
  const [allMovies, setAllMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [phase, setPhase] = useState('anchorReveal');
  const [currentMovie, setCurrentMovie] = useState(null);
  const [answerOptions, setAnswerOptions] = useState([]);
  const [removedAnswers, setRemovedAnswers] = useState([]);
  const [lobbyTeam, setLobbyTeam] = useState(null);
  const currentMovieIdRef = useRef(null);
  const languageRef = useRef(language);
  languageRef.current = language;

  // Initialize game
  useEffect(() => {
    if (!roomCode || !playerId) {
      setLoading(false);
      setIsInitializing(false);
      return undefined;
    }

    let unsubscribe = null;
    let cancelled = false;

    const initGame = async () => {
      try {
        const roomSnap = await get(ref(database, `rooms/${roomCode}`));
        const roomData = roomSnap.val() || {};
        const isBotMode = isBotModeRoom(roomData);
        const isRaceMode = isRaceModeRoom(roomData);

        const resolvedLobbyTeam = await getLobbyTeam(roomCode, playerId);
        if (!cancelled) setLobbyTeam(resolvedLobbyTeam);

        console.log('🎮 Initializing game...', { roomCode, playerId, isBotMode, isRaceMode });

        // Load movies data
        const movies = await loadMoviesData();
        if (!movies || movies.length === 0) {
          throw new Error('Failed to load movies data');
        }
        console.log(`✅ Loaded ${movies.length} movies`);
        setAllMovies(movies);

        let roomWarmup = roomData?.warmup || null;
        if (!roomWarmup?.anchorCards?.teamA || !roomWarmup?.pendingFirstRound?.movieId) {
          roomWarmup = buildLobbyWarmupPayload(movies, language);
          await update(ref(database, `rooms/${roomCode}`), { warmup: roomWarmup });
          console.log('🔥 Backfilled missing room warmup payload');
        }

        // Reference to game in Firebase
        const gameRef = ref(database, `games/${roomCode}`);

        const snapshot = await get(gameRef);

        if (!snapshot.exists()) {
          console.log('🆕 Creating new game (transaction)...');
          const { players: roomPlayers, playerTeams: roomTeams } = seedFromRoom(roomData);
          const creatorTeam = assignTeam(resolvedLobbyTeam, roomTeams);

          const initialState = {
            ...initializeGameState(roomWarmup.anchorCards, {
              pendingFirstRound: roomWarmup.pendingFirstRound,
            }),
            roomCode,
            createdAt: Date.now(),
            players: { ...roomPlayers },
            playerTeams: { ...roomTeams },
            isBotMode,
            isQAMode: isBotMode,
            isRaceMode,
          };

          if (!initialState.players[playerId]) {
            initialState.players[playerId] = {
              id: playerId,
              name:
                roomData?.players?.[playerId]?.name ||
                `Player ${playerId.slice(-4)}`,
              joinedAt: Date.now()
            };
          }
          if (!initialState.playerTeams[playerId]) {
            initialState.playerTeams[playerId] = creatorTeam;
          }

          const lang = languageRef.current;
          if (isBotMode) {
            initialState.players.bot_player = {
              id: 'bot_player',
              name: lang === 'he' ? '🤖 בוט AI' : '🤖 AI Bot',
              isBot: true,
              joinedAt: Date.now()
            };
            initialState.playerTeams.bot_player = 'B';
          }

          const tx = await runTransaction(gameRef, (current) => {
            if (current) return current;
            return initialState;
          });
          if (tx.committed && tx.snapshot.val()?.createdAt === initialState.createdAt) {
            console.log('✅ Game created successfully');
          } else {
            console.log('✅ Game already existed (joined via transaction)');
          }
        } else {
          console.log('✅ Game exists, joining...');
        }

        await ensurePlayerInGame(gameRef, roomCode, playerId, roomData);

        // Listen to game state changes
        unsubscribe = onValue(gameRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const teamInGame = data.playerTeams?.[playerId];
            if (teamInGame !== 'A' && teamInGame !== 'B') {
              ensurePlayerInGame(gameRef, roomCode, playerId, roomData).catch((err) => {
                console.warn('⚠️ Could not backfill player team:', err);
              });
            }

            console.log('📊 Game state updated:', {
              phase: data.phase,
              turn: data.currentTurn,
              teamACards: data.teamA?.cards?.length,
              teamBCards: data.teamB?.cards?.length
            });
            setGameState(data);
            setPhase(data.phase);

            // Update current movie ONLY if it's a NEW movie (prevents double trailer)
            if (data.currentMovie && data.currentMovie.id) {
              const movie = movies.find(
                (m) => String(m.id) === String(data.currentMovie.id)
              );
              if (movie) {
                if (currentMovieIdRef.current !== movie.id) {
                  console.log('🎬 New movie detected, updating currentMovie');
                  currentMovieIdRef.current = movie.id;
                  setCurrentMovie(movie);
                } else {
                  console.log('🎬 Same movie, skipping currentMovie update');
                }
                setAnswerOptions(data.currentMovie.options || []);
                setRemovedAnswers(data.currentMovie.removedAnswers || []);
              }
            } else if (data.phase === 'decision' && data.wonCard?.movieId) {
              // Decision phase: won movie may only live on wonCard.movieId
              const wonMovie = movies.find(
                (m) => String(m.id) === String(data.wonCard.movieId)
              );
              if (wonMovie) {
                if (currentMovieIdRef.current !== wonMovie.id) {
                  currentMovieIdRef.current = wonMovie.id;
                  setCurrentMovie(wonMovie);
                }
              }
            } else if (currentMovieIdRef.current !== null) {
              console.log('🎬 Movie cleared from Firebase');
              currentMovieIdRef.current = null;
              setCurrentMovie(null);
            }
          }
          setIsInitializing(false);
        });

        setLoading(false);
      } catch (err) {
        console.error('❌ Init error:', err);
        setError(err.message);
        setLoading(false);
        setIsInitializing(false);
      }
    };

    initGame();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [roomCode, playerId, language]);

  const teamFromGame = gameState?.playerTeams?.[playerId];
  const currentPlayerTeam =
    teamFromGame === 'A' || teamFromGame === 'B' ? teamFromGame : lobbyTeam;

  return {
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
  };
};