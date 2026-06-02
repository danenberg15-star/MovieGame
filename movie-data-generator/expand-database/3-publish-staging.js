// Step 3 (MANUAL): publish staged movies into the real DB.
//   1. Copy every staging/movies/movie_NNN/trailer.mp4 to public/assets/movies/
//   2. Append staged data.json entries to src/data/movies-clean.json + public/
//   3. Upload merged movies array to Firebase (movies/movies)
//
// Run:  node 3-publish-staging.js [--no-firebase] [--dry-run]

import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';
import {
  STAGING_MOVIES_DIR,
  NEW_MOVIES_FILE,
  EXISTING_MOVIES_JSON,
  PUBLIC_MOVIES_JSON,
  PUBLIC_ASSETS_MOVIES,
  REPORT_FILE,
  ensureDir,
  readJson,
  writeJson,
} from './common.js';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const NO_FIREBASE = argv.includes('--no-firebase');

const firebaseConfig = {
  apiKey: 'AIzaSyDmbIUCxcGfiegokuVChM6JHSwigNIvMbA',
  authDomain: 'moviezguess.firebaseapp.com',
  databaseURL:
    'https://moviezguess-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'moviezguess',
  storageBucket: 'moviezguess.firebasestorage.app',
  messagingSenderId: '114321896387',
  appId: '1:114321896387:web:8362217e78c31e841d8376',
};

function copyTrailer(movieId) {
  const src = path.join(STAGING_MOVIES_DIR, movieId, 'trailer.mp4');
  const destDir = path.join(PUBLIC_ASSETS_MOVIES, movieId);
  const dest = path.join(destDir, 'trailer.mp4');
  if (!fs.existsSync(src)) throw new Error(`Missing staged trailer: ${src}`);
  ensureDir(destDir);
  if (DRY) {
    console.log(`  [dry] would copy ${src} -> ${dest}`);
    return;
  }
  fs.copyFileSync(src, dest);
}

async function main() {
  const newMovies = readJson(NEW_MOVIES_FILE, []);
  if (!Array.isArray(newMovies) || !newMovies.length) {
    console.error(`No staged movies. Run 2-fetch-and-cut.js first.`);
    process.exit(1);
  }
  const report = readJson(REPORT_FILE, null);
  if (report) console.log(`Report says: ok=${report.ok} failed=${report.failed} skipped=${report.skipped}`);

  const existingData = readJson(EXISTING_MOVIES_JSON, { movies: [] });
  const existingIds = new Set(existingData.movies.map((m) => m.id));

  console.log(`Publishing ${newMovies.length} movies. dry=${DRY} firebase=${!NO_FIREBASE}`);

  const merged = [...existingData.movies];
  let added = 0;
  for (const m of newMovies) {
    copyTrailer(m.id);
    if (existingIds.has(m.id)) {
      console.log(`  ${m.id} already in DB — replacing entry`);
      const idx = merged.findIndex((x) => x.id === m.id);
      merged[idx] = m;
    } else {
      merged.push(m);
      added++;
    }
  }

  const finalDoc = {
    ...existingData,
    total: merged.length,
    metadata: {
      ...(existingData.metadata || {}),
      updated_at: new Date().toISOString(),
    },
    movies: merged,
  };

  if (!DRY) {
    writeJson(EXISTING_MOVIES_JSON, finalDoc);
    writeJson(PUBLIC_MOVIES_JSON, finalDoc);
    console.log(`Wrote merged JSON: ${merged.length} total (added ${added})`);
  } else {
    console.log(`[dry] would write ${merged.length} movies (added ${added})`);
  }

  if (NO_FIREBASE) {
    console.log('Skipping Firebase upload (--no-firebase).');
    return;
  }
  if (DRY) {
    console.log('[dry] would upload to Firebase');
    return;
  }

  console.log('Uploading to Firebase ...');
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  await set(ref(db, 'movies/movies'), merged);
  const snap = await get(ref(db, 'movies/movies'));
  const got = snap.val();
  if (!Array.isArray(got) || got.length !== merged.length) {
    throw new Error(
      `Firebase verification failed: expected ${merged.length}, got ${Array.isArray(got) ? got.length : typeof got}`
    );
  }
  console.log(`Firebase OK (${got.length} movies).`);
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
