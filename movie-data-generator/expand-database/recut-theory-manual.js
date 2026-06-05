// Manual recut for Theory of Everything - try different start points or sources
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import {
  STAGING_RAW_DIR,
  PUBLIC_ASSETS_MOVIES,
  FFMPEG_PATH,
  ensureDir,
} from './common.js';

const CLIP_SECONDS = 15;
const movieId = 'movie_828';
const tmdbId = 266856;

// Try different YouTube sources for Theory of Everything
const SOURCES = [
  { youtubeKey: '8RHU0X5CYpU', note: 'Official trailer 2', startAt: 40 },
  { youtubeKey: 'hpHwdcKDRfI', note: 'Official trailer 1', startAt: 45 },
  { youtubeKey: '6NEtaNmTgwE', note: 'International trailer', startAt: 30 },
  { youtubeKey: '74Cl_KOO-sE', note: 'UK trailer', startAt: 35 },
];

function ytDlpDownload(url, outDir, outBase) {
  ensureDir(outDir);
  const tmpl = path.join(outDir, `${outBase}.%(ext)s`);
  const args = [
    '-f', 'bv*[height<=480]+ba/b[height<=480]',
    '--write-info-json',
    '--no-playlist',
    '--no-warnings',
    '--force-overwrites',
    '--ffmpeg-location', FFMPEG_PATH,
    '-o', tmpl,
    url,
  ];
  execFileSync('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
}

function findExistingDownload(rawDir, outBase) {
  ensureDir(rawDir);
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

function backupExisting(finalPath) {
  if (!fs.existsSync(finalPath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = finalPath.replace(/\.mp4$/i, `.bak-${stamp}.mp4`);
  fs.copyFileSync(finalPath, bak);
  return bak;
}

async function trySource(source) {
  const url = `https://www.youtube.com/watch?v=${source.youtubeKey}`;
  const rawDir = path.join(STAGING_RAW_DIR, String(tmdbId));
  const outBase = `tmdb_${tmdbId}_${source.youtubeKey}`;

  console.log(`\n=== Trying: ${source.note} (${source.youtubeKey}) ===`);
  console.log(`  Start at: ${source.startAt}s`);

  let videoPath = findExistingDownload(rawDir, outBase);
  if (!videoPath) {
    console.log(`  Downloading...`);
    ytDlpDownload(url, rawDir, outBase);
    videoPath = findExistingDownload(rawDir, outBase);
  } else {
    console.log(`  Using cached: ${path.basename(videoPath)}`);
  }

  if (!videoPath) {
    console.log(`  ❌ Download failed`);
    return false;
  }

  const finalPath = path.join(PUBLIC_ASSETS_MOVIES, movieId, 'trailer.mp4');
  const testPath = finalPath.replace('.mp4', `-test-${source.youtubeKey}.mp4`);
  
  ffmpegCut(videoPath, source.startAt, testPath);
  const size = fs.statSync(testPath).size;
  console.log(`  ✅ Created test: ${path.basename(testPath)} (${(size / 1024).toFixed(0)} KB)`);
  console.log(`  Review this file and if clean, rename it to trailer.mp4`);
  return true;
}

for (const source of SOURCES) {
  try {
    await trySource(source);
  } catch (e) {
    console.error(`  ❌ Failed: ${e.message}`);
  }
}

console.log('\nDone! Review the test files and pick the cleanest one.');
