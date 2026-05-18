// src/utils/gameLogic.js
import { ref, get } from 'firebase/database';
import { database } from '../firebase';

/**
 * Game Logic Utilities
 * All helper functions for game mechanics
 */

// Load movies from Firebase Realtime Database
export async function loadMoviesData() {
  try {
    console.log('📥 Loading movies from Firebase Database...');
    
    const moviesRef = ref(database, 'movies/movies');
    const snapshot = await get(moviesRef);
    
    if (!snapshot.exists()) {
      throw new Error('Movies data not found in database');
    }
    
    const movies = snapshot.val();
    console.log(`✅ Loaded ${movies.length} movies from Firebase Database`);
    return movies;
    
  } catch (error) {
    console.error('❌ Error loading movies from Firebase:', error);
    return [];
  }
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

// Helper function to get connection points - EXPORTED
export function getConnectionPoints(connectionType) {
switch (connectionType) {
  case 'actor':
    return 5;
  case 'director':
    return 4;
  case 'producer':
    return 3;
  case 'year':
    return 2;
  case 'oscar':
    return 1;
  default:
    return 0;
}
}

/**
 * Build an index of all movies by actors, directors, and years
 * This allows fast lookup of movies that share these attributes
 * @param {Array} allMovies - All available movies
 * @returns {Object} Index with actors, directors, and years
 */
export function buildMoviesIndex(allMovies) {
  console.log('🔨 Building movies index...');
  
  const index = {
    actors: {},      // { "Actor Name": [movieId1, movieId2, ...] }
    directors: {},   // { "Director Name": [movieId1, movieId2, ...] }
    years: {}        // { 2010: [movieId1, movieId2, ...] }
  };
  
  for (const movie of allMovies) {
    if (!movie || !movie.id) continue;
    
    // Index by actors
    if (movie.cast && Array.isArray(movie.cast)) {
      for (const actor of movie.cast) {
        if (!actor || !actor.name || !actor.name.en) continue;
        
        const actorName = actor.name.en.trim();
        if (!index.actors[actorName]) {
          index.actors[actorName] = [];
        }
        if (!index.actors[actorName].includes(movie.id)) {
          index.actors[actorName].push(movie.id);
        }
      }
    }
    
    // Index by director
    if (movie.director && movie.director.name && movie.director.name.en) {
      const directorName = movie.director.name.en.trim();
      if (!index.directors[directorName]) {
        index.directors[directorName] = [];
      }
      if (!index.directors[directorName].includes(movie.id)) {
        index.directors[directorName].push(movie.id);
      }
    }
    
    // Index by year
    if (movie.year) {
      const year = movie.year;
      if (!index.years[year]) {
        index.years[year] = [];
      }
      if (!index.years[year].includes(movie.id)) {
        index.years[year].push(movie.id);
      }
    }
  }
  
  console.log(`✅ Index built:`);
  console.log(`   - ${Object.keys(index.actors).length} unique actors`);
  console.log(`   - ${Object.keys(index.directors).length} unique directors`);
  console.log(`   - ${Object.keys(index.years).length} unique years`);
  
  return index;
}

// Helper function to pick from top scored movies
function pickFromTopScored(moviesWithScores, description) {
// Sort by score (highest first)
moviesWithScores.sort((a, b) => b.score - a.score);

// Pick from top 3 to add some variety
const topMovies = moviesWithScores.slice(0, Math.min(3, moviesWithScores.length));
const randomIndex = Math.floor(Math.random() * topMovies.length);

console.log(`🎯 Smart selection: Picked movie connecting to ${description} with score ${topMovies[randomIndex].score}`);
return topMovies[randomIndex].movie;
}

// Select next movie with OPTIMIZED algorithm using index
export function selectNextMovie(allMovies, usedMovieIds, teamACards, teamBCards, currentTurn, requiredConnectionType = null, moviesIndex = null) {
  console.log('');
  console.log('🎬🎬🎬 ===== SELECT NEXT MOVIE START (OPTIMIZED) ===== 🎬🎬🎬');
  console.log(`📍 Current turn: Team ${currentTurn}`);
  console.log(`🎨 Required connection type: ${requiredConnectionType || 'ANY'}`);
  console.log(`📦 Team A has ${teamACards.length} cards`);
  console.log(`📦 Team B has ${teamBCards.length} cards`);
  console.log(`🚫 Used movies: ${usedMovieIds.length}`);
  
  // Get current team cards
  const currentTeamCards = currentTurn === 'A' ? teamACards : teamBCards;
  const otherTeamCards = currentTurn === 'A' ? teamBCards : teamACards;
  
  console.log(`🎯 Current team (Team ${currentTurn}) has ${currentTeamCards.length} cards to connect with`);
  
  // If no index provided, fall back to old method
  if (!moviesIndex) {
    console.log('⚠️ No index provided - this should not happen!');
    return null;
  }
  
  // Step 1: Collect all actors, directors, and years from current team's cards
  const targetActors = new Set();
  const targetDirectors = new Set();
  const targetYears = new Set();
  
  console.log('🔍 Step 1: Collecting attributes from team cards...');
  
  for (const card of currentTeamCards) {
    // Collect actors
    if (card.cast && Array.isArray(card.cast)) {
      for (const actor of card.cast) {
        if (actor && actor.name && actor.name.en) {
          targetActors.add(actor.name.en.trim());
        }
      }
    }
    
    // Collect director
    if (card.director && card.director.name && card.director.name.en) {
      targetDirectors.add(card.director.name.en.trim());
    }
    
    // Collect year
    if (card.year) {
      targetYears.add(card.year);
    }
  }
  
  console.log(`   👥 Found ${targetActors.size} unique actors`);
  console.log(`   🎬 Found ${targetDirectors.size} unique directors`);
  console.log(`   📅 Found ${targetYears.size} unique years`);
  
  // Step 2: Find candidate movies using the index
  const candidateMovieIds = new Set();
  
  console.log('🔍 Step 2: Finding candidate movies from index...');
  
  // Find movies by actors
  for (const actorName of targetActors) {
    if (moviesIndex.actors[actorName]) {
      for (const movieId of moviesIndex.actors[actorName]) {
        candidateMovieIds.add(movieId);
      }
    }
  }
  console.log(`   👥 Found ${candidateMovieIds.size} movies with matching actors`);
  
  // Find movies by directors
  const beforeDirectors = candidateMovieIds.size;
  for (const directorName of targetDirectors) {
    if (moviesIndex.directors[directorName]) {
      for (const movieId of moviesIndex.directors[directorName]) {
        candidateMovieIds.add(movieId);
      }
    }
  }
  console.log(`   🎬 Added ${candidateMovieIds.size - beforeDirectors} movies with matching directors`);
  
  // Find movies by years
  const beforeYears = candidateMovieIds.size;
  for (const year of targetYears) {
    if (moviesIndex.years[year]) {
      for (const movieId of moviesIndex.years[year]) {
        candidateMovieIds.add(movieId);
      }
    }
  }
  console.log(`   📅 Added ${candidateMovieIds.size - beforeYears} movies with matching years`);
  console.log(`   ✅ Total candidate movies: ${candidateMovieIds.size}`);
  
  // Step 3: Filter out used movies and get full movie objects
  const candidateMovies = [];
  const movieMap = {};
  
  for (const movie of allMovies) {
    movieMap[movie.id] = movie;
  }
  
  for (const movieId of candidateMovieIds) {
    if (!usedMovieIds.includes(movieId)) {
      const movie = movieMap[movieId];
      if (movie) {
        candidateMovies.push(movie);
      }
    }
  }
  
  console.log(`🔍 Step 3: After filtering used movies: ${candidateMovies.length} candidates remaining`);
  
  if (candidateMovies.length === 0) {
    console.log('❌ No candidate movies found!');
    console.log('🎬🎬🎬 ===== SELECT NEXT MOVIE END (NULL) ===== 🎬🎬🎬');
    console.log('');
    return null;
  }
  
  // Step 4: Score each candidate and check connection type
  console.log('🔍 Step 4: Scoring candidates...');
  
  const moviesWithConnectionsToBoth = [];
  const moviesWithConnectionsToCurrent = [];
  
  for (const movie of candidateMovies) {
    let connectionScoreCurrent = 0;
    let connectionScoreAll = 0;
    let hasConnectionToCurrent = false;
    let hasConnectionToOther = false;
    let hasRequiredConnectionTypeToCurrent = false;
    let connectionTypes = [];
    
    // Check connections with current team cards
    for (const teamCard of currentTeamCards) {
      const connections = findConnection(movie, teamCard);
      
      if (connections.length > 0) {
        hasConnectionToCurrent = true;
        
        for (const conn of connections) {
          connectionTypes.push(conn.type);
          const points = getConnectionPoints(conn.type);
          connectionScoreCurrent += points;
          connectionScoreAll += points;
          
          // Check if required connection type exists
          if (requiredConnectionType && conn.type === requiredConnectionType) {
            hasRequiredConnectionTypeToCurrent = true;
          }
        }
      }
    }
    
    // Check connections with other team cards
    for (const teamCard of otherTeamCards) {
      const connections = findConnection(movie, teamCard);
      
      if (connections.length > 0) {
        hasConnectionToOther = true;
        
        for (const conn of connections) {
          connectionScoreAll += getConnectionPoints(conn.type);
        }
      }
    }
    
    // Apply filtering based on required connection type
    if (requiredConnectionType) {
      if (hasRequiredConnectionTypeToCurrent) {
        if (hasConnectionToOther) {
          console.log(`   ✅ "${movie.title?.en}" - HAS '${requiredConnectionType}' + both teams (score: ${connectionScoreAll})`);
          moviesWithConnectionsToBoth.push({ movie, score: connectionScoreAll });
        } else {
          console.log(`   ✅ "${movie.title?.en}" - HAS '${requiredConnectionType}' + current team (score: ${connectionScoreCurrent})`);
          moviesWithConnectionsToCurrent.push({ movie, score: connectionScoreCurrent });
        }
      } else if (hasConnectionToCurrent) {
        console.log(`   ⚠️ "${movie.title?.en}" - Has [${connectionTypes.join(',')}] but NOT '${requiredConnectionType}' - SKIPPING`);
      }
    } else {
      // No required type - accept any connection
      if (hasConnectionToCurrent) {
        if (hasConnectionToOther) {
          console.log(`   ✅ "${movie.title?.en}" - [${connectionTypes.join(',')}] + both teams (score: ${connectionScoreAll})`);
          moviesWithConnectionsToBoth.push({ movie, score: connectionScoreAll });
        } else {
          console.log(`   ✅ "${movie.title?.en}" - [${connectionTypes.join(',')}] + current team (score: ${connectionScoreCurrent})`);
          moviesWithConnectionsToCurrent.push({ movie, score: connectionScoreCurrent });
        }
      }
    }
  }
  
  console.log('');
  console.log(`📊 RESULTS:`);
  console.log(`   - Movies connecting to BOTH teams: ${moviesWithConnectionsToBoth.length}`);
  console.log(`   - Movies connecting to CURRENT team: ${moviesWithConnectionsToCurrent.length}`);
  console.log(`   - Total movies with valid connections: ${moviesWithConnectionsToBoth.length + moviesWithConnectionsToCurrent.length}`);
  
  // Priority 1: Movies that connect to both teams
  if (moviesWithConnectionsToBoth.length > 0) {
    const selected = pickFromTopScored(moviesWithConnectionsToBoth, 'both teams');
    console.log(`🎯 SELECTED: "${selected.title?.en}" (connects to both teams)`);
    console.log('🎬🎬🎬 ===== SELECT NEXT MOVIE END (SUCCESS) ===== 🎬🎬🎬');
    console.log('');
    return selected;
  }
  
  // Priority 2: Movies that connect to current team only
  if (moviesWithConnectionsToCurrent.length > 0) {
    const selected = pickFromTopScored(moviesWithConnectionsToCurrent, `Team ${currentTurn}`);
    console.log(`🎯 SELECTED: "${selected.title?.en}" (connects to Team ${currentTurn})`);
    console.log('🎬🎬🎬 ===== SELECT NEXT MOVIE END (SUCCESS) ===== 🎬🎬🎬');
    console.log('');
    return selected;
  }
  
  // Fallback: If required type specified and nothing found, try without the filter
  if (requiredConnectionType) {
    console.log('');
    console.log(`⚠️⚠️⚠️ WARNING: No movies with required type '${requiredConnectionType}'`);
    console.log(`🔄 Trying again WITHOUT the type filter...`);
    console.log('');
    
    const moviesWithAnyConnection = [];
    
    for (const movie of candidateMovies) {
      let score = 0;
      let hasConnection = false;
      
      for (const teamCard of currentTeamCards) {
        const connections = findConnection(movie, teamCard);
        if (connections.length > 0) {
          hasConnection = true;
          for (const conn of connections) {
            score += getConnectionPoints(conn.type);
          }
        }
      }
      
      if (hasConnection) {
        console.log(`   ✅ "${movie.title?.en}" - Has ANY connection (score: ${score})`);
        moviesWithAnyConnection.push({ movie, score });
      }
    }
    
    if (moviesWithAnyConnection.length > 0) {
      const selected = pickFromTopScored(moviesWithAnyConnection, `Team ${currentTurn} (any type)`);
      console.log(`🎯 SELECTED: "${selected.title?.en}" (fallback - any type)`);
      console.log('🎬🎬🎬 ===== SELECT NEXT MOVIE END (SUCCESS - FALLBACK) ===== 🎬🎬🎬');
      console.log('');
      return selected;
    }
  }
  
  // No valid movies found
  console.log('');
  console.log('❌❌❌ CRITICAL: NO VALID MOVIES FOUND!');
  console.log(`   - Candidates checked: ${candidateMovies.length}`);
  console.log(`   - Team ${currentTurn} has ${currentTeamCards.length} cards`);
  console.log(`   - Required type: ${requiredConnectionType || 'ANY'}`);
  console.log('❌ Game cannot continue - returning NULL');
  console.log('🎬🎬🎬 ===== SELECT NEXT MOVIE END (FAILED - NULL) ===== 🎬🎬🎬');
  console.log('');
  return null;
}

// Get next required connection type (cycle through types)
export function getNextRequiredConnectionType(lastConnectionType) {
const cycleOrder = ['actor', 'director', 'producer', 'year', 'oscar'];

if (!lastConnectionType) {
  return cycleOrder[0]; // Start with actor
}

const currentIndex = cycleOrder.indexOf(lastConnectionType);
const nextIndex = (currentIndex + 1) % cycleOrder.length;

return cycleOrder[nextIndex];
}

// Generate 10 answer options (1 correct + 9 decoys)
export function generateAnswerOptions(correctMovie, allMovies, language = 'en') {
  const options = [correctMovie.title[language]];
  
  // Use decoy answers from the movie data
  const decoys = correctMovie.decoy_answers[language] || [];
  
  // Add decoys (up to 9)
  for (let i = 0; i < Math.min(9, decoys.length); i++) {
    options.push(decoys[i]);
  }
  
  // If not enough decoys, add random movies
  if (options.length < 10) {
    const otherMovies = allMovies.filter(m => m.id !== correctMovie.id);
    const shuffled = otherMovies.sort(() => Math.random() - 0.5);
    
    for (let i = 0; options.length < 10 && i < shuffled.length; i++) {
      const title = shuffled[i].title[language];
      if (!options.includes(title)) {
        options.push(title);
      }
    }
  }
  
  // Shuffle options
  return options.sort(() => Math.random() - 0.5);
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
  
  console.log(`   🔗 Checking connections: "${movie1.title?.en}" ↔ "${movie2.title?.en}"`);
  
  // 1. Check for same actor/actress
  if (movie1.cast && movie2.cast && Array.isArray(movie1.cast) && Array.isArray(movie2.cast)) {
    for (const actor1 of movie1.cast) {
      if (!actor1 || !actor1.name || !actor1.name.en) continue;
      
      for (const actor2 of movie2.cast) {
        if (!actor2 || !actor2.name || !actor2.name.en) continue;
        
        if (actor1.name.en.trim() === actor2.name.en.trim()) {
          console.log(`      ✅ ACTOR: ${actor1.name.en}`);
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
      console.log(`      ✅ DIRECTOR: ${movie1.director.name.en}`);
      connections.push({
        type: 'director',
        value: movie1.director.name,
        director: movie1.director
      });
    }
  }
  
  // 3. Check for same producer
  if (movie1.producer && movie2.producer &&
      movie1.producer.name && movie2.producer.name &&
      movie1.producer.name.en && movie2.producer.name.en) {
    
    if (movie1.producer.name.en.trim() === movie2.producer.name.en.trim()) {
      console.log(`      ✅ PRODUCER: ${movie1.producer.name.en}`);
      connections.push({
        type: 'producer',
        value: movie1.producer.name,
        producer: movie1.producer
      });
    }
  }
  
  // 4. Check for same year
  if (movie1.year && movie2.year && movie1.year === movie2.year) {
    console.log(`      ✅ YEAR: ${movie1.year}`);
    connections.push({
      type: 'year',
      value: movie1.year
    });
  }
  
  // 5. Check for same Oscar type
  if (movie1.oscars && movie2.oscars && 
      Array.isArray(movie1.oscars) && Array.isArray(movie2.oscars) &&
      movie1.oscars.length > 0 && movie2.oscars.length > 0) {
    
    for (const oscar1 of movie1.oscars) {
      if (!oscar1 || !oscar1.type || !oscar1.type.en) continue;
      
      for (const oscar2 of movie2.oscars) {
        if (!oscar2 || !oscar2.type || !oscar2.type.en) continue;
        
        if (oscar1.type.en.trim() === oscar2.type.en.trim()) {
          console.log(`      ✅ OSCAR: ${oscar1.type.en}`);
          connections.push({
            type: 'oscar',
            value: oscar1.type
          });
        }
      }
    }
  }
  
  if (connections.length === 0) {
    console.log(`      ❌ No connections`);
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

// Get hint for failed connection attempt
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
    case 'producer':
      hintMessage = language === 'he'
        ? `רמז: הסרטים מקושרים דרך המפיק ${firstConnection.value.he}`
        : `Hint: The movies are connected through producer ${firstConnection.value.en}`;
      break;
    case 'year':
      hintMessage = language === 'he'
        ? `רמז: שני הסרטים יצאו באותה שנה (${firstConnection.value})`
        : `Hint: Both movies were released in the same year (${firstConnection.value})`;
      break;
    case 'oscar':
      hintMessage = language === 'he'
        ? `רמז: שני הסרטים זכו באותו סוג אוסקר`
        : `Hint: Both movies won the same type of Oscar`;
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
export function initializeGameState(anchorCards, allMovies) {
  // Build the movies index for fast lookups
  const moviesIndex = buildMoviesIndex(allMovies);
  
  return {
    phase: 'playing', // 'playing', 'decision', 'finished'
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
    allMovies: allMovies,
    moviesIndex: moviesIndex, // Add the index to game state
    
    roundNumber: 0,
    winner: null,
    lastConnectionType: null
  };
}

// Get success message for connection
export function getSuccessMessage(connectionType, connectionData, language = 'en') {
  switch (connectionType) {
    case 'actor':
      return language === 'he'
        ? `צדקתם! ${connectionData.value.he} שיחק/ה בשני הסרטים`
        : `Correct! ${connectionData.value.en} played in both movies`;
    
    case 'director':
      return language === 'he'
        ? `צדקתם! שניהם בוימו על ידי ${connectionData.value.he}`
        : `Correct! Both directed by ${connectionData.value.en}`;
    
    case 'producer':
      return language === 'he'
        ? `צדקתם! שניהם הופקו על ידי ${connectionData.value.he}`
        : `Correct! Both produced by ${connectionData.value.en}`;
    
    case 'year':
      return language === 'he'
        ? `צדקתם! שניהם יצאו ב-${connectionData.value}`
        : `Correct! Both released in ${connectionData.value}`;
    
    case 'oscar':
      return language === 'he'
        ? `צדקתם! שניהם זכו ב-${connectionData.value.he}`
        : `Correct! Both won ${connectionData.value.en}`;
    
    default:
      return language === 'he' ? 'צדקתם!' : 'Correct!';
  }
}

// Preload trailer videos
export function preloadTrailer(movieId) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = `/assets/movies/${movieId}/trailer.mp4`;
    video.preload = 'auto';
    
    video.addEventListener('canplaythrough', () => resolve(video));
    video.addEventListener('error', () => reject(new Error('Failed to load trailer')));
    
    // Timeout after 30 seconds
    setTimeout(() => reject(new Error('Trailer loading timeout')), 30000);
  });
}