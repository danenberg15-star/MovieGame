import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ref, set, onValue, update, off, get } from 'firebase/database';
import { database } from '../firebase';
import { useNavigate, useParams } from 'react-router-dom';
import './GameScreen.css';
import AnchorReveal from '../components/AnchorReveal';
import TrailerPlayer from '../components/TrailerPlayer';
import DecisionPhase from '../components/DecisionPhase';
import botPlayer from '../utils/botPlayer';
import {
  loadMoviesData,
  selectAnchorCards,
  selectNextMovie,
  generateAnswerOptions,
  checkAnswer,
  validateConnection,
  getConnectionHint,
  checkWinCondition,
  initializeGameState,
  getSuccessMessage
} from '../utils/gameLogic';

// Helper function to sanitize Firebase keys
const sanitizeFirebaseKey = (key) => {
  if (!key) return '';
  // Remove invalid characters: . # $ / [ ]
  // eslint-disable-next-line no-useless-escape
  return key.replace(/[.#$\/\[\]]/g, '_');
};

function GameScreen() {
  const navigate = useNavigate();
  const { roomCode } = useParams();
  const searchParams = new URLSearchParams(window.location.search);
  const playerId = searchParams.get('playerId') || `player_${Date.now()}`;

  const [language] = useState('en');
  const [gameState, setGameState] = useState(null);
  const [currentMovie, setCurrentMovie] = useState(null);
  const [answerOptions, setAnswerOptions] = useState([]);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [isCorrect, setIsCorrect] = useState(false);
  const [phase, setPhase] = useState('anchorReveal');
  const [removedAnswers, setRemovedAnswers] = useState([]);
  const [allMovies, setAllMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [botIsThinking, setBotIsThinking] = useState(false);
  const [trailerEnded, setTrailerEnded] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);

  const videoRef = useRef(null);
  const gameStateRef = useRef(null);
  const currentMovieRef = useRef(null);

  // Update refs whenever state changes
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    currentMovieRef.current = currentMovie;
  }, [currentMovie]);

  const isQAMode = roomCode === '99999';
  const currentTeam = gameState?.playerTeams?.[playerId] || 'A';
  const isMyTurn = gameState?.currentTurn === currentTeam;

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

  // Start next round
  const startNextRound = useCallback(async () => {
    if (!gameState || !allMovies.length) return;

    console.log('🎬 Starting next round...');

    try {
      const teamACards = gameState.teamA?.cards || [];
      const teamBCards = gameState.teamB?.cards || [];
      const usedIds = gameState.usedMovieIds || [];

      // Select next movie
      const nextMovie = selectNextMovie(
        allMovies,
        usedIds,
        teamACards,
        teamBCards,
        gameState.currentTurn
      );

      if (!nextMovie) {
        console.log('❌ No more movies available - game over');
        await update(ref(database, `games/${roomCode}`), {
          phase: 'finished',
          winner: 'draw'
        });
        return;
      }

      console.log('✅ Selected movie:', nextMovie.title.en);

      // Generate answer options
      const options = generateAnswerOptions(nextMovie, allMovies, language);

      // Update Firebase
      await update(ref(database, `games/${roomCode}`), {
        currentMovie: {
          id: nextMovie.id,
          options,
          removedAnswers: []
        },
        roundNumber: (gameState.roundNumber || 0) + 1,
        phase: 'playing'
      });

      // Reset local state
      setCurrentMovie(nextMovie);
      setAnswerOptions(options);
      setSelectedAnswer(null);
      setShowResult(false);
      setRemovedAnswers([]);
      setTrailerEnded(false);

      // Play trailer
      if (videoRef.current) {
        videoRef.current.src = nextMovie.trailer;
        videoRef.current.load();
        videoRef.current.play().catch(err => {
          console.error('Video play error:', err);
        });
      }

    } catch (err) {
      console.error('❌ Error starting next round:', err);
    }
  }, [gameState, allMovies, roomCode, language]);

  // Handle connection attempt
  const handleConnectionAttempt = useCallback(async (targetCard, connectionType) => {
    if (!currentMovie) return;

    console.log('🔗 Attempting connection:', { targetCard: targetCard.title.en, connectionType });

    const validation = validateConnection(currentMovie, targetCard, connectionType);

    if (validation.valid) {
      // Successful connection
      const teamKey = currentTeam === 'A' ? 'teamA' : 'teamB';
      const currentCards = gameState[teamKey]?.cards || [];
      const newCards = [...currentCards, currentMovie];
      const newScore = newCards.length;

      // Use one token
      const newTokens = Math.max(0, (gameState[teamKey]?.tokens || 0) - 1);

      // Check win condition
      const hasWon = checkWinCondition(newCards);

      const updates = {
        [`${teamKey}/cards`]: newCards,
        [`${teamKey}/score`]: newScore,
        [`${teamKey}/tokens`]: newTokens,
        usedMovieIds: [...(gameState.usedMovieIds || []), currentMovie.id],
        currentMovie: null,
        currentMovieAttempts: [],
        wonCard: null,
        currentTurn: currentTeam === 'A' ? 'B' : 'A'
      };

      if (hasWon) {
        updates.phase = 'finished';
        updates.winner = currentTeam;
      } else {
        updates.phase = 'playing';
      }

      await update(ref(database, `games/${roomCode}`), updates);

      const successMsg = getSuccessMessage(connectionType, validation.connection, language);
      setConnectionResult({ success: true, message: successMsg });

      if (!hasWon) {
        setTimeout(() => {
          setConnectionResult(null);
          startNextRound();
        }, 2000);
      }

    } else {
      // Failed connection - show hint
      const hintData = getConnectionHint(currentMovie, targetCard, language);
      
      await update(ref(database, `games/${roomCode}`), {
        phase: 'playing',
        wonCard: null,
        currentMovie: null,
        currentMovieAttempts: [],
        currentTurn: currentTeam === 'A' ? 'B' : 'A'
      });

      setConnectionResult({ 
        success: false, 
        message: language === 'he' ? 'לא נכון' : 'Incorrect',
        hint: hintData.message,
        attemptedType: connectionType
      });

      setTimeout(() => {
        setConnectionResult(null);
        startNextRound();
      }, 3000);
    }
  }, [currentMovie, currentTeam, gameState, roomCode, language, startNextRound]);

  // Handle save token
  const handleSaveToken = useCallback(async () => {
    console.log('💾 Saving token...');

    const teamKey = currentTeam === 'A' ? 'teamA' : 'teamB';
    const currentCards = gameState[teamKey]?.cards || [];
    const newCards = [...currentCards, currentMovie];
    const newScore = newCards.length;

    // Check win condition
    const hasWon = checkWinCondition(newCards);

    const updates = {
      [`${teamKey}/cards`]: newCards,
      [`${teamKey}/score`]: newScore,
      usedMovieIds: [...(gameState.usedMovieIds || []), currentMovie.id],
      phase: hasWon ? 'finished' : 'playing',
      wonCard: null,
      currentMovie: null,
      currentMovieAttempts: [],
      currentTurn: currentTeam === 'A' ? 'B' : 'A'
    };

    if (hasWon) {
      updates.winner = currentTeam;
    }

    await update(ref(database, `games/${roomCode}`), updates);

    if (!hasWon) {
      startNextRound();
    }
  }, [roomCode, currentTeam, gameState, currentMovie, startNextRound]);

  // Handle anchor reveal continue
  const handleAnchorContinue = useCallback(async () => {
    console.log('▶️ Continuing from anchor reveal...');
    setPhase('playing');
    
    // Start first round
    startNextRound();
  }, [startNextRound]);

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
              [playerId]: 'A'
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

          // Add player if not exists
          const existingGame = snapshot.val();
          if (!existingGame.players?.[playerId]) {
            const playerUpdate = {
              [`players/${playerId}`]: {
                id: playerId,
                name: `Player ${playerId.slice(-4)}`,
                joinedAt: Date.now()
              }
            };

            // Assign to team with fewer players
            const teamACount = Object.values(existingGame.playerTeams || {}).filter(t => t === 'A').length;
            const teamBCount = Object.values(existingGame.playerTeams || {}).filter(t => t === 'B').length;
            playerUpdate[`playerTeams/${playerId}`] = teamACount <= teamBCount ? 'A' : 'B';

            await update(gameRef, playerUpdate);
            console.log('✅ Player added to game');
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

            // If there's a current movie in state, load it
            if (data.currentMovie && data.currentMovie.id) {
              const movie = movies.find(m => m.id === data.currentMovie.id);
              if (movie) {
                setCurrentMovie(movie);
                setAnswerOptions(data.currentMovie.options || []);
                setRemovedAnswers(data.currentMovie.removedAnswers || []);
              }
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
        off(ref(database, `games/${roomCode}`));
      }
    };
  }, [roomCode, playerId, isQAMode, language, buildMoviesIndex]);

  // Handle answer selection
  const handleAnswerSelect = async (answer) => {
    if (!isMyTurn || selectedAnswer || !currentMovie || !trailerEnded) return;

    console.log('✅ Answer selected:', answer);
    setSelectedAnswer(answer);

    const correct = checkAnswer(answer, currentMovie, language);
    setIsCorrect(correct);

    if (correct) {
      // Correct answer - award token
      const teamKey = currentTeam === 'A' ? 'teamA' : 'teamB';
      const newTokens = (gameState[teamKey]?.tokens || 0) + 1;

      await update(ref(database, `games/${roomCode}`), {
        [`${teamKey}/tokens`]: newTokens,
        phase: 'decision',
        wonCard: {
          movieId: currentMovie.id,
          team: currentTeam
        }
      });

      setResultMessage(language === 'he' ? 'צדקתם! +1 אסימון' : 'Correct! +1 Token');
      setShowResult(true);
      setPhase('decision');

    } else {
      // Wrong answer - remove it and switch turn
      const newRemovedAnswers = [...(gameState.currentMovie?.removedAnswers || []), answer];

      // Check if this is the second team's attempt
      const attempts = gameState.currentMovieAttempts || [];
      const newAttempts = [...attempts, currentTeam];

      if (newAttempts.length >= 2) {
        // Both teams failed - card returns to pool
        setResultMessage(language === 'he' ? 'שתי הקבוצות לא זיהו - הכרטיס יחזור!' : 'Both teams failed - card will return!');
        setShowResult(true);

        setTimeout(async () => {
          await update(ref(database, `games/${roomCode}`), {
            currentMovie: null,
            currentMovieAttempts: [],
            currentTurn: gameState.currentTurn === 'A' ? 'B' : 'A'
          });
          startNextRound();
        }, 2000);

      } else {
        // Switch turn to other team
        const nextTurn = currentTeam === 'A' ? 'B' : 'A';
        
        await update(ref(database, `games/${roomCode}`), {
          [`currentMovie/removedAnswers`]: newRemovedAnswers,
          currentMovieAttempts: newAttempts,
          currentTurn: nextTurn
        });

        setResultMessage(language === 'he' ? 'לא נכון - תור הקבוצה השנייה' : 'Incorrect - other team\'s turn');
        setShowResult(true);
        setRemovedAnswers(newRemovedAnswers);
      }
    }
  };

  // Bot turn handler
  useEffect(() => {
    if (!gameState || !currentMovie || !isQAMode) return;
    if (gameState.currentTurn !== 'B') return;
    if (phase !== 'playing') return;
    if (botIsThinking) return;
    if (!trailerEnded) return;

    console.log('🤖 Bot turn starting...');
    setBotIsThinking(true);

    const options = gameState.currentMovie?.options || answerOptions;
    const correctAnswer = currentMovie.title[language];

    botPlayer.chooseAnswer(correctAnswer, options, async (selectedAnswer, isCorrect) => {
      console.log('🤖 Bot selected:', selectedAnswer, 'Correct?', isCorrect);
      
      setSelectedAnswer(selectedAnswer);
      setIsCorrect(isCorrect);

      if (isCorrect) {
        const newTokens = (gameState.teamB?.tokens || 0) + 1;

        await update(ref(database, `games/${roomCode}`), {
          'teamB/tokens': newTokens,
          phase: 'decision',
          wonCard: {
            movieId: currentMovie.id,
            team: 'B'
          }
        });

        setResultMessage(language === 'he' ? 'הבוט ענה נכון! +1 אסימון' : 'Bot answered correctly! +1 Token');
        setShowResult(true);

      } else {
        const newRemovedAnswers = [...(gameState.currentMovie?.removedAnswers || []), selectedAnswer];
        const attempts = gameState.currentMovieAttempts || [];
        const newAttempts = [...attempts, 'B'];

        if (newAttempts.length >= 2) {
          setResultMessage(language === 'he' ? 'שתי הקבוצות לא זיהו - הכרטיס יחזור!' : 'Both teams failed - card will return!');
          setShowResult(true);

          setTimeout(async () => {
            await update(ref(database, `games/${roomCode}`), {
              currentMovie: null,
              currentMovieAttempts: [],
              currentTurn: 'A'
            });
            setBotIsThinking(false);
            startNextRound();
          }, 2000);

        } else {
          await update(ref(database, `games/${roomCode}`), {
            [`currentMovie/removedAnswers`]: newRemovedAnswers,
            currentMovieAttempts: newAttempts,
            currentTurn: 'A'
          });

          setResultMessage(language === 'he' ? 'הבוט טעה - התור שלך!' : 'Bot was wrong - your turn!');
          setShowResult(true);
          setRemovedAnswers(newRemovedAnswers);
          setBotIsThinking(false);
        }
      }

      setTimeout(() => {
        setShowResult(false);
      }, 2000);
    });

  }, [gameState, currentMovie, isQAMode, phase, botIsThinking, trailerEnded, answerOptions, language, roomCode, startNextRound]);

  // Bot decision phase
  useEffect(() => {
    if (!gameState || !isQAMode) return;
    if (phase !== 'decision') return;
    if (gameState.wonCard?.team !== 'B') return;
    if (botIsThinking) return;

    console.log('🤖 Bot making decision...');
    setBotIsThinking(true);

    const wonMovie = allMovies.find(m => m.id === gameState.wonCard.movieId);
    const botCards = gameState.teamB?.cards || [];

    botPlayer.makeDecision(wonMovie, botCards, async (decision) => {
      console.log('🤖 Bot decision:', decision);

      if (decision.action === 'connect' && decision.targetCard && decision.connectionType) {
        await handleConnectionAttempt(decision.targetCard, decision.connectionType);
      } else {
        await handleSaveToken();
      }

      setBotIsThinking(false);
    });

  }, [gameState, phase, isQAMode, botIsThinking, allMovies, handleConnectionAttempt, handleSaveToken]);

  // Translations
  const t = (key) => {
    const translations = {
      en: {
        team_a: 'Team A',
        team_b: 'Team B',
        cards: 'Cards',
        tokens: 'Tokens',
        your_turn: 'Your Turn',
        waiting: 'Waiting...',
        choose_answer: 'Choose the correct movie:',
        game_over: 'Game Over!',
        winner: 'Winner',
        back_home: 'Back to Home'
      },
      he: {
        team_a: 'קבוצה א\'',
        team_b: 'קבוצה ב\'',
        cards: 'כרטיסים',
        tokens: 'אסימונים',
        your_turn: 'התור שלך',
        waiting: 'ממתין...',
        choose_answer: 'בחרו את הסרט הנכון:',
        game_over: 'המשחק הסתיים!',
        winner: 'מנצח',
        back_home: 'חזרה לדף הבית'
      }
    };
    return translations[language]?.[key] || key;
  };

  if (loading || isInitializing) {
    return (
      <div className="game-screen loading">
        <div className="loading-spinner">🎬</div>
        <p>{language === 'he' ? 'טוען משחק...' : 'Loading game...'}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="game-screen error">
        <h2>{language === 'he' ? 'שגיאה' : 'Error'}</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/')}>
          {language === 'he' ? 'חזרה לדף הבית' : 'Back to Home'}
        </button>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="game-screen loading">
        <p>{language === 'he' ? 'ממתין למשחק...' : 'Waiting for game...'}</p>
      </div>
    );
  }

  // Anchor Reveal Screen
  if (phase === 'anchorReveal' || gameState.roundNumber === 0) {
    return (
      <AnchorReveal
        teamACard={gameState.teamA.cards[0]}
        teamBCard={gameState.teamB.cards[0]}
        onContinue={handleAnchorContinue}
        language={language}
      />
    );
  }

  // Game over screen
  if (phase === 'finished') {
    return (
      <div className="game-screen">
        <div className="game-main-layout">
          <div className="game-content">
            <div className="game-finished">
              <h1>🏆 {t('game_over')}</h1>
              <h2>{t('winner')}: {t(`team_${gameState.winner.toLowerCase()}`)}</h2>
              
              <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '30px' }}>
                <div>
                  <h3>{t('team_a')}</h3>
                  <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {gameState.teamA?.cards?.length || 0} {t('cards')}
                  </p>
                </div>
                <div>
                  <h3>{t('team_b')}</h3>
                  <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {gameState.teamB?.cards?.length || 0} {t('cards')}
                  </p>
                </div>
              </div>

              <button onClick={() => navigate('/')}>
                {t('back_home')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Game Screen with Sidebars
  const teamAData = gameState.teamA || { cards: [], tokens: 0 };
  const teamBData = gameState.teamB || { cards: [], tokens: 0 };

  return (
    <div className={`game-screen ${language === 'he' ? 'rtl' : 'ltr'}`}>
      {/* Main Layout: Left Sidebar | Center Content | Right Sidebar */}
      <div className="game-main-layout">
        
        {/* Left Sidebar - Team A */}
        <div className="team-sidebar left">
          <div className="team-sidebar-label">{t('team_a')}</div>
          
          <div className="team-stat">
            <div className="team-stat-icon">🎬</div>
            <div className="team-stat-value">{teamAData.cards.length}/10</div>
            <div className="team-stat-label">{t('cards')}</div>
          </div>
          
          <div className="team-stat">
            <div className="team-stat-icon">🎫</div>
            <div className="team-stat-value">{teamAData.tokens}</div>
            <div className="team-stat-label">{t('tokens')}</div>
          </div>

          {gameState.currentTurn === 'A' && (
            <div className="turn-indicator">
              {currentTeam === 'A' ? t('your_turn') : t('waiting')}
            </div>
          )}
        </div>

        {/* Center Content Area */}
        <div className="game-content">
          {phase === 'playing' && currentMovie && (
            <div className="answering-phase">
              {/* Trailer */}
              <TrailerPlayer
                movieId={currentMovie.id}
                onTrailerEnd={() => setTrailerEnded(true)}
                autoPlay={true}
              />

              {/* Answer Options */}
              {trailerEnded && (
                <>
                  <h2>{t('choose_answer')}</h2>
                  <div className="answer-options">
                    {answerOptions.filter(opt => !removedAnswers.includes(opt)).map((option, index) => (
                      <button
                        key={index}
                        className={`answer-option ${selectedAnswer === option ? (isCorrect ? 'correct' : 'incorrect') : ''}`}
                        onClick={() => handleAnswerSelect(option)}
                        disabled={!isMyTurn || selectedAnswer || botIsThinking}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Result Message */}
              {showResult && (
                <div style={{
                  marginTop: '20px',
                  padding: '15px',
                  borderRadius: '12px',
                  textAlign: 'center',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  background: isCorrect ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                  border: `2px solid ${isCorrect ? '#4caf50' : '#f44336'}`,
                  color: isCorrect ? '#4caf50' : '#f44336'
                }}>
                  {resultMessage}
                </div>
              )}
            </div>
          )}

          {phase === 'decision' && gameState.wonCard && (
            <DecisionPhase
              wonCard={allMovies.find(m => m.id === gameState.wonCard.movieId)}
              teamCards={(currentTeam === 'A' ? teamAData : teamBData).cards}
              onConnect={handleConnectionAttempt}
              onSaveToken={handleSaveToken}
              language={language}
              connectionResult={connectionResult}
            />
          )}
        </div>

        {/* Right Sidebar - Team B */}
        <div className="team-sidebar right">
          <div className="team-sidebar-label">{t('team_b')}</div>
          
          <div className="team-stat">
            <div className="team-stat-icon">🎬</div>
            <div className="team-stat-value">{teamBData.cards.length}/10</div>
            <div className="team-stat-label">{t('cards')}</div>
          </div>
          
          <div className="team-stat">
            <div className="team-stat-icon">🎫</div>
            <div className="team-stat-value">{teamBData.tokens}</div>
            <div className="team-stat-label">{t('tokens')}</div>
          </div>

          {gameState.currentTurn === 'B' && (
            <div className="turn-indicator">
              {currentTeam === 'B' ? t('your_turn') : t('waiting')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GameScreen;