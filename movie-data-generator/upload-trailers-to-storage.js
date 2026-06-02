// Upload local trailer.mp4 files to Firebase Storage (public read via storage.rules).
//
// Prerequisites:
//   1. Firebase CLI logged in:  firebase login
//   2. Application default credentials OR service account:
//        set GOOGLE_APPLICATION_CREDENTIALS=path\to\serviceAccount.json
//   3. Deploy rules once:  firebase deploy --only storage
//
// Run from repo root:
//   node movie-data-generator/upload-trailers-to-storage.js
//   node movie-data-generator/upload-trailers-to-storage.js --dry-run
//   node movie-data-generator/upload-trailers-to-storage.js --only-missing
//   node movie-data-generator/upload-trailers-to-storage.js --from movie_700

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const MOVIES_ASSETS = path.join(REPO_ROOT, 'public', 'assets', 'movies');
const BUCKET = 'moviezguess.firebasestorage.app';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const ONLY_MISSING = argv.includes('--only-missing');
const fromIdx = argv.indexOf('--from');
const FROM_ID = fromIdx >= 0 ? argv[fromIdx + 1] : null;
const CONCURRENCY = 4;

function listTrailers() {
  if (!fs.existsSync(MOVIES_ASSETS)) {
    throw new Error(`Missing folder: ${MOVIES_ASSETS}`);
  }
  return fs
    .readdirSync(MOVIES_ASSETS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((id) => fs.existsSync(path.join(MOVIES_ASSETS, id, 'trailer.mp4')))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function initAdmin() {
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (saPath && fs.existsSync(saPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: BUCKET,
    });
    console.log('Using service account:', saPath);
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    storageBucket: BUCKET,
  });
  console.log('Using application default credentials (firebase login / gcloud auth)');
}

async function existsInBucket(bucket, dest) {
  try {
    const [exists] = await bucket.file(dest).exists();
    return exists;
  } catch {
    return false;
  }
}

async function uploadOne(bucket, movieId) {
  const localPath = path.join(MOVIES_ASSETS, movieId, 'trailer.mp4');
  const dest = `trailers/${movieId}/trailer.mp4`;

  if (ONLY_MISSING && (await existsInBucket(bucket, dest))) {
    return { movieId, status: 'skipped' };
  }

  if (DRY) {
    console.log(`  [dry] ${localPath} -> gs://${BUCKET}/${dest}`);
    return { movieId, status: 'dry' };
  }

  await bucket.upload(localPath, {
    destination: dest,
    metadata: {
      contentType: 'video/mp4',
      cacheControl: 'public, max-age=31536000',
    },
  });

  return { movieId, status: 'uploaded' };
}

async function runPool(items, worker) {
  let index = 0;
  const results = [];

  async function runWorker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => runWorker()));
  return results;
}

async function main() {
  let ids = listTrailers();
  if (FROM_ID) {
    ids = ids.filter((id) => id >= FROM_ID);
  }

  console.log(`Trailers to process: ${ids.length} (dry=${DRY}, onlyMissing=${ONLY_MISSING})`);
  if (!ids.length) return;

  initAdmin();
  const bucket = getStorage().bucket();

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  await runPool(ids, async (movieId, i) => {
    try {
      const result = await uploadOne(bucket, movieId);
      if (result.status === 'uploaded') uploaded++;
      else if (result.status === 'skipped' || result.status === 'dry') skipped++;
      if ((i + 1) % 25 === 0 || i === ids.length - 1) {
        console.log(`Progress ${i + 1}/${ids.length} (up=${uploaded} skip=${skipped} fail=${failed})`);
      }
      return result;
    } catch (error) {
      failed++;
      console.error(`  FAIL ${movieId}:`, error.message || error);
      return { movieId, status: 'failed', error };
    }
  });

  console.log(`\nDone. uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
