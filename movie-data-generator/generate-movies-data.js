import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TRAILERS_PATH = process.env.TRAILERS_PATH;
const OUTPUT_PATH = process.env.OUTPUT_PATH;

// TMDB API endpoints
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// Sleep function for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Clean movie title from filename
function cleanMovieTitle(filename) {
  return filename
    .replace('.mp4', '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Search for movie on TMDB
async function searchMovie(movieTitle) {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        query: movieTitle,
        language: 'en-US'
      }
    });

    if (response.data.results && response.data.results.length > 0) {
      return response.data.results[0]; // Return first result
    }
    return null;
  } catch (error) {
    console.error(`Error searching for "${movieTitle}":`, error.message);
    return null;
  }
}

// Get movie details including credits
async function getMovieDetails(movieId) {
  try {
    const [detailsResponse, creditsResponse, hebrewResponse] = await Promise.all([
      axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
        params: {
          api_key: TMDB_API_KEY,
          language: 'en-US'
        }
      }),
      axios.get(`${TMDB_BASE_URL}/movie/${movieId}/credits`, {
        params: {
          api_key: TMDB_API_KEY
        }
      }),
      axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
        params: {
          api_key: TMDB_API_KEY,
          language: 'he-IL'
        }
      })
    ]);

    return {
      details: detailsResponse.data,
      credits: creditsResponse.data,
      hebrew: hebrewResponse.data
    };
  } catch (error) {
    console.error(`Error getting details for movie ID ${movieId}:`, error.message);
    return null;
  }
}

// Get similar movies for decoy answers
async function getSimilarMovies(movieId) {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}/similar`, {
      params: {
        api_key: TMDB_API_KEY,
        language: 'en-US'
      }
    });

    return response.data.results.slice(0, 9); // Get 9 similar movies
  } catch (error) {
    console.error(`Error getting similar movies for ID ${movieId}:`, error.message);
    return [];
  }
}

// Get Hebrew translations for similar movies
async function getHebrewTitles(movieIds) {
  const hebrewTitles = [];
  
  for (const id of movieIds) {
    try {
      const response = await axios.get(`${TMDB_BASE_URL}/movie/${id}`, {
        params: {
          api_key: TMDB_API_KEY,
          language: 'he-IL'
        }
      });
      hebrewTitles.push(response.data.title);
      await sleep(100); // Rate limiting
    } catch (error) {
      hebrewTitles.push(''); // Empty if failed
    }
  }
  
  return hebrewTitles;
}

// Generate movie JSON data
async function generateMovieData(filename, index) {
  const movieTitle = cleanMovieTitle(filename);
  console.log(`\n[${index}] Processing: ${movieTitle}`);

  // Search for movie
  const searchResult = await searchMovie(movieTitle);
  if (!searchResult) {
    console.log(`❌ Not found on TMDB: ${movieTitle}`);
    return null;
  }

  console.log(`✓ Found: ${searchResult.title} (${searchResult.release_date?.substring(0, 4)})`);

  // Get detailed info
  await sleep(250); // Rate limiting
  const movieData = await getMovieDetails(searchResult.id);
  if (!movieData) {
    console.log(`❌ Failed to get details for: ${movieTitle}`);
    return null;
  }

  // Get similar movies for decoy answers
  await sleep(250);
  const similarMovies = await getSimilarMovies(searchResult.id);
  
  // Get Hebrew titles for similar movies
  await sleep(250);
  const similarMovieIds = similarMovies.map(m => m.id);
  const hebrewDecoyTitles = await getHebrewTitles(similarMovieIds);

  const { details, credits, hebrew } = movieData;

  // Get top 10 cast members
  const cast = credits.cast.slice(0, 10).map(actor => ({
    name: {
      en: actor.name,
      he: actor.name // TMDB doesn't provide Hebrew actor names, keeping English
    },
    image: actor.profile_path ? `${TMDB_IMAGE_BASE}${actor.profile_path}` : null
  }));

  // Get director
  const director = credits.crew.find(member => member.job === 'Director');
  const directorData = director ? {
    name: {
      en: director.name,
      he: director.name
    },
    image: director.profile_path ? `${TMDB_IMAGE_BASE}${director.profile_path}` : null
  } : null;

  // Get producer
  const producer = credits.crew.find(member => member.job === 'Producer');
  const producerData = producer ? {
    name: {
      en: producer.name,
      he: producer.name
    },
    image: producer.profile_path ? `${TMDB_IMAGE_BASE}${producer.profile_path}` : null
  } : null;

  // Get Oscar wins (if available in details)
  const oscars = details.awards || [];

  // Build decoy answers
  const decoyAnswersEn = similarMovies.map(m => m.title);
  const decoyAnswersHe = hebrewDecoyTitles.filter(title => title); // Remove empty

  const movieJson = {
    id: `movie_${String(index).padStart(3, '0')}`,
    title: {
      en: details.title,
      he: hebrew.title || details.title // Use Hebrew title if available
    },
    year: details.release_date ? parseInt(details.release_date.substring(0, 4)) : null,
    director: directorData,
    producer: producerData,
    cast: cast,
    oscars: oscars,
    trailer: `/assets/movies/movie_${String(index).padStart(3, '0')}/trailer.mp4`,
    poster: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : null,
    decoy_answers: {
      en: decoyAnswersEn,
      he: decoyAnswersHe
    },
    original_filename: filename
  };

  console.log(`✓ Generated JSON for: ${movieJson.title.en} (${movieJson.title.he})`);
  return movieJson;
}

// Main function
async function main() {
  console.log('🎬 Movie Data Generator');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📂 Trailers folder: ${TRAILERS_PATH}`);
  console.log(`📂 Output folder: ${OUTPUT_PATH}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Ensure output directory exists
  await fs.ensureDir(OUTPUT_PATH);

  // Read all trailer files
  const files = await fs.readdir(TRAILERS_PATH);
  const mp4Files = files.filter(file => file.endsWith('.mp4'));

  console.log(`Found ${mp4Files.length} trailer files\n`);

  const allMoviesData = [];
  let successCount = 0;
  let failCount = 0;

  // Process each file
  for (let i = 0; i < mp4Files.length; i++) {
    const file = mp4Files[i];
    const movieData = await generateMovieData(file, i + 1);

    if (movieData) {
      allMoviesData.push(movieData);
      
      // Create movie folder
      const movieFolder = path.join(OUTPUT_PATH, movieData.id);
      await fs.ensureDir(movieFolder);

      // Save individual JSON
      const jsonPath = path.join(movieFolder, 'data.json');
      await fs.writeJson(jsonPath, movieData, { spaces: 2 });

      // Copy trailer to movie folder
      const sourcePath = path.join(TRAILERS_PATH, file);
      const destPath = path.join(movieFolder, 'trailer.mp4');
      await fs.copy(sourcePath, destPath);

      successCount++;
      console.log(`✓ Saved to: ${movieFolder}`);
    } else {
      failCount++;
    }

    // Rate limiting between movies
    await sleep(500);
  }

  // Save master index file
  const indexPath = path.join(OUTPUT_PATH, 'movies-index.json');
  await fs.writeJson(indexPath, {
    total: allMoviesData.length,
    movies: allMoviesData.map(m => ({
      id: m.id,
      title: m.title,
      year: m.year,
      original_filename: m.original_filename
    }))
  }, { spaces: 2 });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary:');
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📁 Saved to: ${OUTPUT_PATH}`);
  console.log(`📄 Index file: ${indexPath}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run
main().catch(console.error);