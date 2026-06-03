// src/utils/gameLogic.js
import { ref, get } from 'firebase/database';
import { database } from '../firebase';
import { getTrailerUrl } from './trailerUrl';

const MOVIES_CACHE_KEY = 'cinemaster_movies_cache_v2';
const MOVIES_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

let moviesMemoryCache = null;
let moviesLoadPromise = null;
const trailerPreloadCache = new Map();

function readMoviesFromStorage() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(MOVIES_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.movies) || !parsed.movies.length) {
      return null;
    }

    if (Date.now() - (parsed.savedAt || 0) > MOVIES_CACHE_TTL_MS) {
      window.localStorage.removeItem(MOVIES_CACHE_KEY);
      return null;
    }

    return parsed.movies;
  } catch (error) {
    console.warn('⚠️ Failed to read movies cache:', error);
    return null;
  }
}

function writeMoviesToStorage(movies) {
  if (typeof window === 'undefined' || !Array.isArray(movies) || !movies.length) return;

  try {
    window.localStorage.setItem(
      MOVIES_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        movies,
      })
    );
  } catch (error) {
    console.warn('⚠️ Failed to persist movies cache:', error);
  }
}

async function fetchMoviesFromStaticJson() {
  if (typeof fetch !== 'function') return [];

  const response = await fetch('/movies-clean.json', { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Static movies fallback failed (${response.status})`);
  }

  const payload = await response.json();
  if (Array.isArray(payload)) {
    return payload;
  }

  return Array.isArray(payload?.movies) ? payload.movies : [];
}

export function primeMoviesCache(movies) {
  if (!Array.isArray(movies) || !movies.length) return [];

  moviesMemoryCache = movies;
  writeMoviesToStorage(movies);
  return movies;
}

/**
 * Game Logic Utilities
 * All helper functions for game mechanics
 */

// Load movies from Firebase Realtime Database
export async function loadMoviesData({ forceRefresh = false } = {}) {
  if (!forceRefresh && Array.isArray(moviesMemoryCache) && moviesMemoryCache.length) {
    return moviesMemoryCache;
  }

  if (!forceRefresh) {
    const storedMovies = readMoviesFromStorage();
    if (storedMovies?.length) {
      console.log(`⚡ Using cached movies data (${storedMovies.length} movies)`);
      moviesMemoryCache = storedMovies;
      return storedMovies;
    }
  }

  if (!forceRefresh && moviesLoadPromise) {
    return moviesLoadPromise;
  }

  moviesLoadPromise = (async () => {
    try {
      console.log('📥 Loading movies from Firebase Database...');

      const moviesRef = ref(database, 'movies/movies');
      const snapshot = await get(moviesRef);

      if (!snapshot.exists()) {
        throw new Error('Movies data not found in database');
      }

      const movies = snapshot.val();
      console.log(`✅ Loaded ${movies.length} movies from Firebase Database`);
      return primeMoviesCache(movies);
    } catch (error) {
      console.error('❌ Error loading movies from Firebase:', error);

      try {
        const fallbackMovies = await fetchMoviesFromStaticJson();
        if (fallbackMovies.length) {
          console.log(`🛟 Loaded ${fallbackMovies.length} movies from static fallback`);
          return primeMoviesCache(fallbackMovies);
        }
      } catch (fallbackError) {
        console.error('❌ Static movies fallback failed:', fallbackError);
      }

      const storedMovies = readMoviesFromStorage();
      if (storedMovies?.length) {
        console.log(`🛟 Falling back to persisted movies cache (${storedMovies.length} movies)`);
        moviesMemoryCache = storedMovies;
        return storedMovies;
      }

      return [];
    } finally {
      moviesLoadPromise = null;
    }
  })();

  return moviesLoadPromise;
}

// Select random anchor cards for both teams
export function selectAnchorCards(allMovies) {
  if (allMovies.length < 2) return null;
  
  const shuffled = [...allMovies].sort(() => Math.random() - 0.5);
  return {
    teamA: shuffled[0],
    teamB: shuffled[1]
  };
}

export const RACE_OPTIONS_COUNT = 4;
export const DEFAULT_OPTIONS_COUNT = 10;

export function buildLobbyWarmupPayload(allMovies, language = 'en', { isRaceMode = false } = {}) {
  const anchors = selectAnchorCards(allMovies);
  if (!anchors) {
    throw new Error('Failed to prepare anchor cards');
  }

  const usedMovieIds = [anchors.teamA.id, anchors.teamB.id];
  const firstRoundMovie = selectNextMovie(
    allMovies,
    usedMovieIds,
    [anchors.teamA],
    [anchors.teamB],
    'A'
  );

  if (!firstRoundMovie) {
    throw new Error('Failed to prepare the first round movie');
  }

  const optionsCount = isRaceMode ? RACE_OPTIONS_COUNT : DEFAULT_OPTIONS_COUNT;

  return {
    version: 1,
    preparedAt: Date.now(),
    anchorCards: anchors,
    pendingFirstRound: {
      movieId: firstRoundMovie.id,
      currentTurn: 'A',
      options: generateAnswerOptions(firstRoundMovie, allMovies, language, optionsCount),
    },
    usedMovieIds,
  };
}

// Helper function to get connection points - EXPORTED
export function getConnectionPoints(connectionType) {
  switch (connectionType) {
    case 'actor':
      return 5;
    case 'director':
      return 4;
    case 'year':
      return 2;
    default:
      return 0;
  }
}

// Build movies index for fast lookups
export function buildMoviesIndex(allMovies) {
  console.log('🔨 Building movies index...');
  
  const actorsIndex = {};
  const directorsIndex = {};
  const yearsIndex = {};
  
  for (const movie of allMovies) {
    // Index actors
    if (movie.cast && Array.isArray(movie.cast)) {
      for (const actor of movie.cast) {
        if (actor && actor.name && actor.name.en) {
          const actorName = actor.name.en.trim();
          if (!actorsIndex[actorName]) {
            actorsIndex[actorName] = [];
          }
          actorsIndex[actorName].push(movie.id);
        }
      }
    }
    
    // Index director
    if (movie.director && movie.director.name && movie.director.name.en) {
      const directorName = movie.director.name.en.trim();
      if (!directorsIndex[directorName]) {
        directorsIndex[directorName] = [];
      }
      directorsIndex[directorName].push(movie.id);
    }
    
    // Index year
    if (movie.year) {
      if (!yearsIndex[movie.year]) {
        yearsIndex[movie.year] = [];
      }
      yearsIndex[movie.year].push(movie.id);
    }
  }
  
  console.log(`✅ Index built: ${Object.keys(actorsIndex).length} actors, ${Object.keys(directorsIndex).length} directors, ${Object.keys(yearsIndex).length} years`);
  
  return {
    actors: actorsIndex,
    directors: directorsIndex,
    years: yearsIndex
  };
}

/** Normalize movie IDs for set lookups (Firebase may store numbers as strings). */
export function normalizeMovieId(id) {
  return id == null ? '' : String(id);
}

export function buildUsedMovieIdSet(usedMovieIds) {
  const list = Array.isArray(usedMovieIds)
    ? usedMovieIds
    : usedMovieIds
      ? Object.values(usedMovieIds)
      : [];
  return new Set(list.map(normalizeMovieId).filter(Boolean));
}

// Cache the (expensive, O(n^2)-ish) degree computation per allMovies reference.
const _connectionDegreeCache = new WeakMap();

/**
 * For each movie, count how many DISTINCT other movies connect to it via the
 * three game connection types: shared top-billed actor, shared director, OR
 * same release year. Movies that connect to many others (star-studded casts
 * AND/OR crowded release years) would otherwise be over-shown by the
 * connection-based selection, so we use this degree to down-weight them.
 *
 * Note: including YEAR is essential. Year is the dominant pool-former, so a
 * degree that ignored it would over-boost obscure movies that happen to share
 * a common year and actually make repetition WORSE (verified by simulation).
 *
 * Returns Map<normalizedId, degree>.
 */
export function getConnectionDegrees(allMovies) {
  if (!Array.isArray(allMovies) || !allMovies.length) return new Map();

  const cached = _connectionDegreeCache.get(allMovies);
  if (cached) return cached;

  const nameKey = (n) => (n?.en || '').trim();
  const actorIdx = new Map();
  const dirIdx = new Map();
  const yearIdx = new Map();

  for (const m of allMovies) {
    const id = normalizeMovieId(m.id);
    if (Array.isArray(m.cast)) {
      for (const a of m.cast.slice(0, TOP_CAST_FOR_DECOYS)) {
        const k = nameKey(a?.name);
        if (!k) continue;
        if (!actorIdx.has(k)) actorIdx.set(k, []);
        actorIdx.get(k).push(id);
      }
    }
    const dk = nameKey(m.director?.name);
    if (dk) {
      if (!dirIdx.has(dk)) dirIdx.set(dk, []);
      dirIdx.get(dk).push(id);
    }
    if (m.year != null) {
      if (!yearIdx.has(m.year)) yearIdx.set(m.year, []);
      yearIdx.get(m.year).push(id);
    }
  }

  const linkSets = new Map();
  const addLinks = (idx) => {
    for (const ids of idx.values()) {
      if (ids.length < 2) continue;
      for (const a of ids) {
        if (!linkSets.has(a)) linkSets.set(a, new Set());
        const set = linkSets.get(a);
        for (const b of ids) if (a !== b) set.add(b);
      }
    }
  };
  addLinks(actorIdx);
  addLinks(dirIdx);
  addLinks(yearIdx);

  const degrees = new Map();
  for (const m of allMovies) {
    const id = normalizeMovieId(m.id);
    degrees.set(id, linkSets.get(id)?.size || 0);
  }

  _connectionDegreeCache.set(allMovies, degrees);
  return degrees;
}

/**
 * Pick a movie at random, weighting by 1/(1+degree) so heavily-connected hub
 * movies are chosen less often. This roughly equalizes how frequently each
 * movie is shown across games (a hub appears in ~degree-proportional candidate
 * pools, so a 1/degree pick weight cancels that out). Falls back to uniform.
 */
export function weightedMoviePick(movies, degrees) {
  if (!movies || movies.length === 0) return null;
  if (movies.length === 1) return movies[0];
  if (!degrees || degrees.size === 0) {
    return movies[Math.floor(Math.random() * movies.length)];
  }

  let total = 0;
  const weights = movies.map((m) => {
    const d = degrees.get(normalizeMovieId(m.id)) || 0;
    const w = 1 / (1 + d);
    total += w;
    return w;
  });

  let r = Math.random() * total;
  for (let i = 0; i < movies.length; i++) {
    r -= weights[i];
    if (r <= 0) return movies[i];
  }
  return movies[movies.length - 1];
}

// Select next movie with NEW LOGIC: Random connection type selection (33% each)
export function selectNextMovie(allMovies, usedMovieIds, teamACards, teamBCards, currentTurn) {
  console.log('🎬 ========== SELECT NEXT MOVIE - NEW LOGIC ==========');
  
  // 1. Filter available movies (string-normalized IDs — avoids "42" vs 42 mismatches)
  const usedSet = buildUsedMovieIdSet(usedMovieIds);
  const availableMovies = allMovies.filter(
    (movie) => !usedSet.has(normalizeMovieId(movie.id))
  );
  
  if (availableMovies.length === 0) {
    console.log('❌ No more movies available');
    return null;
  }
  
  console.log(`📊 Available movies: ${availableMovies.length}`);

  // Degrees let us down-weight star-studded "hub" movies so they don't dominate.
  const degrees = getConnectionDegrees(allMovies);

  // 2. Get current team cards
  const currentTeamCards = currentTurn === 'A' ? teamACards : teamBCards;
  console.log(`🎯 Selecting for Team ${currentTurn} - they have ${currentTeamCards.length} cards`);

  if (currentTeamCards.length === 0) {
    console.log('⚠️ Team has no cards yet - returning weighted-random movie');
    return weightedMoviePick(availableMovies, degrees);
  }
  
  // 3. Randomize connection types priority (33% each)
  const connectionTypes = ['actor', 'director', 'year'];
  const shuffledTypes = [...connectionTypes].sort(() => Math.random() - 0.5);
  
  console.log(`🎲 Randomized connection types order: ${shuffledTypes.join(' → ')}`);
  
  // 4. Try each connection type in random order
  for (const requiredType of shuffledTypes) {
    console.log(`\n🔍 Searching for movies with '${requiredType}' connection...`);
    
    const moviesWithType = [];
    
    // Check each available movie
    for (const movie of availableMovies) {
      let hasRequiredConnection = false;
      
      // Check against each team card
      for (const teamCard of currentTeamCards) {
        const connections = findConnection(movie, teamCard);
        
        // Does this movie have the required connection type?
        const hasType = connections.some(conn => conn.type === requiredType);
        
        if (hasType) {
          hasRequiredConnection = true;
          break; // Found connection, no need to check other team cards
        }
      }
      
      if (hasRequiredConnection) {
        moviesWithType.push(movie);
      }
    }
    
    console.log(`📊 Found ${moviesWithType.length} movies with '${requiredType}' connection`);
    
    // If we found movies with this connection type - pick one (weighted to
    // favor less-connected movies so hubs don't repeat too often).
    if (moviesWithType.length > 0) {
      const selectedMovie = weightedMoviePick(moviesWithType, degrees);
      
      console.log(`✅ SELECTED: "${selectedMovie.title.en}" (${selectedMovie.year})`);
      console.log(`   Connection type: ${requiredType}`);
      console.log(`   Chosen from ${moviesWithType.length} options (weighted by inverse degree)`);
      console.log('🎬 ================================================\n');
      
      return selectedMovie;
    }
  }
  
  // If no movies found with ANY connection type - game should end
  console.log('❌ No movies with any connection type found');
  console.log('🎬 ================================================\n');
  return null;
}

// Get next required connection type (cycle through types)
export function getNextRequiredConnectionType(lastConnectionType) {
  const cycleOrder = ['actor', 'director', 'year'];

  if (!lastConnectionType) {
    return cycleOrder[0]; // Start with actor
  }

  const currentIndex = cycleOrder.indexOf(lastConnectionType);
  const nextIndex = (currentIndex + 1) % cycleOrder.length;

  return cycleOrder[nextIndex];
}

export const MAX_ANSWER_YEAR_GAP = 3;
export const TOP_CAST_FOR_DECOYS = 10;

const shuffleArray = (arr) => [...arr].sort(() => Math.random() - 0.5);

export function getDirectorKey(movie) {
  return movie?.director?.name?.en?.trim() || '';
}

/** Top N cast keys (English name) used to match decoy movies. */
export function getTopCastKeys(movie, limit = TOP_CAST_FOR_DECOYS) {
  if (!movie?.cast || !Array.isArray(movie.cast)) return [];
  return movie.cast
    .slice(0, limit)
    .map((actor) => actor?.name?.en?.trim())
    .filter(Boolean);
}

export function isWithinYearGap(movie, centerYear, gap = MAX_ANSWER_YEAR_GAP) {
  if (!movie?.year || centerYear == null) return false;
  return Math.abs(movie.year - centerYear) <= gap;
}

/** Same director, or any cast member overlaps with source movie's top cast. */
export function sharesDirectorOrTopCast(sourceMovie, candidateMovie) {
  const directorKey = getDirectorKey(sourceMovie);
  if (directorKey && directorKey === getDirectorKey(candidateMovie)) {
    return true;
  }
  const sourceCast = new Set(getTopCastKeys(sourceMovie));
  if (!sourceCast.size || !candidateMovie?.cast?.length) return false;
  return candidateMovie.cast.some((actor) =>
    sourceCast.has(actor?.name?.en?.trim())
  );
}

/**
 * Pick decoy movies for the answer grid (hardest first):
 * 1) year ±3 AND (director OR top-10 cast overlap)
 * 2) year ±3 only
 * 3) director OR cast overlap (any year)
 * 4) any other movie (rare — keeps the game playable)
 */
export function pickDecoyMovies(correctMovie, allMovies, decoyCount) {
  const centerYear = correctMovie?.year;
  const others = allMovies.filter(
    (m) => normalizeMovieId(m.id) !== normalizeMovieId(correctMovie.id)
  );

  const strictPool = others.filter(
    (m) =>
      isWithinYearGap(m, centerYear) && sharesDirectorOrTopCast(correctMovie, m)
  );
  const yearPool = others.filter(
    (m) =>
      isWithinYearGap(m, centerYear) && !strictPool.includes(m)
  );
  const peoplePool = others.filter(
    (m) =>
      !strictPool.includes(m) &&
      !yearPool.includes(m) &&
      sharesDirectorOrTopCast(correctMovie, m)
  );
  const anyPool = others.filter(
    (m) =>
      !strictPool.includes(m) && !yearPool.includes(m) && !peoplePool.includes(m)
  );

  const tiers = [strictPool, yearPool, peoplePool, anyPool];
  const chosen = [];
  const chosenIds = new Set();

  for (const pool of tiers) {
    if (chosen.length >= decoyCount) break;
    for (const movie of shuffleArray(pool)) {
      if (chosen.length >= decoyCount) break;
      const id = normalizeMovieId(movie.id);
      if (chosenIds.has(id)) continue;
      chosen.push(movie);
      chosenIds.add(id);
    }
  }

  return chosen;
}

// Generate answer options (1 correct + decoys) from related movies in the DB.
export function generateAnswerOptions(correctMovie, allMovies, language = 'en', count = 10) {
  const total = Math.max(2, count);
  const decoyCount = total - 1;
  const decoys = pickDecoyMovies(correctMovie, allMovies, decoyCount);

  const titleFor = (movie) => movie?.title?.[language] || movie?.title?.en || '';
  const options = [titleFor(correctMovie)];
  const seen = new Set(options);

  for (const movie of decoys) {
    const title = titleFor(movie);
    if (title && !seen.has(title)) {
      options.push(title);
      seen.add(title);
    }
  }

  // Duplicate titles in DB — fill remaining slots from any unused movie.
  if (options.length < total) {
    const extras = shuffleArray(
      allMovies.filter(
        (m) =>
          normalizeMovieId(m.id) !== normalizeMovieId(correctMovie.id) &&
          !decoys.includes(m)
      )
    );
    for (const movie of extras) {
      if (options.length >= total) break;
      const title = titleFor(movie);
      if (title && !seen.has(title)) {
        options.push(title);
        seen.add(title);
      }
    }
  }

  return shuffleArray(options);
}

// Check if answer is correct
export function checkAnswer(selectedAnswer, correctMovie, language = 'en') {
  return selectedAnswer === correctMovie.title[language];
}

// Find connection between two movies
export function findConnection(movie1, movie2) {
  const connections = [];
  
  // Validate inputs
  if (!movie1 || !movie2) {
    console.warn('⚠️ findConnection: Invalid movie input', { movie1, movie2 });
    return connections;
  }
  
  console.log(`🔗 Checking connections between "${movie1.title?.en}" (${movie1.year}) and "${movie2.title?.en}" (${movie2.year})`);
  
  // 1. Check for same actor/actress
  if (movie1.cast && movie2.cast && Array.isArray(movie1.cast) && Array.isArray(movie2.cast)) {
    console.log(`   👥 Checking ${movie1.cast.length} actors vs ${movie2.cast.length} actors`);
    
    for (const actor1 of movie1.cast) {
      if (!actor1 || !actor1.name || !actor1.name.en) continue;
      
      for (const actor2 of movie2.cast) {
        if (!actor2 || !actor2.name || !actor2.name.en) continue;
        
        if (actor1.name.en.trim() === actor2.name.en.trim()) {
          console.log(`   ✅ ACTOR MATCH: ${actor1.name.en}`);
          connections.push({
            type: 'actor',
            value: actor1.name,
            actor: actor1
          });
        }
      }
    }
  }
  
  // 2. Check for same director
  if (movie1.director && movie2.director && 
      movie1.director.name && movie2.director.name &&
      movie1.director.name.en && movie2.director.name.en) {
    
    if (movie1.director.name.en.trim() === movie2.director.name.en.trim()) {
      console.log(`   ✅ DIRECTOR MATCH: ${movie1.director.name.en}`);
      connections.push({
        type: 'director',
        value: movie1.director.name,
        director: movie1.director
      });
    }
  }
  
  // 3. Check for same year
  if (movie1.year && movie2.year && movie1.year === movie2.year) {
    console.log(`   ✅ YEAR MATCH: ${movie1.year}`);
    connections.push({
      type: 'year',
      value: movie1.year
    });
  }
  
  if (connections.length === 0) {
    console.log(`   ❌ No connections found`);
  } else {
    console.log(`   ✅ Found ${connections.length} connection(s):`, connections.map(c => c.type));
  }
  
  return connections;
}

// Validate connection attempt
export function validateConnection(sourceCard, targetCard, connectionType) {
  const connections = findConnection(sourceCard, targetCard);
  
  // Check if the claimed connection type exists
  const validConnection = connections.find(conn => conn.type === connectionType);
  
  return {
    valid: !!validConnection,
    connection: validConnection || null,
    allConnections: connections
  };
}

// 🆕 NEW FUNCTION: Find all possible connections for a card
export function findAllPossibleConnections(wonCard, teamCards) {
  const possibleConnections = [];
  
  for (const teamCard of teamCards) {
    const connections = findConnection(wonCard, teamCard);
    
    if (connections.length > 0) {
      possibleConnections.push({
        targetCard: teamCard,
        connections: connections
      });
    }
  }
  
  return possibleConnections;
}

// Get hint for failed connection attempt - UPDATED
export function getConnectionHint(sourceCard, targetCard, language = 'en') {
  const connections = findConnection(sourceCard, targetCard);
  
  if (connections.length === 0) {
    return {
      hasHint: false,
      message: language === 'he' 
        ? 'אין קשר בין הסרטים האלה'
        : 'No connection found between these movies'
    };
  }
  
  const firstConnection = connections[0];
  let hintMessage = '';
  
  switch (firstConnection.type) {
    case 'actor':
      hintMessage = language === 'he'
        ? `רמז: הסרטים מקושרים דרך השחקן/ית ${firstConnection.value.he}`
        : `Hint: The movies are connected through actor ${firstConnection.value.en}`;
      break;
    case 'director':
      hintMessage = language === 'he'
        ? `רמז: הסרטים מקושרים דרך הבמאי ${firstConnection.value.he}`
        : `Hint: The movies are connected through director ${firstConnection.value.en}`;
      break;
    case 'year':
      hintMessage = language === 'he'
        ? `רמז: שני הסרטים יצאו באותה שנה (${firstConnection.value})`
        : `Hint: Both movies were released in the same year (${firstConnection.value})`;
      break;
    default:
      hintMessage = language === 'he'
        ? 'רמז: יש קשר בין הסרטים'
        : 'Hint: There is a connection between the movies';
  }
  
  return {
    hasHint: true,
    message: hintMessage,
    connectionType: firstConnection.type
  };
}

// Check win condition
export function checkWinCondition(teamCards) {
  return teamCards.length >= 10;
}

// Initialize game state
export function initializeGameState(anchorCards, { pendingFirstRound = null } = {}) {
  return {
    phase: 'anchorReveal', // 'anchorReveal', 'playing', 'decision', 'finished'
    currentTurn: 'A', // 'A' or 'B'
    currentMovie: null,
    currentMovieAttempts: [], // Track which teams already attempted
    
    teamA: {
      cards: [anchorCards.teamA],
      tokens: 0,
      score: 1
    },
    
    teamB: {
      cards: [anchorCards.teamB],
      tokens: 0,
      score: 1
    },
    
    usedMovieIds: [anchorCards.teamA.id, anchorCards.teamB.id],
    pendingFirstRound,
    
    roundNumber: 0,
    winner: null,
    lastConnectionType: null
  };
}

// Get success message for connection - IMPROVED
export function getSuccessMessage(connectionType, connectionData, language = 'en') {
  switch (connectionType) {
    case 'actor':
      return language === 'he'
        ? `נכון! השחקן/ית ${connectionData.value.he} משחק/ת ב-2 הסרטים`
        : `Correct! The actor ${connectionData.value.en} played in both movies`;
    
    case 'director':
      return language === 'he'
        ? `נכון! שניהם בוימו על ידי ${connectionData.value.he}`
        : `Correct! Both directed by ${connectionData.value.en}`;
    
    case 'year':
      return language === 'he'
        ? `נכון! שניהם יצאו ב-${connectionData.value}`
        : `Correct! Both released in ${connectionData.value}`;
    
    default:
      return language === 'he' ? 'נכון!' : 'Correct!';
  }
}

// Preload trailer videos
export function preloadTrailer(movieOrId) {
  const movie = typeof movieOrId === 'string' ? { id: movieOrId } : movieOrId;
  const movieId = movie?.id;
  const src = getTrailerUrl(movie);

  if (!movieId || !src || typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  const cacheKey = `${movieId}:${src}`;
  const cachedPromise = trailerPreloadCache.get(cacheKey);
  if (cachedPromise) {
    return cachedPromise;
  }

  const preloadPromise = new Promise((resolve, reject) => {
    const video = document.createElement('video');
    let timeoutId = null;

    const cleanup = () => {
      video.removeEventListener('canplaythrough', handleReady);
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('error', handleError);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

    const handleReady = () => {
      cleanup();
      resolve(video);
    };

    const handleError = () => {
      cleanup();
      trailerPreloadCache.delete(cacheKey);
      reject(new Error('Failed to load trailer'));
    };

    video.src = src;
    video.preload = 'auto';
    video.addEventListener('canplaythrough', handleReady, { once: true });
    video.addEventListener('loadeddata', handleReady, { once: true });
    video.addEventListener('error', handleError, { once: true });

    timeoutId = setTimeout(() => {
      cleanup();
      trailerPreloadCache.delete(cacheKey);
      reject(new Error('Trailer loading timeout'));
    }, 45000);

    video.load();
  });

  trailerPreloadCache.set(cacheKey, preloadPromise);
  return preloadPromise;
}

export function preloadPoster(url) {
  if (!url || typeof Image === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(url);
    img.onerror = () => reject(new Error('Failed to load poster'));
    img.src = url;
  });
}