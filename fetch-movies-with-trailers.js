// fetch-movies-with-trailers.js
const axios = require('axios');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TMDB_API_KEY = '0c5eb1c3ddee8977d991539ff01c66d0';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const OUTPUT_DIR = path.join(__dirname, 'downloaded-movies');

// Target directors with their TMDB IDs
const TARGET_DIRECTORS = [
  { name: 'Steven Spielberg', id: 488 },
  { name: 'Christopher Nolan', id: 525 },
  { name: 'Robert Altman', id: 5247 },
  { name: 'Rob Reiner', id: 5294 },
  { name: 'Robert Zemeckis', id: 24 },
  { name: 'Martin Scorsese', id: 1032 },
  { name: 'Woody Allen', id: 1243 },
  { name: 'Ron Howard', id: 1275 },
  { name: 'James Cameron', id: 2710 },
  { name: 'Clint Eastwood', id: 13848 },
  { name: 'Guy Ritchie', id: 11080 },
  { name: 'Francis Ford Coppola', id: 1776 }
];

// Target actors with their TMDB IDs
const TARGET_ACTORS = [
  { name: 'Leonardo DiCaprio', id: 6193 },
  { name: 'Robert De Niro', id: 380 },
  { name: 'Al Pacino', id: 1158 },
  { name: 'Mel Gibson', id: 2461 },
  { name: 'Matt Damon', id: 1892 },
  { name: 'Ben Affleck', id: 880 },
  { name: 'Matthew McConaughey', id: 10297 },
  { name: 'George Clooney', id: 1461 },
  { name: 'Brad Pitt', id: 287 },
  { name: 'Tom Hanks', id: 31 },
  { name: 'Tom Hardy', id: 2524 },
  { name: 'Edward Norton', id: 819 },
  { name: 'Bruce Willis', id: 62 },
  { name: 'Richard Gere', id: 1205 },
  { name: 'Ben Stiller', id: 7399 },
  { name: 'Julia Roberts', id: 1204 },
  { name: 'Helen Mirren', id: 15735 },
  { name: 'Jodie Foster', id: 1038 },
  { name: 'Cameron Diaz', id: 6941 },
  { name: 'Sylvester Stallone', id: 16483 },
  { name: 'Arnold Schwarzenegger', id: 1100 },
  { name: 'Jason Statham', id: 976 },
  { name: 'Denzel Washington', id: 5292 },
  { name: 'Keanu Reeves', id: 6384 },
  { name: 'Gwyneth Paltrow', id: 1231 },
  { name: 'Eddie Murphy', id: 776 },
  { name: 'Chris Tucker', id: 8178 },
  { name: 'John Travolta', id: 8891 },
  { name: 'Nicole Kidman', id: 2227 },
  { name: 'Meryl Streep', id: 5064 },
  { name: 'Jennifer Lawrence', id: 72129 },
  { name: 'Michelle Pfeiffer', id: 1160 }
];

const MIN_YEAR = 1985;

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Sanitize filename
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 200);
}

// Fetch trailer from TMDB
async function fetchTrailerUrl(movieId, movieTitle) {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}/videos`, {
      params: {
        api_key: TMDB_API_KEY,
        language: 'en-US'
      }
    });
    
    if (response.data.results && response.data.results.length > 0) {
      // Find official trailer
      const trailer = response.data.results.find(v => 
        v.type === 'Trailer' && 
        v.site === 'YouTube' && 
        v.official === true
      ) || response.data.results.find(v => 
        v.type === 'Trailer' && 
        v.site === 'YouTube'
      );
      
      if (trailer) {
        return `https://www.youtube.com/watch?v=${trailer.key}`;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`   ⚠️  Error fetching trailer for ${movieTitle}:`, error.message);
    return null;
  }
}

// Download trailer
async function downloadTrailer(youtubeUrl, outputPath) {
  try {
    console.log(`   📥 Downloading trailer...`);
    
    const info = await ytdl.getInfo(youtubeUrl);
    const format = ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'videoandaudio' });
    
    return new Promise((resolve, reject) => {
      const stream = ytdl(youtubeUrl, { format });
      const writeStream = fs.createWriteStream(outputPath);
      
      stream.pipe(writeStream);
      
      writeStream.on('finish', () => {
        console.log(`   ✅ Downloaded!`);
        resolve(outputPath);
      });
      
      writeStream.on('error', (error) => {
        console.error(`   ❌ Download failed:`, error.message);
        reject(error);
      });
    });
  } catch (error) {
    console.error(`   ❌ Download error:`, error.message);
    throw error;
  }
}

// Generate heatmap using ffmpeg
function generateHeatmap(videoPath, outputPath) {
  try {
    console.log(`   🎨 Generating heatmap...`);
    
    const command = `ffmpeg -i "${videoPath}" -vf "select='not(mod(n,30))',scale=320:240,tile=10x10" -frames:v 1 "${outputPath}" -y`;
    
    execSync(command, { stdio: 'pipe' });
    
    console.log(`   ✅ Heatmap created!`);
    return true;
  } catch (error) {
    console.error(`   ❌ Heatmap generation failed:`, error.message);
    return false;
  }
}

// Fetch movies by director
async function fetchMoviesByDirector(directorId, directorName) {
  console.log(`🎬 Fetching movies by ${directorName}...`);
  const movies = [];
  
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/discover/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        with_crew: directorId,
        sort_by: 'popularity.desc',
        'primary_release_date.gte': `${MIN_YEAR}-01-01`,
        language: 'en-US'
      }
    });
    
    if (response.data.results) {
      movies.push(...response.data.results);
    }
    
    await sleep(300);
    
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
  }
  
  console.log(`   ✅ Found ${movies.length} movies`);
  return movies;
}

// Fetch movies by actor
async function fetchMoviesByActor(actorId, actorName) {
  console.log(`🎭 Fetching movies with ${actorName}...`);
  const movies = [];
  
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/discover/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        with_cast: actorId,
        sort_by: 'popularity.desc',
        'primary_release_date.gte': `${MIN_YEAR}-01-01`,
        language: 'en-US'
      }
    });
    
    if (response.data.results) {
      movies.push(...response.data.results);
    }
    
    await sleep(300);
    
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
  }
  
  console.log(`   ✅ Found ${movies.length} movies`);
  return movies;
}

// Fetch Oscar winners
async function fetchOscarWinners() {
  console.log(`🏆 Fetching Oscar winners...`);
  const movies = [];
  
  try {
    for (let year = MIN_YEAR; year <= 2025; year++) {
      const response = await axios.get(`${TMDB_BASE_URL}/discover/movie`, {
        params: {
          api_key: TMDB_API_KEY,
          primary_release_year: year,
          sort_by: 'vote_average.desc',
          'vote_count.gte': 1000,
          language: 'en-US'
        }
      });
      
      if (response.data.results) {
        movies.push(...response.data.results.slice(0, 3));
      }
      
      await sleep(300);
    }
    
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
  }
  
  console.log(`   ✅ Found ${movies.length} movies`);
  return movies;
}

// Main function
async function fetchAllMovies() {
  console.log('🚀 Starting movie discovery and download...\n');
  
  const allMovies = new Map();
  
  // Fetch by directors
  console.log('\n📽️  FETCHING BY DIRECTORS\n');
  for (const director of TARGET_DIRECTORS) {
    const movies = await fetchMoviesByDirector(director.id, director.name);
    movies.forEach(movie => {
      if (!allMovies.has(movie.id)) {
        allMovies.set(movie.id, {
          ...movie,
          discovered_via: [`Director: ${director.name}`]
        });
      } else {
        allMovies.get(movie.id).discovered_via.push(`Director: ${director.name}`);
      }
    });
  }
  
  // Fetch by actors
  console.log('\n🎭 FETCHING BY ACTORS\n');
  for (const actor of TARGET_ACTORS) {
    const movies = await fetchMoviesByActor(actor.id, actor.name);
    movies.forEach(movie => {
      if (!allMovies.has(movie.id)) {
        allMovies.set(movie.id, {
          ...movie,
          discovered_via: [`Actor: ${actor.name}`]
        });
      } else {
        allMovies.get(movie.id).discovered_via.push(`Actor: ${actor.name}`);
      }
    });
  }
  
  // Fetch Oscar winners
  console.log('\n🏆 FETCHING OSCAR WINNERS\n');
  const oscarMovies = await fetchOscarWinners();
  oscarMovies.forEach(movie => {
    if (!allMovies.has(movie.id)) {
      allMovies.set(movie.id, {
        ...movie,
        discovered_via: ['Oscar Winner/Nominee']
      });
    } else {
      allMovies.get(movie.id).discovered_via.push('Oscar Winner/Nominee');
    }
  });
  
  const moviesArray = Array.from(allMovies.values())
    .sort((a, b) => b.popularity - a.popularity);
  
  console.log(`\n📊 Total movies discovered: ${moviesArray.length}`);
  console.log('\n📥 DOWNLOADING TRAILERS...\n');
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < moviesArray.length; i++) {
    const movie = moviesArray[i];
    const year = movie.release_date ? movie.release_date.split('-')[0] : 'Unknown';
    
    console.log(`\n[${i + 1}/${moviesArray.length}] ${movie.title} (${year})`);
    console.log(`   Via: ${movie.discovered_via.join(', ')}`);
    
    // Get trailer URL
    const trailerUrl = await fetchTrailerUrl(movie.id, movie.title);
    
    if (!trailerUrl) {
      console.log(`   ⚠️  No trailer found`);
      failCount++;
      continue;
    }
    
    console.log(`   🎬 Trailer: ${trailerUrl}`);
    
    // Create filename
    const sanitizedTitle = sanitizeFilename(movie.title);
    const filename = `${sanitizedTitle}_${year}`;
    const videoPath = path.join(OUTPUT_DIR, `${filename}.mp4`);
    const heatmapPath = path.join(OUTPUT_DIR, `${filename}_heatmap.jpg`);
    
    // Download trailer
    try {
      await downloadTrailer(trailerUrl, videoPath);
      
      // Generate heatmap
      generateHeatmap(videoPath, heatmapPath);
      
      successCount++;
      
    } catch (error) {
      console.error(`   ❌ Failed to download trailer`);
      failCount++;
    }
    
    // Rate limiting
    await sleep(2000);
  }
  
  console.log('\n✅ COMPLETE!');
  console.log(`📊 Total movies: ${moviesArray.length}`);
  console.log(`✅ Successfully downloaded: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📁 Files saved to: ${OUTPUT_DIR}`);
}

// Run
fetchAllMovies().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});