// Test multiple start points from the UK trailer (seemed smallest = likely cleanest)
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import {
  STAGING_RAW_DIR,
  PUBLIC_ASSETS_MOVIES,
  FFMPEG_PATH,
} from './common.js';

const CLIP_SECONDS = 15;
const movieId = 'movie_828';
const tmdbId = 266856;
const youtubeKey = '74Cl_KOO-sE'; // UK trailer

// Try different start points
const START_POINTS = [50, 55, 60, 65, 70, 75];

function findVideo() {
  const rawDir = path.join(STAGING_RAW_DIR, String(tmdbId));
  const outBase = `tmdb_${tmdbId}_${youtubeKey}`;
  const files = fs.readdirSync(rawDir);
  const video = files.find(f => f.startsWith(`${outBase}.`) && /\.(mp4|webm|mkv)$/i.test(f));
  return video ? path.join(rawDir, video) : null;
}

function ffmpegCut(srcPath, startSec, outPath) {
  const start = new Date(startSec * 1000).toISOString().substr(11, 8);
  const len = new Date(CLIP_SECONDS * 1000).toISOString().substr(11, 8);
  execFileSync(FFMPEG_PATH, [
    '-y', '-ss', start, '-t', len, '-i', srcPath,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    outPath,
  ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 });
}

function extractFrame(videoPath, outPath) {
  execFileSync(FFMPEG_PATH, [
    '-y', '-ss', '00:00:07', '-i', videoPath,
    '-frames:v', '1', '-q:v', '2', outPath,
  ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 30000 });
}

const videoPath = findVideo();
if (!videoPath) {
  console.error('Source video not found');
  process.exit(1);
}

console.log(`Testing different start points from ${youtubeKey}...`);
const testDir = path.join(PUBLIC_ASSETS_MOVIES, movieId);

for (const start of START_POINTS) {
  const testVideo = path.join(testDir, `trailer-test-start${start}.mp4`);
  const testFrame = path.join(testDir, `trailer-test-start${start}-frame.jpg`);
  
  console.log(`  Creating clip starting at ${start}s...`);
  ffmpegCut(videoPath, start, testVideo);
  extractFrame(testVideo, testFrame);
  
  const size = fs.statSync(testVideo).size;
  console.log(`  ✅ ${path.basename(testVideo)} (${(size / 1024).toFixed(0)} KB)`);
}

console.log('\nDone! Review the frames to pick the cleanest segment.');
