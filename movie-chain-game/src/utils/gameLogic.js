// src/utils/gameLogic.js

/**
 * Game Logic Utilities
 * All helper functions for game mechanics
 */

// Load all movies data
export async function loadMoviesData() {
  try {
    const response = await fetch('/assets/movies/movies-index.json');
    const index = await response.json();
    
    // Load full data for each movie
    const moviesData = await Promise.all(
      index.movies.map(async (movie) => {
        const dataResponse = await fetch(`/assets/movies/${movie.id}/data.json`);
        return await dataResponse.json();
      })
    );
    
    return moviesData;
  } catch (error) {
    console.error('Error loading movies data:', error);
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
      return 3;
    case 'year':
      return 1;
    default:
      return 0;
  }
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

// Select next movie with smart algorithm
export function selectNextMovie(allMovies, usedMovieIds, teamACards, teamBCards, currentTurn, requiredConnectionType = null) {
  // Filter out already used movies
  const availableMovies = allMovies.filter(
    movie => !usedMovieIds.includes(movie.id)
  );
  
  if (availableMovies.length === 0) {
    console.log('❌ No more movies available');
    return null;
  }
  
  // Get current team cards
  const currentTeamCards = currentTurn === 'A' ? teamACards : teamBCards;
  
  console.log(`🎯 Selecting movie for Team ${currentTurn} - they have ${currentTeamCards.length} cards`);
  
  if (requiredConnectionType) {
    console.log(`🎨 Required connection type: ${requiredConnectionType}`);
  }
  
  // Smart algorithm: ONLY movies that have connections
  const moviesWithConnectionsToBoth = [];
  const moviesWithConnectionsToCurrent = [];
  
  for (const movie of availableMovies) {
    let connectionScoreCurrent = 0;
    let connectionScoreAll = 0;
    let hasConnectionToCurrent = false;
    let hasConnectionToOther = false;
    let hasRequiredConnectionTypeToCurrent = false;
    
    // Check connections with current team cards
    for (const teamCard of currentTeamCards) {
      const connections = findConnection(movie, teamCard);
      
      if (connections.length > 0) {
        hasConnectionToCurrent = true;
        
        // Check if required connection type exists
        if (requiredConnectionType) {
          const hasRequiredType = connections.some(conn => conn.type === requiredConnectionType);
          if (hasRequiredType) {
            hasRequiredConnectionTypeToCurrent = true;
          }
        }
        
        // Score based on connection type priority
        for (const conn of connections) {
          const points = getConnectionPoints(conn.type);
          connectionScoreCurrent += points;
          connectionScoreAll += points;
        }
      }
    }
    
    // Check connections with other team cards
    const otherTeamCards = currentTurn === 'A' ? teamBCards : teamACards;
    
    for (const teamCard of otherTeamCards) {
      const connections = findConnection(movie, teamCard);
      
      if (connections.length > 0) {
        hasConnectionToOther = true;
        
        for (const conn of connections) {
          connectionScoreAll += getConnectionPoints(conn.type);
        }
      }
    }
    
    // If required connection type specified, ONLY accept movies with that type
    if (requiredConnectionType) {
      if (hasRequiredConnectionTypeToCurrent) {
        if (hasConnectionToOther) {
          // Best: has required type + connects to both teams
          moviesWithConnectionsToBoth.push({
            movie,
            score: connectionScoreAll
          });
        } else {
          // Good: has required type + connects to current team only
          moviesWithConnectionsToCurrent.push({
            movie,
            score: connectionScoreCurrent
          });
        }
      }
      // Skip movies that don't have the required connection type
    } else {
      // No required type - accept any connection to current team
      if (hasConnectionToCurrent) {
        if (hasConnectionToOther) {
          moviesWithConnectionsToBoth.push({
            movie,
            score: connectionScoreAll
          });
        } else {
          moviesWithConnectionsToCurrent.push({
            movie,
            score: connectionScoreCurrent
          });
        }
      }
    }
  }
  
  console.log(`📊 Movies with connections - Both teams: ${moviesWithConnectionsToBoth.length}, Current team: ${moviesWithConnectionsToCurrent.length}`);
  
  // Priority 1: Movies that connect to both teams
  if (moviesWithConnectionsToBoth.length > 0) {
    return pickFromTopScored(moviesWithConnectionsToBoth, 'both teams');
  }
  
  // Priority 2: Movies that connect to current team only
  if (moviesWithConnectionsToCurrent.length > 0) {
    return pickFromTopScored(moviesWithConnectionsToCurrent, `Team ${currentTurn}`);
  }
  
  // If we're filtering by required type and found nothing, try WITHOUT the filter
  if (requiredConnectionType) {
    console.log(`⚠️ No movies found with required type '${requiredConnectionType}' - trying any connection...`);
    
    // Try again without the required type restriction
    const moviesWithAnyConnection = [];
    
    for (const movie of availableMovies) {
      let hasConnectionToCurrent = false;
      let score = 0;
      
      for (const teamCard of currentTeamCards) {
        const connections = findConnection(movie, teamCard);
        if (connections.length > 0) {
          hasConnectionToCurrent = true;
          for (const conn of connections) {
            score += getConnectionPoints(conn.type);
          }
        }
      }
      
      if (hasConnectionToCurrent) {
        moviesWithAnyConnection.push({ movie, score });
      }
    }
    
    if (moviesWithAnyConnection.length > 0) {
      console.log(`✅ Found ${moviesWithAnyConnection.length} movies with ANY connection type`);
      return pickFromTopScored(moviesWithAnyConnection, `Team ${currentTurn} (any type)`);
    }
  }
  
  // If absolutely NO connections found - game should end
  console.log('❌ No movies with connections found - game cannot continue');
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
export function initializeGameState(anchorCards, allMovies) {
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