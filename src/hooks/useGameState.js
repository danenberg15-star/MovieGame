// src/hooks/useGameState.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { ref, set, onValue, get, update } from 'firebase/database';
import { database } from '../firebase';
import {
  loadMoviesData,
  selectAnchorCards,
  initializeGameState
} from '../utils/gameLogic';

// Read team chosen in lobby (rooms/{code}/players/{id}.team)
const getLobbyTeam = async (roomCode, playerId) => {
  if (!roomCode || roomCode === '99999' || !playerId) return null;
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

// Helper function to sanitize Firebase keys
const sanitizeFirebaseKey = (key) => {
  if (!key) return '';
  // eslint-disable-next-line no-useless-escape
  return key.replace(/[.#$\/\[\]]/g, '_');
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
  const currentMovieIdRef = useRef(null);

  const isQAMode = roomCode === '99999';

  // Build movies index for faster lookups
  const buildMoviesIndex = useCallback((movies) => {
    console.log('🔨 Building movies index...');
    const index = {
      actors: {},
      directors: {},
      years: {}
    };

    movies.forEach(movie => {
      // Index actors (sanitize names for Firebase keys)
      if (movie.cast && Array.isArray(movie.cast)) {
        movie.cast.forEach(actor => {
          if (actor?.name?.en) {
            const sanitizedName = sanitizeFirebaseKey(actor.name.en);
            if (!index.actors[sanitizedName]) {
              index.actors[sanitizedName] = [];
            }
            index.actors[sanitizedName].push(movie.id);
          }
        });
      }

      // Index directors (sanitize names for Firebase keys)
      if (movie.director?.name?.en) {
        const sanitizedName = sanitizeFirebaseKey(movie.director.name.en);
        if (!index.directors[sanitizedName]) {
          index.directors[sanitizedName] = [];
        }
        index.directors[sanitizedName].push(movie.id);
      }

      // Index years
      if (movie.year) {
        const yearKey = `year_${movie.year}`;
        if (!index.years[yearKey]) {
          index.years[yearKey] = [];
        }
        index.years[yearKey].push(movie.id);
      }
    });

    console.log(`✅ Index built: ${Object.keys(index.actors).length} actors, ${Object.keys(index.directors).length} directors, ${Object.keys(index.years).length} years`);
    return index;
  }, []);

  // Initialize game
  useEffect(() => {
    let unsubscribe = null;

    const initGame = async () => {
      try {
        console.log('🎮 Initializing game...', { roomCode, playerId, isQAMode });

        // Load movies data
        const movies = await loadMoviesData();
        if (!movies || movies.length === 0) {
          throw new Error('Failed to load movies data');
        }
        console.log(`✅ Loaded ${movies.length} movies`);
        setAllMovies(movies);

        // Reference to game in Firebase
        const gameRef = ref(database, `games/${roomCode}`);

        // Check if game exists
        const snapshot = await get(gameRef);

        if (!snapshot.exists()) {
          console.log('🆕 Creating new game...');

          // Select anchor cards
          const anchors = selectAnchorCards(movies);
          if (!anchors) {
            throw new Error('Failed to select anchor cards');
          }

          // Build movies index
          const moviesIndex = buildMoviesIndex(movies);
          const lobbyTeam = await getLobbyTeam(roomCode, playerId);
          const creatorTeam = assignTeam(lobbyTeam, {});

          // Initialize game state
          const initialState = {
            ...initializeGameState(anchors, movies),
            roomCode,
            createdAt: Date.now(),
            players: {
              [playerId]: {
                id: playerId,
                name: isQAMode ? 'You' : `Player ${playerId.slice(-4)}`,
                joinedAt: Date.now()
              }
            },
            playerTeams: {
              [playerId]: creatorTeam
            },
            isQAMode,
            moviesIndex
          };

          // Add bot player if QA mode
          if (isQAMode) {
            initialState.players['bot_player'] = {
              id: 'bot_player',
              name: language === 'he' ? '🤖 בוט AI' : '🤖 AI Bot',
              isBot: true,
              joinedAt: Date.now()
            };
            initialState.playerTeams['bot_player'] = 'B';
          }

          // Save to Firebase
          await set(gameRef, initialState);
          console.log('✅ Game created successfully');
        } else {
          console.log('✅ Game exists, joining...');

          const existingGame = snapshot.val();
          const lobbyTeam = await getLobbyTeam(roomCode, playerId);
          const resolvedTeam = assignTeam(lobbyTeam, existingGame.playerTeams);

          if (!existingGame.players?.[playerId]) {
            const playerUpdate = {
              [`players/${playerId}`]: {
                id: playerId,
                name: `Player ${playerId.slice(-4)}`,
                joinedAt: Date.now()
              },
              [`playerTeams/${playerId}`]: resolvedTeam
            };
            await update(gameRef, playerUpdate);
            console.log('✅ Player added to game', { team: resolvedTeam, lobbyTeam });
          } else if (!existingGame.playerTeams?.[playerId]) {
            await update(gameRef, { [`playerTeams/${playerId}`]: resolvedTeam });
            console.log('✅ Backfilled missing player team:', resolvedTeam);
          } else if (lobbyTeam && existingGame.playerTeams?.[playerId] !== lobbyTeam) {
            await update(gameRef, { [`playerTeams/${playerId}`]: lobbyTeam });
            console.log('✅ Synced player team from lobby:', lobbyTeam);
          }
        }

        // Listen to game state changes
        unsubscribe = onValue(gameRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
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
              const movie = movies.find(m => m.id === data.currentMovie.id);
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

    // Cleanup
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [roomCode, playerId, isQAMode, language, buildMoviesIndex]);

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
    setRemovedAnswers
  };
};