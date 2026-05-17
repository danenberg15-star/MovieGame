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
  
  // Select next movie with smart algorithm
  export function selectNextMovie(allMovies, usedMovieIds, teamCards) {
    // Filter out already used movies
    const availableMovies = allMovies.filter(
      movie => !usedMovieIds.includes(movie.id)
    );
    
    if (availableMovies.length === 0) return null;
    
    // TODO: Smart algorithm - prefer movies that have connections to existing cards
    // For now: random selection
    const randomIndex = Math.floor(Math.random() * availableMovies.length);
    return availableMovies[randomIndex];
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
    
    // 1. Check for same actor/actress
    if (movie1.cast && movie2.cast) {
      for (const actor1 of movie1.cast) {
        for (const actor2 of movie2.cast) {
          if (actor1.name.en === actor2.name.en) {
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
    if (movie1.director && movie2.director) {
      if (movie1.director.name.en === movie2.director.name.en) {
        connections.push({
          type: 'director',
          value: movie1.director.name,
          director: movie1.director
        });
      }
    }
    
    // 3. Check for same producer
    if (movie1.producer && movie2.producer) {
      if (movie1.producer.name.en === movie2.producer.name.en) {
        connections.push({
          type: 'producer',
          value: movie1.producer.name,
          producer: movie1.producer
        });
      }
    }
    
    // 4. Check for same year
    if (movie1.year && movie2.year && movie1.year === movie2.year) {
      connections.push({
        type: 'year',
        value: movie1.year
      });
    }
    
    // 5. Check for same Oscar type
    if (movie1.oscars && movie2.oscars && movie1.oscars.length > 0 && movie2.oscars.length > 0) {
      for (const oscar1 of movie1.oscars) {
        for (const oscar2 of movie2.oscars) {
          if (oscar1.type && oscar2.type && oscar1.type.en === oscar2.type.en) {
            connections.push({
              type: 'oscar',
              value: oscar1.type
            });
          }
        }
      }
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
      winner: null
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