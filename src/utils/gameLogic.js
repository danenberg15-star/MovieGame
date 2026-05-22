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

// Select next movie with NEW LOGIC: Random connection type selection (33% each)
export function selectNextMovie(allMovies, usedMovieIds, teamACards, teamBCards, currentTurn) {
  console.log('🎬 ========== SELECT NEXT MOVIE - NEW LOGIC ==========');
  
  // 1. Filter available movies
  const availableMovies = allMovies.filter(
    movie => !usedMovieIds.includes(movie.id)
  );
  
  if (availableMovies.length === 0) {
    console.log('❌ No more movies available');
    return null;
  }
  
  console.log(`📊 Available movies: ${availableMovies.length}`);
  
  // 2. Get current team cards
  const currentTeamCards = currentTurn === 'A' ? teamACards : teamBCards;
  console.log(`🎯 Selecting for Team ${currentTurn} - they have ${currentTeamCards.length} cards`);
  
  if (currentTeamCards.length === 0) {
    console.log('⚠️ Team has no cards yet - returning random movie');
    const randomIndex = Math.floor(Math.random() * availableMovies.length);
    return availableMovies[randomIndex];
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
    
    // If we found movies with this connection type - pick one randomly
    if (moviesWithType.length > 0) {
      const randomIndex = Math.floor(Math.random() * moviesWithType.length);
      const selectedMovie = moviesWithType[randomIndex];
      
      console.log(`✅ SELECTED: "${selectedMovie.title.en}" (${selectedMovie.year})`);
      console.log(`   Connection type: ${requiredType}`);
      console.log(`   Chosen from ${moviesWithType.length} options`);
      console.log('🎬 ================================================\n');
      
      return selectedMovie;
    }
  }
  
  // If no movies found with ANY connection type - game should end
  console.log('❌ No movies with any connection type found');
  console.log('🎬 ================================================\n');
  return null;
}

// Optimized movie selection using index
function selectNextMovieOptimized(availableMovies, currentTeamCards, requiredConnectionType, moviesIndex) {
  console.log('🚀 Using optimized movie selection with index');
  
  // Step 1: Collect all unique attributes from current team cards
  const actorNames = new Set();
  const directorNames = new Set();
  const years = new Set();
  
  for (const card of currentTeamCards) {
    // Collect actors
    if (card.cast && Array.isArray(card.cast)) {
      for (const actor of card.cast) {
        if (actor && actor.name && actor.name.en) {
          actorNames.add(actor.name.en.trim());
        }
      }
    }
    
    // Collect director
    if (card.director && card.director.name && card.director.name.en) {
      directorNames.add(card.director.name.en.trim());
    }
    
    // Collect year
    if (card.year) {
      years.add(card.year);
    }
  }
  
  console.log(`🔍 Step 1: Collected ${actorNames.size} unique actors, ${directorNames.size} unique directors, ${years.size} unique years from team cards`);
  
  // Step 2: Find candidate movies from index
  const candidateMovieIds = new Set();
  
  // Add movies with matching actors
  for (const actorName of actorNames) {
    if (moviesIndex.actors[actorName]) {
      for (const movieId of moviesIndex.actors[actorName]) {
        candidateMovieIds.add(movieId);
      }
    }
  }
  console.log(`   👥 Found ${candidateMovieIds.size} movies with matching actors`);
  
  // Add movies with matching directors
  const beforeDirectors = candidateMovieIds.size;
  for (const directorName of directorNames) {
    if (moviesIndex.directors[directorName]) {
      for (const movieId of moviesIndex.directors[directorName]) {
        candidateMovieIds.add(movieId);
      }
    }
  }
  console.log(`   🎬 Added ${candidateMovieIds.size - beforeDirectors} movies with matching directors`);
  
  // Add movies with matching years
  const beforeYears = candidateMovieIds.size;
  for (const year of years) {
    if (moviesIndex.years[year]) {
      for (const movieId of moviesIndex.years[year]) {
        candidateMovieIds.add(movieId);
      }
    }
  }
  console.log(`   📅 Added ${candidateMovieIds.size - beforeYears} movies with matching years`);
  console.log(`   ✅ Total candidate movies: ${candidateMovieIds.size}`);
  
  // Step 3: Filter to only available (unused) movies
  const candidateMovies = availableMovies.filter(movie => candidateMovieIds.has(movie.id));
  console.log(`🔍 Step 3: After filtering used movies: ${candidateMovies.length} candidates remaining`);
  
  if (candidateMovies.length === 0) {
    console.log('❌ No candidate movies found');
    return null;
  }
  
  // Step 4: Score each candidate
  console.log('🔍 Step 4: Scoring candidates...');
  const moviesWithScores = [];
  
  for (const movie of candidateMovies) {
    let score = 0;
    let hasRequiredType = false;
    const connectionTypes = new Set();
    
    // Check connections with ALL current team cards
    for (const teamCard of currentTeamCards) {
      const connections = findConnection(movie, teamCard);
      
      for (const conn of connections) {
        connectionTypes.add(conn.type);
        score += getConnectionPoints(conn.type);
        
        if (requiredConnectionType && conn.type === requiredConnectionType) {
          hasRequiredType = true;
        }
      }
    }
    
    // If required type specified, only include movies with that type
    if (requiredConnectionType) {
      if (hasRequiredType) {
        moviesWithScores.push({ movie, score });
        console.log(`   ✅ "${movie.title.en}" - [${Array.from(connectionTypes)}] + has required type '${requiredConnectionType}' (score: ${score})`);
      }
    } else {
      if (connectionTypes.size > 0) {
        moviesWithScores.push({ movie, score });
        console.log(`   ✅ "${movie.title.en}" - [${Array.from(connectionTypes)}] (score: ${score})`);
      }
    }
  }
  
  if (moviesWithScores.length === 0) {
    if (requiredConnectionType) {
      console.log(`⚠️ No movies found with required type '${requiredConnectionType}'`);
      // Try again without type requirement
      return selectNextMovieOptimized(availableMovies, currentTeamCards, null, moviesIndex);
    }
    console.log('❌ No scored movies found');
    return null;
  }
  
  return pickFromTopScored(moviesWithScores, 'current team');
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
export function initializeGameState(anchorCards, allMovies, moviesIndex) {
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
    moviesIndex: moviesIndex, // Add index to state
    
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
    
    case 'year':
      return language === 'he'
        ? `צדקתם! שניהם יצאו ב-${connectionData.value}`
        : `Correct! Both released in ${connectionData.value}`;
    
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