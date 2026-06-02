// Step 2: For every candidate, fetch full TMDB metadata, find a YouTube trailer,
// download it with yt-dlp + info.json (heatmap), and cut a smart 15-second clip
// using the heatmap peak (same logic as smart_trailer_editor.js).
//
// Run:  node 2-fetch-and-cut.js [--limit N] [--resume]
//
// Output per movie (staging/movies/movie_NNN/):
//   - trailer.mp4   (15s clip ready to ship)
//   - data.json     (final movie metadata to merge into movies-clean.json)
//
// Raw YouTube downloads are kept under staging/raw_youtube/{tmdbId}/ so a
// re-run can skip the download/cut step.

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import ytSearch from 'yt-search';
import {
  TMDB_BASE,
  STAGING_ROOT,
  STAGING_MOVIES_DIR,
  STAGING_RAW_DIR,
  CANDIDATES_FILE,
  NEW_MOVIES_FILE,
  REPORT_FILE,
  EXISTING_MOVIES_JSON,
  FFMPEG_PATH,
  ensureDir,
  readJson,
  writeJson,
  sleep,
  isLatin,
  nextMovieIdAllocator,
  readStagedMovieIds,
} from './common.js';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
if (!TMDB_API_KEY) {
  console.error('Missing TMDB_API_KEY');
  process.exit(1);
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_CAST_IMAGE = 'https://image.tmdb.org/t/p/w200';

const argv = process.argv.slice(2);
const limitIdx = argv.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(argv[limitIdx + 1] || '0', 10) : 0;
const RESUME = argv.includes('--resume');

async function tmdb(pathStr, params = {}) {
  const { data } = await axios.get(`${TMDB_BASE}${pathStr}`, {
    params: { api_key: TMDB_API_KEY, ...params },
    timeout: 20000,
  });
  return data;
}

function pickTrailerVideo(videos) {
  if (!videos?.results?.length) return null;
  const yt = videos.results.filter((v) => v.site === 'YouTube');
  const score = (v) =>
    (v.type === 'Trailer' ? 8 : v.type === 'Teaser' ? 4 : 1) +
    (v.official ? 2 : 0) +
    (v.iso_639_1 === 'en' ? 1 : 0);
  yt.sort((a, b) => score(b) - score(a));
  return yt[0] || null;
}

async function findYoutubeUrl(movie) {
  const videos = await tmdb(`/movie/${movie.tmdb_id}/videos`);
  const pick = pickTrailerVideo(videos);
  if (pick?.key) return `https://www.youtube.com/watch?v=${pick.key}`;
  const term = `${movie.title} ${movie.year} official trailer`;
  const search = await ytSearch(term);
  if (!search?.videos?.length) return null;
  return search.videos[0].url;
}

function ytDlpDownload(url, outDir, outBase) {
  ensureDir(outDir);
  const tmpl = path.join(outDir, `${outBase}.%(ext)s`);
  const args = [
    '-f',
    'bv*[height<=480]+ba/b[height<=480]',
    '--write-info-json',
    '--no-playlist',
    '--no-warnings',
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
      return Math.min(10, Math.max(0, duration - 15));
    }
    const peak = info.heatmap.reduce(
      (best, p) => (p.value > best.value ? p : best),
      info.heatmap[0]
    );
    const peakTime = peak.start_time || 0;
    let start = peakTime <= 20 ? 10 : peakTime - 7;
    if (start + 15 > duration) start = duration - 15;
    return Math.max(0, start);
  } catch {
    return 10;
  }
}

function ffmpegCut(srcPath, startSec, outPath) {
  ensureDir(path.dirname(outPath));
  const start = new Date(startSec * 1000).toISOString().substr(11, 8);
  execFileSync(
    FFMPEG_PATH,
    [
      '-y',
      '-ss',
      start,
      '-t',
      '00:00:15',
      '-i',
      srcPath,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outPath,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 }
  );
}

function buildCastEntries(credits) {
  return (credits?.cast || []).slice(0, 10).map((a) => ({
    name: { en: a.name, he: a.name },
    image: a.profile_path ? `${TMDB_CAST_IMAGE}${a.profile_path}` : null,
  }));
}

function buildPerson(credits, job) {
  const p = (credits?.crew || []).find((c) => c.job === job);
  if (!p) return null;
  return {
    name: { en: p.name, he: p.name },
    image: p.profile_path ? `${TMDB_CAST_IMAGE}${p.profile_path}` : null,
  };
}

async function buildDecoys(movie) {
  const similar = await tmdb(`/movie/${movie.tmdb_id}/similar`, { language: 'en-US' });
  const ids = (similar?.results || []).slice(0, 12).map((s) => s.id);
  if (!ids.length) return { en: [], he: [] };
  const en = [];
  const he = [];
  for (const id of ids) {
    try {
      const enRes = await tmdb(`/movie/${id}`, { language: 'en-US' });
      if (enRes?.title) en.push(enRes.title);
      await sleep(80);
      const heRes = await tmdb(`/movie/${id}`, { language: 'he-IL' });
      if (heRes?.title && !isLatin(heRes.title)) he.push(heRes.title);
    } catch {
      // ignore individual similar lookups
    }
  }
  return { en: en.slice(0, 9), he: he.slice(0, 9) };
}

async function processMovie(candidate, movieId) {
  const stagingDir = path.join(STAGING_MOVIES_DIR, movieId);
  const finalTrailer = path.join(stagingDir, 'trailer.mp4');
  const finalData = path.join(stagingDir, 'data.json');

  if (RESUME && fs.existsSync(finalTrailer) && fs.existsSync(finalData)) {
    return { status: 'skipped', reason: 'already-staged' };
  }

  const details = await tmdb(`/movie/${candidate.tmdb_id}`, { language: 'en-US' });
  await sleep(80);
  const credits = await tmdb(`/movie/${candidate.tmdb_id}/credits`);
  await sleep(80);
  let heTitle = candidate.title;
  try {
    const heDetails = await tmdb(`/movie/${candidate.tmdb_id}`, { language: 'he-IL' });
    if (heDetails?.title && !isLatin(heDetails.title)) heTitle = heDetails.title;
  } catch {
    // ignore
  }
  await sleep(80);

  const url = await findYoutubeUrl(candidate);
  if (!url) return { status: 'failed', reason: 'no-youtube-url' };

  const rawDir = path.join(STAGING_RAW_DIR, String(candidate.tmdb_id));
  const outBase = `tmdb_${candidate.tmdb_id}`;
  let { videoPath, infoPath } = findExistingDownload(rawDir, outBase);
  if (!videoPath || !infoPath) {
    try {
      ytDlpDownload(url, rawDir, outBase);
    } catch (e) {
      return { status: 'failed', reason: `yt-dlp: ${e.message?.split('\n')[0] || e}` };
    }
    ({ videoPath, infoPath } = findExistingDownload(rawDir, outBase));
    if (!videoPath || !infoPath) return { status: 'failed', reason: 'download-files-missing' };
  }

  const startSec = calcSmartStart(infoPath);
  try {
    ffmpegCut(videoPath, startSec, finalTrailer);
  } catch (e) {
    return { status: 'failed', reason: `ffmpeg: ${e.message?.split('\n')[0] || e}` };
  }

  const decoys = await buildDecoys(candidate);

  const data = {
    id: movieId,
    tmdb_id: candidate.tmdb_id,
    title: { en: details.title, he: heTitle },
    year: candidate.year,
    director: buildPerson(credits, 'Director'),
    producer: buildPerson(credits, 'Producer'),
    cast: buildCastEntries(credits),
    oscars: [],
    trailer: `/assets/movies/${movieId}/trailer.mp4`,
    poster: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : null,
    decoy_answers: decoys,
    smart_cut: { start_seconds: Number(startSec.toFixed(2)) },
    source: 'expand-database-v1',
  };
  writeJson(finalData, data);

  return { status: 'ok', start: data.smart_cut.start_seconds };
}

async function main() {
  ensureDir(STAGING_ROOT);
  ensureDir(STAGING_MOVIES_DIR);
  ensureDir(STAGING_RAW_DIR);

  const candidates = readJson(CANDIDATES_FILE, null);
  if (!Array.isArray(candidates) || !candidates.length) {
    console.error(`No candidates file. Run 1-discover-candidates.js first.`);
    process.exit(1);
  }
  const slice = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates;
  console.log(`Processing ${slice.length} candidate(s) (resume=${RESUME})`);

  const existing = readJson(EXISTING_MOVIES_JSON, { movies: [] }).movies;
  const stagedIds = readStagedMovieIds();
  const existingReport = RESUME ? readJson(REPORT_FILE, null) : null;
  const reportIds = (existingReport?.results || []).map((r) => r.movie_id).filter(Boolean);
  const allocate = nextMovieIdAllocator(existing, stagedIds, reportIds);

  // Build tmdb_id -> movie_id map by reading any already-staged data.json files.
  // This keeps --resume idempotent even after the report file was lost.
  const idMap = new Map();
  for (const stagedId of stagedIds) {
    const dataPath = path.join(STAGING_MOVIES_DIR, stagedId, 'data.json');
    if (!fs.existsSync(dataPath)) continue;
    try {
      const d = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      if (d.tmdb_id) idMap.set(d.tmdb_id, stagedId);
    } catch {
      // ignore malformed staged data
    }
  }
  if (existingReport?.results) {
    for (const r of existingReport.results) {
      if (r.movie_id && !idMap.has(r.tmdb_id)) idMap.set(r.tmdb_id, r.movie_id);
    }
  }
  console.log(`Pre-existing tmdb→movie_id mappings: ${idMap.size}`);

  let ok = 0, failed = 0, skipped = 0;
  const results = [];

  for (let i = 0; i < slice.length; i++) {
    const c = slice[i];
    let movieId = idMap.get(c.tmdb_id);
    if (!movieId) {
      movieId = allocate();
      idMap.set(c.tmdb_id, movieId);
    }

    const prefix = `[${i + 1}/${slice.length}] ${c.title} (${c.year}) -> ${movieId}`;
    process.stdout.write(`${prefix} ... `);

    let result;
    try {
      result = await processMovie(c, movieId);
    } catch (e) {
      result = { status: 'failed', reason: `unhandled: ${e.message || e}` };
    }

    if (result.status === 'ok') {
      ok++;
      console.log(`OK (start=${result.start}s)`);
    } else if (result.status === 'skipped') {
      skipped++;
      console.log(`skipped (${result.reason})`);
    } else {
      failed++;
      console.log(`FAILED (${result.reason})`);
    }

    results.push({
      idx: i + 1,
      tmdb_id: c.tmdb_id,
      movie_id: movieId,
      title: c.title,
      year: c.year,
      status: result.status,
      reason: result.reason,
      start: result.start,
    });

    if ((i + 1) % 10 === 0 || i === slice.length - 1) {
      writeJson(REPORT_FILE, { generatedAt: new Date().toISOString(), ok, failed, skipped, results });
    }
  }

  // Compile new-movies.json from successful stagings
  const staged = [];
  for (const r of results) {
    if (r.status !== 'ok' && r.status !== 'skipped') continue;
    const dataPath = path.join(STAGING_MOVIES_DIR, r.movie_id, 'data.json');
    if (fs.existsSync(dataPath)) {
      staged.push(JSON.parse(fs.readFileSync(dataPath, 'utf8')));
    }
  }
  writeJson(NEW_MOVIES_FILE, staged);

  console.log(`\nSummary: ok=${ok} failed=${failed} skipped=${skipped}`);
  console.log(`Wrote ${staged.length} staged movies to ${NEW_MOVIES_FILE}`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
