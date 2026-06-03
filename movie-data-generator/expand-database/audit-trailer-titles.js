// Phase 1: OCR scan all 15s trailer.mp4 files for on-screen movie title text.
//
// Run from expand-database/:
//   node audit-trailer-titles.js
//   node audit-trailer-titles.js --limit 20
//   node audit-trailer-titles.js --resume
//   node audit-trailer-titles.js --only movie_821

import fs from 'fs';
import path from 'path';
import {
  EXISTING_MOVIES_JSON,
  PUBLIC_ASSETS_MOVIES,
  STAGING_ROOT,
  ensureDir,
  readJson,
  writeJson,
} from './common.js';
import {
  getTesseractExe,
  ensureHebTessdata,
  auditTrailerVideo,
} from './lib/trailerTitleDetect.js';

const AUDIT_DIR = path.join(STAGING_ROOT, 'trailer-title-audit');
const REPORT_FILE = path.join(AUDIT_DIR, 'report.json');

const argv = process.argv.slice(2);
const limitIdx = argv.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(argv[limitIdx + 1] || '0', 10) : 0;
const RESUME = argv.includes('--resume');
const onlyIdx = argv.indexOf('--only');
const ONLY = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;

function loadMoviesById() {
  const data = readJson(EXISTING_MOVIES_JSON, { movies: [] });
  const map = new Map();
  for (const m of data.movies || []) {
    if (m.id) map.set(m.id, m);
  }
  return map;
}

/** Every movie_* folder with trailer.mp4 (765+), merged with JSON metadata. */
function loadTrailerMovies() {
  const byId = loadMoviesById();
  const ids = fs
    .readdirSync(PUBLIC_ASSETS_MOVIES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^movie_\d+$/i.test(d.name))
    .map((d) => d.name)
    .filter((id) => fs.existsSync(path.join(PUBLIC_ASSETS_MOVIES, id, 'trailer.mp4')))
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10);
      const nb = parseInt(b.replace(/\D/g, ''), 10);
      return na - nb;
    });

  return ids.map((id) => {
    const meta = byId.get(id);
    if (meta) return meta;
    return {
      id,
      title: { en: id, he: id },
      tmdb_id: null,
    };
  });
}

function loadReport() {
  return readJson(REPORT_FILE, { scannedAt: null, results: [] });
}

function resultMap(report) {
  const m = new Map();
  for (const r of report.results || []) {
    if (r.movieId) m.set(r.movieId, r);
  }
  return m;
}

async function auditOne(movie, workDir) {
  const trailerPath = path.join(PUBLIC_ASSETS_MOVIES, movie.id, 'trailer.mp4');
  if (!fs.existsSync(trailerPath)) {
    return {
      movieId: movie.id,
      tmdb_id: movie.tmdb_id,
      title: movie.title,
      skipped: true,
      reason: 'no_trailer_file',
      flagged: false,
    };
  }

  const frameDir = path.join(workDir, movie.id);
  ensureDir(frameDir);

  const audit = auditTrailerVideo(trailerPath, movie, undefined, frameDir);
  return {
    movieId: movie.id,
    tmdb_id: movie.tmdb_id,
    title: movie.title,
    flagged: audit.flagged,
    matchedText: audit.bestMatch?.matchedText,
    reason: audit.bestMatch?.reason,
    frameTime: audit.bestMatch?.frameTime,
    frameIndex: audit.bestMatch?.frameIndex,
    ocrSample: audit.frames
      ?.filter((f) => f.detection?.flagged)
      .map((f) => f.text.slice(0, 120))
      .join(' | ')
      .slice(0, 300),
    scannedAt: new Date().toISOString(),
  };
}

async function main() {
  getTesseractExe();
  ensureHebTessdata();

  ensureDir(AUDIT_DIR);
  const workDir = path.join(AUDIT_DIR, 'frames');
  ensureDir(workDir);

  let movies = loadTrailerMovies();
  if (ONLY) movies = movies.filter((m) => m.id === ONLY);
  if (LIMIT > 0) movies = movies.slice(0, LIMIT);

  const report = RESUME ? loadReport() : { scannedAt: null, results: [] };
  const done = RESUME ? resultMap(report) : new Map();

  console.log(`Auditing ${movies.length} trailer(s) (resume=${RESUME})`);

  let flagged = 0;
  let scanned = 0;

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    if (RESUME && done.has(movie.id)) {
      if (done.get(movie.id).flagged) flagged++;
      continue;
    }

    const label = `[${i + 1}/${movies.length}] ${movie.id} ${movie.title?.en || ''}`;
    process.stdout.write(`${label} ... `);

    try {
      const row = await auditOne(movie, workDir);
      done.set(movie.id, row);
      scanned++;
      if (row.flagged) {
        flagged++;
        console.log(`FLAG  (${row.matchedText || '?'})`);
      } else if (row.skipped) {
        console.log(`skip (${row.reason})`);
      } else {
        console.log('ok');
      }
    } catch (e) {
      const row = {
        movieId: movie.id,
        title: movie.title,
        flagged: false,
        error: e.message?.split('\n')[0] || String(e),
        scannedAt: new Date().toISOString(),
      };
      done.set(movie.id, row);
      console.log(`ERR  ${row.error}`);
    }

    report.results = [...done.values()];
    report.scannedAt = new Date().toISOString();
    report.summary = {
      total: report.results.length,
      flagged: report.results.filter((r) => r.flagged).length,
      errors: report.results.filter((r) => r.error).length,
      skipped: report.results.filter((r) => r.skipped).length,
    };
    writeJson(REPORT_FILE, report);
  }

  console.log('\n--- Summary ---');
  console.log(`Scanned this run: ${scanned}`);
  console.log(`Flagged (total):   ${report.summary?.flagged ?? flagged}`);
  console.log(`Report: ${REPORT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
