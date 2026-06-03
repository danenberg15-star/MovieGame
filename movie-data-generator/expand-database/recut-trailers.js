// Targeted re-download + re-cut for specific EXISTING movies.
//
// Unlike the bulk pipeline (2-fetch-and-cut.js), this operates directly on
// public/assets/movies/<id>/trailer.mp4 for a hand-picked list of movies.
//
// Run:  node recut-trailers.js                 (reuses cached raw downloads → instant)
//       node recut-trailers.js --force-download (always re-download from YouTube)
//
// For each job you can specify:
//   - youtubeKey : force a specific YouTube video (otherwise smart pick by TMDB).
//   - startOffset: seconds to ADD to the smart-cut start (e.g. skip a title card).
//   - duration   : clip length in seconds (default 15).
//
// Raw downloads are cached under staging/raw_youtube/<tmdbId>/, so re-cutting an
// already-downloaded trailer skips YouTube entirely and is essentially instant.
// The original trailer.mp4 is backed up to trailer.bak-<timestamp>.mp4 first.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import {
  STAGING_RAW_DIR,
  PUBLIC_ASSETS_MOVIES,
  FFMPEG_PATH,
  ensureDir,
} from './common.js';

// ---- Jobs to run --------------------------------------------------------
const JOBS = [
  {
    movieId: 'movie_821', // Kill Bill: Vol. 2 (2004) — avoid on-screen title text
    tmdbId: 393,
    youtubeKey: 'WTt8cCIvGYI', // official trailer (Classic Trailers)
    startAt: 60,
  },
  {
    movieId: 'movie_927', // Star Wars: Episode III - Revenge of the Sith (2005)
    tmdbId: 1895,
    youtubeKey: '5UnjrG_N8hU', // official Star Wars channel trailer
    startAt: 75,
  },
];

const CLIP_SECONDS = 15;
const FORCE_DOWNLOAD = process.argv.includes('--force-download');

// ---- Helpers (mirrors 2-fetch-and-cut.js) -------------------------------
function ytDlpDownload(url, outDir, outBase) {
  ensureDir(outDir);
  const tmpl = path.join(outDir, `${outBase}.%(ext)s`);
  const args = [
    '-f',
    'bv*[height<=480]+ba/b[height<=480]',
    '--write-info-json',
    '--no-playlist',
    '--no-warnings',
    '--force-overwrites',
    '--ffmpeg-location',
    FFMPEG_PATH,
    '-o',
    tmpl,
    url,
  ];
  execFileSync('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
}

function findExistingDownload(rawDir, outBase) {
  ensureDir(rawDir);
  const files = fs.readdirSync(rawDir);
  const video = files.find(
    (f) => f.startsWith(`${outBase}.`) && /\.(mp4|webm|mkv)$/i.test(f)
  );
  const info = files.find((f) => f === `${outBase}.info.json`);
  return {
    videoPath: video ? path.join(rawDir, video) : null,
    infoPath: info ? path.join(rawDir, info) : null,
  };
}

function calcSmartStart(infoJsonPath) {
  try {
    const info = JSON.parse(fs.readFileSync(infoJsonPath, 'utf8'));
    const duration = info.duration || 120;
    if (!Array.isArray(info.heatmap) || !info.heatmap.length) {
      return Math.min(10, Math.max(0, duration - CLIP_SECONDS));
    }
    const peak = info.heatmap.reduce(
      (best, p) => (p.value > best.value ? p : best),
      info.heatmap[0]
    );
    const peakTime = peak.start_time || 0;
    let start = peakTime <= 20 ? 10 : peakTime - 7;
    if (start + CLIP_SECONDS > duration) start = duration - CLIP_SECONDS;
    return Math.max(0, start);
  } catch {
    return 10;
  }
}

function videoDuration(infoJsonPath) {
  try {
    const info = JSON.parse(fs.readFileSync(infoJsonPath, 'utf8'));
    return info.duration || null;
  } catch {
    return null;
  }
}

function ffmpegCut(srcPath, startSec, outPath, clipSeconds) {
  ensureDir(path.dirname(outPath));
  const start = new Date(startSec * 1000).toISOString().substr(11, 8);
  const len = new Date(clipSeconds * 1000).toISOString().substr(11, 8);
  execFileSync(
    FFMPEG_PATH,
    [
      '-y',
      '-ss', start,
      '-t', len,
      '-i', srcPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outPath,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 }
  );
}

function backupExisting(finalPath) {
  if (!fs.existsSync(finalPath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = finalPath.replace(/\.mp4$/i, `.bak-${stamp}.mp4`);
  fs.copyFileSync(finalPath, bak);
  return bak;
}

async function runJob(job) {
  const url = `https://www.youtube.com/watch?v=${job.youtubeKey}`;
  const rawDir = path.join(STAGING_RAW_DIR, String(job.tmdbId));
  const outBase = `tmdb_${job.tmdbId}_${job.youtubeKey}`;

  console.log(`\n=== ${job.movieId} (tmdb ${job.tmdbId}) ===`);
  console.log(`  source: ${url}`);

  // Reuse the cached raw download when available → instant re-cut.
  let { videoPath, infoPath } = findExistingDownload(rawDir, outBase);
  if (FORCE_DOWNLOAD || !videoPath || !infoPath) {
    console.log(`  downloading from YouTube...`);
    ytDlpDownload(url, rawDir, outBase);
    ({ videoPath, infoPath } = findExistingDownload(rawDir, outBase));
  } else {
    console.log(`  using cached download (${path.basename(videoPath)})`);
  }
  if (!videoPath || !infoPath) {
    throw new Error(`download files missing for ${job.movieId}`);
  }

  const dur = videoDuration(infoPath);
  let start;
  if (typeof job.startAt === 'number') {
    // Absolute start time (seconds) into the source video.
    start = job.startAt;
    if (dur && start + CLIP_SECONDS > dur) start = Math.max(0, dur - CLIP_SECONDS);
    console.log(`  duration=${dur ?? '?'}s  startAt=${job.startAt}s  finalStart=${start.toFixed(2)}s`);
  } else {
    // Smart-cut start + optional offset.
    const smartStart = calcSmartStart(infoPath);
    start = smartStart + (job.startOffset || 0);
    if (dur && start + CLIP_SECONDS > dur) start = Math.max(0, dur - CLIP_SECONDS);
    console.log(
      `  duration=${dur ?? '?'}s  smartStart=${smartStart.toFixed(2)}s  offset=${job.startOffset || 0}s  finalStart=${start.toFixed(2)}s`
    );
  }

  const finalPath = path.join(PUBLIC_ASSETS_MOVIES, job.movieId, 'trailer.mp4');
  const bak = backupExisting(finalPath);
  if (bak) console.log(`  backed up old -> ${path.basename(bak)}`);

  ffmpegCut(videoPath, start, finalPath, CLIP_SECONDS);
  const size = fs.statSync(finalPath).size;
  console.log(`  wrote ${finalPath} (${(size / 1024).toFixed(0)} KB)`);
}

async function main() {
  for (const job of JOBS) {
    try {
      await runJob(job);
    } catch (e) {
      console.error(`  FAILED ${job.movieId}: ${e.message?.split('\n')[0] || e}`);
      process.exitCode = 1;
    }
  }
  console.log('\nDone.');
}

main();
