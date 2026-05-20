import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ref, set, onValue, update, off, get } from 'firebase/database';
import { database } from '../firebase';
import { useNavigate, useParams } from 'react-router-dom';
import './GameScreen.css';
import AnchorReveal from '../components/AnchorReveal';
import TrailerPlayer from '../components/TrailerPlayer';
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

  const [language, setLanguage] = useState('en');
  const [gameState, setGameState] = useState(null);
  const [currentMovie, setCurrentMovie] = useState(null);
  const [answerOptions, setAnswerOptions] = useState([]);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [isCorrect, setIsCorrect] = useState(false);
  const [phase, setPhase] = useState('anchorReveal'); // Start with anchor reveal
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [selectedTargetCard, setSelectedTargetCard] = useState(null);
  const [selectedConnectionType, setSelectedConnectionType] = useState(null);
  const [connectionResult, setConnectionResult] = useState(null);
  const [removedAnswers, setRemovedAnswers] = useState([]);
  const [allMovies, setAllMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [botIsThinking, setBotIsThinking] = useState(false);
  const [trailerEnded, setTrailerEnded] = useState(false);

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
          setShowConnectionModal(false);
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
        hint: hintData.message
      });

      setTimeout(() => {
        setShowConnectionModal(false);
        setConnectionResult(null);
        startNextRound();
      }, 3000);
    }
  }, [currentMovie, currentTeam, gameState, roomCode, language, startNextRound]);

  // Handle save token
  const handleSaveToken = useCallback(async () => {
    console.log('💾 Saving token...');

    await update(ref(database, `games/${roomCode}`), {
      phase: 'playing',
      wonCard: null,
      currentMovie: null,
      currentMovieAttempts: [],
      currentTurn: currentTeam === 'A' ? 'B' : 'A'
    });

    setShowConnectionModal(false);
    startNextRound();
  }, [roomCode, currentTeam, startNextRound]);

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
        connect: 'Connect',
        save_token: 'Save Token',
        select_target: 'Select target card:',
        select_connection: 'Select connection type:',
        actor: 'Same Actor',
        director: 'Same Director',
        producer: 'Same Producer',
        year: 'Same Year',
        oscar: 'Same Oscar',
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
        connect: 'שייך',
        save_token: 'שמור אסימון',
        select_target: 'בחרו כרטיס יעד:',
        select_connection: 'בחרו סוג קשר:',
        actor: 'שחקן זהה',
        director: 'במאי זהה',
        producer: 'מפיק זהה',
        year: 'שנה זהה',
        oscar: 'אוסקר זהה',
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
      <div className="game-screen game-over">
        <div className="game-over-content">
          <h1>🏆 {t('game_over')}</h1>
          <h2>{t('winner')}: {t(`team_${gameState.winner.toLowerCase()}`)}</h2>
          
          <div className="final-scores">
            <div className="team-final-score">
              <h3>{t('team_a')}</h3>
              <p>{gameState.teamA?.cards?.length || 0} {t('cards')}</p>
            </div>
            <div className="team-final-score">
              <h3>{t('team_b')}</h3>
              <p>{gameState.teamB?.cards?.length || 0} {t('cards')}</p>
            </div>
          </div>

          <button className="home-button" onClick={() => navigate('/')}>
            {t('back_home')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`game-screen ${language === 'he' ? 'rtl' : 'ltr'}`}>
      {/* Language Toggle */}
      <div className="language-toggle">
        <button onClick={() => setLanguage(language === 'en' ? 'he' : 'en')}>
          🌐 {language.toUpperCase()}
        </button>
      </div>

      {/* Score Panel */}
      <div className="score-panel">
        <div className={`team-score ${currentTeam === 'A' ? 'active' : ''}`}>
          <h3>{t('team_a')}</h3>
          <p>🎬 {t('cards')}: {gameState.teamA?.cards?.length || 0}/10</p>
          <p>🎫 {t('tokens')}: {gameState.teamA?.tokens || 0}</p>
        </div>
        
        <div className={`team-score ${currentTeam === 'B' ? 'active' : ''}`}>
          <h3>{t('team_b')}</h3>
          <p>🎬 {t('cards')}: {gameState.teamB?.cards?.length || 0}/10</p>
          <p>🎫 {t('tokens')}: {gameState.teamB?.tokens || 0}</p>
        </div>
      </div>

      {/* Turn Indicator */}
      <div className="turn-indicator">
        {isMyTurn ? (
          <span className="your-turn">⭐ {t('your_turn')}</span>
        ) : (
          <span className="waiting">{t('waiting')}</span>
        )}
      </div>

      {/* Playing Phase */}
      {phase === 'playing' && currentMovie && (
        <div className="playing-phase">
          {/* Trailer */}
          <div className="trailer-container">
            <TrailerPlayer
              movieId={currentMovie.id}
              onTrailerEnd={() => setTrailerEnded(true)}
              autoPlay={true}
            />
          </div>

          {/* Answer Options */}
          {trailerEnded && (
            <div className="answer-section">
              <h3>{t('choose_answer')}</h3>
              <div className="answer-grid">
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
            </div>
          )}

          {/* Result Message */}
          {showResult && (
            <div className={`result-message ${isCorrect ? 'correct' : 'incorrect'}`}>
              {resultMessage}
            </div>
          )}
        </div>
      )}

      {/* Decision Phase */}
      {phase === 'decision' && gameState.wonCard?.team === currentTeam && isMyTurn && (
        <div className="decision-phase">
          <h3>{language === 'he' ? 'זכיתם בכרטיס! מה תרצו לעשות?' : 'You won a card! What would you like to do?'}</h3>
          
          <div className="decision-buttons">
            <button 
              className="connect-button"
              onClick={() => setShowConnectionModal(true)}
              disabled={(gameState[currentTeam === 'A' ? 'teamA' : 'teamB']?.tokens || 0) === 0}
            >
              {t('connect')} (1 {t('tokens')})
            </button>
            
            <button 
              className="save-button"
              onClick={handleSaveToken}
            >
              {t('save_token')}
            </button>
          </div>
        </div>
      )}

      {/* Connection Modal */}
      {showConnectionModal && (
        <div className="modal-overlay">
          <div className="connection-modal">
            <h3>{t('select_target')}</h3>
            
            <div className="target-cards">
              {(gameState[currentTeam === 'A' ? 'teamA' : 'teamB']?.cards || []).map((card, index) => (
                <div
                  key={index}
                  className={`target-card ${selectedTargetCard?.id === card.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTargetCard(card)}
                >
                  <img src={card.poster} alt={card.title[language]} />
                  <p>{card.title[language]}</p>
                </div>
              ))}
            </div>

            {selectedTargetCard && (
              <>
                <h3>{t('select_connection')}</h3>
                <div className="connection-types">
                  {['actor', 'director', 'producer', 'year', 'oscar'].map(type => (
                    <button
                      key={type}
                      className={`connection-type ${selectedConnectionType === type ? 'selected' : ''}`}
                      onClick={() => setSelectedConnectionType(type)}
                    >
                      {t(type)}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="modal-actions">
              <button
                className="confirm-button"
                onClick={() => handleConnectionAttempt(selectedTargetCard, selectedConnectionType)}
                disabled={!selectedTargetCard || !selectedConnectionType}
              >
                {t('connect')}
              </button>
              <button
                className="cancel-button"
                onClick={() => {
                  setShowConnectionModal(false);
                  setSelectedTargetCard(null);
                  setSelectedConnectionType(null);
                }}
              >
                {language === 'he' ? 'ביטול' : 'Cancel'}
              </button>
            </div>

            {connectionResult && (
              <div className={`connection-result ${connectionResult.success ? 'success' : 'failure'}`}>
                <p>{connectionResult.message}</p>
                {connectionResult.hint && <p className="hint">💡 {connectionResult.hint}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default GameScreen;