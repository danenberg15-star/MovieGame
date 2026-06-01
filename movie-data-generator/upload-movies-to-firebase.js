// Upload movies-clean.json to Firebase Realtime Database under movies/movies.
// Uses the same web SDK + config the client uses, so security rules apply.
// Run: node upload-movies-to-firebase.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SRC_JSON = path.join(REPO_ROOT, 'src', 'data', 'movies-clean.json');

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

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

async function main() {
  console.log('Reading', SRC_JSON);
  const data = JSON.parse(fs.readFileSync(SRC_JSON, 'utf8'));
  const movies = data.movies;
  if (!Array.isArray(movies) || !movies.length) {
    throw new Error('movies array empty or missing in source JSON');
  }
  console.log(`Uploading ${movies.length} movies to movies/movies ...`);

  const moviesRef = ref(database, 'movies/movies');
  await set(moviesRef, movies);

  console.log('Verifying upload ...');
  const snap = await get(moviesRef);
  const got = snap.val();
  if (!Array.isArray(got) || got.length !== movies.length) {
    throw new Error(
      `Verification failed: expected ${movies.length} movies, got ${Array.isArray(got) ? got.length : typeof got}`
    );
  }
  console.log(`Upload OK (${got.length} movies in Firebase).`);
  process.exit(0);
}

main().catch((e) => {
  console.error('Upload failed:', e);
  process.exit(1);
});
