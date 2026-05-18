// download-all-trailers.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const TMDB_API_KEY = '0c5eb1c3ddee8977d991539ff01c66d0';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const OUTPUT_DIR = path.join(__dirname, 'downloaded-movies');
const YT_DLP_PATH = path.join(__dirname, 'yt-dlp.exe');
const YT_DLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';

// Target directors
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

// Target actors
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

// Download yt-dlp if not exists
async function downloadYtDlp() {
  if (fs.existsSync(YT_DLP_PATH)) {
    console.log('✅ yt-dlp already exists');
    return;
  }
  
  console.log('📥 Downloading yt-dlp...');
  
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(YT_DLP_PATH);
    
    https.get(YT_DLP_URL, (response) => {
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('✅ yt-dlp downloaded!');
        resolve();
      });
    }).on('error', (error) => {
      fs.unlinkSync(YT_DLP_PATH);
      reject(error);
    });
  });
}

// Create directories
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Sanitize filename
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/'/g, '')
    .substring(0, 150);
}

// Fetch trailer URL
async function fetchTrailerUrl(movieId) {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}/videos`, {
      params: {
        api_key: TMDB_API_KEY,
        language: 'en-US'
      }
    });
    
    if (response.data.results && response.data.results.length > 0) {
      const trailer = response.data.results.find(v => 
        v.type === 'Trailer' && v.site === 'YouTube' && v.official === true
      ) || response.data.results.find(v => 
        v.type === 'Trailer' && v.site === 'YouTube'
      );
      
      if (trailer) {
        return `https://www.youtube.com/watch?v=${trailer.key}`;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// Download trailer
function downloadTrailer(youtubeUrl, outputPath) {
  try {
    const command = `"${YT_DLP_PATH}" -f "best[ext=mp4]" --no-playlist -o "${outputPath}" "${youtubeUrl}"`;
    execSync(command, { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

// Generate heatmap
function generateHeatmap(videoPath, outputPath) {
  try {
    const command = `ffmpeg -i "${videoPath}" -vf "select='not(mod(n,30))',scale=320:240,tile=10x10" -frames:v 1 "${outputPath}" -y`;
    execSync(command, { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

// Fetch movies by director
async function fetchMoviesByDirector(directorId, directorName) {
  console.log(`🎬 ${directorName}...`);
  
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
    
    await sleep(300);
    return response.data.results || [];
  } catch (error) {
    return [];
  }
}

// Fetch movies by actor
async function fetchMoviesByActor(actorId, actorName) {
  console.log(`🎭 ${actorName}...`);
  
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
    
    await sleep(300);
    return response.data.results || [];
  } catch (error) {
    return [];
  }
}

// Fetch Oscar winners
async function fetchOscarWinners() {
  console.log(`🏆 Oscar winners...`);
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
    // ignore
  }
  
  return movies;
}

// Main
async function main() {
  console.log('🚀 Movie Trailer Downloader\n');
  
  // Download yt-dlp
  await downloadYtDlp();
  
  console.log('\n📊 Discovering movies...\n');
  
  const allMovies = new Map();
  
  // Directors
  for (const director of TARGET_DIRECTORS) {
    const movies = await fetchMoviesByDirector(director.id, director.name);
    movies.forEach(m => {
      if (!allMovies.has(m.id)) {
        allMovies.set(m.id, { ...m, via: [director.name] });
      } else {
        allMovies.get(m.id).via.push(director.name);
      }
    });
  }
  
  // Actors
  for (const actor of TARGET_ACTORS) {
    const movies = await fetchMoviesByActor(actor.id, actor.name);
    movies.forEach(m => {
      if (!allMovies.has(m.id)) {
        allMovies.set(m.id, { ...m, via: [actor.name] });
      } else {
        allMovies.get(m.id).via.push(actor.name);
      }
    });
  }
  
  // Oscars
  const oscarMovies = await fetchOscarWinners();
  oscarMovies.forEach(m => {
    if (!allMovies.has(m.id)) {
      allMovies.set(m.id, { ...m, via: ['Oscar'] });
    } else {
      allMovies.get(m.id).via.push('Oscar');
    }
  });
  
  const moviesArray = Array.from(allMovies.values())
    .sort((a, b) => b.popularity - a.popularity);
  
  console.log(`\n✅ Found ${moviesArray.length} movies`);
  console.log('\n📥 Downloading trailers...\n');
  
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < moviesArray.length; i++) {
    const movie = moviesArray[i];
    const year = movie.release_date ? movie.release_date.split('-')[0] : 'Unknown';
    
    console.log(`[${i + 1}/${moviesArray.length}] ${movie.title} (${year})`);
    
    const trailerUrl = await fetchTrailerUrl(movie.id);
    
    if (!trailerUrl) {
      console.log('   ⚠️  No trailer\n');
      failed++;
      continue;
    }
    
    const filename = sanitizeFilename(movie.title);
    const videoPath = path.join(OUTPUT_DIR, `${filename}_${year}.mp4`);
    const heatmapPath = path.join(OUTPUT_DIR, `${filename}_${year}_heatmap.jpg`);
    
    console.log('   📥 Downloading...');
    
    if (downloadTrailer(trailerUrl, videoPath)) {
      console.log('   ✅ Downloaded');
      
      if (fs.existsSync('ffmpeg.exe') || fs.existsSync('C:\\ffmpeg\\bin\\ffmpeg.exe')) {
        console.log('   🎨 Creating heatmap...');
        generateHeatmap(videoPath, heatmapPath);
      }
      
      success++;
    } else {
      console.log('   ❌ Failed');
      failed++;
    }
    
    console.log('');
    await sleep(1000);
  }
  
  console.log('\n✅ COMPLETE!');
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  console.log(`Saved to: ${OUTPUT_DIR}`);
}

main().catch(console.error);