// Phase 2: Re-download and re-cut trailers flagged by audit-trailer-titles.js.
//
// Run from expand-database/:
//   node recut-clean-trailers.js
//   node recut-clean-trailers.js --resume
//   node recut-clean-trailers.js --limit 5
//   node recut-clean-trailers.js --force-download

import fs from 'fs';
import path from 'path';
import {
  EXISTING_MOVIES_JSON,
  STAGING_ROOT,
  ensureDir,
  readJson,
  writeJson,
  sleep,
} from './common.js';
import { recutMovieTrailer } from './lib/trailerPipeline.js';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
if (!TMDB_API_KEY) {
  console.error('Missing TMDB_API_KEY in movie-data-generator/.env');
  process.exit(1);
}

const AUDIT_DIR = path.join(STAGING_ROOT, 'trailer-title-audit');
const REPORT_FILE = path.join(AUDIT_DIR, 'report.json');
const RECUT_REPORT = path.join(AUDIT_DIR, 'recut-results.json');
const FAILURES_FILE = path.join(AUDIT_DIR, 'recut-failures.json');

const argv = process.argv.slice(2);
const limitIdx = argv.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(argv[limitIdx + 1] || '0', 10) : 0;
const RESUME = argv.includes('--resume');
const FORCE_DOWNLOAD = argv.includes('--force-download');

function loadMoviesById() {
  const data = readJson(EXISTING_MOVIES_JSON, { movies: [] });
  const map = new Map();
  for (const m of data.movies || []) {
    if (m.id) map.set(m.id, m);
  }
  return map;
}

async function main() {
  const audit = readJson(REPORT_FILE, null);
  if (!audit?.results?.length) {
    console.error(`No audit report at ${REPORT_FILE}. Run audit-trailer-titles.js first.`);
    process.exit(1);
  }

  let flagged = audit.results.filter((r) => r.flagged && !r.skipped);
  const prevRecut = RESUME ? readJson(RECUT_REPORT, { results: [] }) : { results: [] };
  const doneOk = new Set(
    (prevRecut.results || []).filter((r) => r.status === 'ok').map((r) => r.movieId)
  );

  if (RESUME) {
    flagged = flagged.filter((r) => !doneOk.has(r.movieId));
  }
  if (LIMIT > 0) flagged = flagged.slice(0, LIMIT);

  const moviesById = loadMoviesById();
  const workRoot = path.join(AUDIT_DIR, 'recut-work');
  ensureDir(workRoot);

  console.log(`Re-cutting ${flagged.length} flagged trailer(s)`);

  const results = [...(prevRecut.results || [])];
  const failures = readJson(FAILURES_FILE, { failures: [] }).failures || [];

  for (let i = 0; i < flagged.length; i++) {
    const row = flagged[i];
    let movie = moviesById.get(row.movieId);
    if (!movie) {
      movie = { id: row.movieId, title: row.title || { en: row.movieId }, tmdb_id: row.tmdb_id };
    }
    if (!movie.tmdb_id) {
      console.log(`[${i + 1}/${flagged.length}] ${row.movieId} — no tmdb_id, cannot recut`);
      const entry = {
        movieId: row.movieId,
        status: 'failed',
        reason: 'no_tmdb_id',
        at: new Date().toISOString(),
      };
      results.push(entry);
      failures.push(entry);
      continue;
    }

    process.stdout.write(
      `[${i + 1}/${flagged.length}] ${movie.id} ${movie.title?.en} ... `
    );

    try {
      const out = await recutMovieTrailer(movie, { forceDownload: FORCE_DOWNLOAD, workRoot });
      const entry = {
        movieId: movie.id,
        title: movie.title?.en,
        ...out,
        at: new Date().toISOString(),
      };
      results.push(entry);

      if (out.status === 'ok') {
        console.log(`OK start=${out.startSeconds}s key=${out.youtubeKey}`);
      } else {
        console.log(`FAIL ${out.reason}`);
        failures.push(entry);
      }
    } catch (e) {
      const entry = {
        movieId: movie.id,
        status: 'failed',
        reason: e.message?.split('\n')[0] || String(e),
        at: new Date().toISOString(),
      };
      results.push(entry);
      failures.push(entry);
      console.log(`ERR ${entry.reason}`);
    }

    writeJson(RECUT_REPORT, {
      updatedAt: new Date().toISOString(),
      results,
      ok: results.filter((r) => r.status === 'ok').length,
      failed: results.filter((r) => r.status === 'failed').length,
    });
    writeJson(FAILURES_FILE, { failures });

    await sleep(500);
  }

  console.log('\n--- Recut summary ---');
  const ok = results.filter((r) => r.status === 'ok').length;
  const fail = results.filter((r) => r.status === 'failed').length;
  console.log(`OK: ${ok}  Failed: ${fail}`);
  console.log(`Results: ${RECUT_REPORT}`);
  if (failures.length) console.log(`Failures: ${FAILURES_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
