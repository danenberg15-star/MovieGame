// Fix Hebrew translations in movies-clean.json
// Strategy (hybrid):
//   1. For every English-looking entry in decoy_answers.he, ask TMDB if it has
//      a real Hebrew title. If yes, use it.
//   2. If TMDB still returns Latin chars, fall back to a random Hebrew title
//      from the local 561-movie pool (deduped per movie).
//   3. Also fix any main title.he that looks English (TMDB only, no fallback —
//      keep original if TMDB has no Hebrew).
//
// Run:  node fix-hebrew-translations.js [--sample N]
//
// Output: rewrites src/data/movies-clean.json and public/movies-clean.json.
// Cache:  hebrew-titles-cache.json so re-runs are fast/free.

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TMDB_API_KEY = process.env.TMDB_API_KEY;
if (!TMDB_API_KEY) {
  console.error('Missing TMDB_API_KEY in .env');
  process.exit(1);
}

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC_JSON = path.join(REPO_ROOT, 'src', 'data', 'movies-clean.json');
const PUB_JSON = path.join(REPO_ROOT, 'public', 'movies-clean.json');
const CACHE = path.join(__dirname, 'hebrew-titles-cache.json');

const args = process.argv.slice(2);
const sampleIdx = args.indexOf('--sample');
const sampleN = sampleIdx >= 0 ? parseInt(args[sampleIdx + 1] || '20', 10) : null;

const isLatin = (s) =>
  typeof s === 'string' &&
  /^[\x00-\x7F\s\d:,''.!?()\-–—&\/]+$/.test(s) &&
  /[A-Za-z]/.test(s);

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const saveCache = () => fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdbSearchHebrewTitle(englishTitle) {
  if (cache[englishTitle] !== undefined) return cache[englishTitle];
  try {
    const search = await axios.get('https://api.themoviedb.org/3/search/movie', {
      params: { api_key: TMDB_API_KEY, query: englishTitle, language: 'en-US' },
      timeout: 15000,
    });
    const hit = search.data.results?.[0];
    if (!hit) {
      cache[englishTitle] = null;
      return null;
    }
    await sleep(90);
    const heRes = await axios.get(`https://api.themoviedb.org/3/movie/${hit.id}`, {
      params: { api_key: TMDB_API_KEY, language: 'he-IL' },
      timeout: 15000,
    });
    const heTitle = heRes.data.title;
    const result = heTitle && !isLatin(heTitle) ? heTitle : null;
    cache[englishTitle] = result;
    return result;
  } catch (e) {
    console.log('  TMDB error for', JSON.stringify(englishTitle), '-', e.message);
    return null; // do NOT cache transient errors
  }
}

async function main() {
  console.log('Reading', SRC_JSON);
  const data = JSON.parse(fs.readFileSync(SRC_JSON, 'utf8'));
  const allMovies = data.movies;
  const movies = sampleN ? allMovies.slice(0, sampleN) : allMovies;
  console.log(`Processing ${movies.length} movie(s) (sample=${!!sampleN})`);

  const hebrewTitlePool = allMovies
    .map((m) => m.title?.he)
    .filter((t) => t && !isLatin(t));

  const pickRandomHebrew = (excludeSet) => {
    for (let i = 0; i < 100; i++) {
      const t = hebrewTitlePool[Math.floor(Math.random() * hebrewTitlePool.length)];
      if (!excludeSet.has(t)) return t;
    }
    return hebrewTitlePool[0];
  };

  let titlesFixedTmdb = 0;
  let decoysFixedTmdb = 0;
  let decoysFallback = 0;
  let processed = 0;

  for (const movie of movies) {
    processed++;

    if (isLatin(movie.title?.he)) {
      const he = await tmdbSearchHebrewTitle(movie.title.en);
      if (he) {
        movie.title.he = he;
        titlesFixedTmdb++;
      }
    }

    const used = new Set([movie.title?.he, movie.title?.en].filter(Boolean));
    const fixedDecoys = [];
    for (const dec of movie.decoy_answers?.he || []) {
      if (!dec) continue;
      if (!isLatin(dec)) {
        if (!used.has(dec)) {
          fixedDecoys.push(dec);
          used.add(dec);
        }
        continue;
      }
      const he = await tmdbSearchHebrewTitle(dec);
      if (he && !used.has(he)) {
        fixedDecoys.push(he);
        used.add(he);
        decoysFixedTmdb++;
        continue;
      }
      const fb = pickRandomHebrew(used);
      fixedDecoys.push(fb);
      used.add(fb);
      decoysFallback++;
    }
    while (fixedDecoys.length < 9) {
      const fb = pickRandomHebrew(used);
      fixedDecoys.push(fb);
      used.add(fb);
    }
    movie.decoy_answers.he = fixedDecoys;

    if (processed % 10 === 0) {
      console.log(
        `[${processed}/${movies.length}] titlesTmdb=${titlesFixedTmdb} decoysTmdb=${decoysFixedTmdb} fallback=${decoysFallback} cacheSize=${Object.keys(cache).length}`
      );
      saveCache();
    }
  }

  saveCache();

  if (!sampleN) {
    fs.writeFileSync(SRC_JSON, JSON.stringify(data, null, 2));
    fs.writeFileSync(PUB_JSON, JSON.stringify(data, null, 2));
    console.log('\nWrote fixed JSON to:');
    console.log('  ', SRC_JSON);
    console.log('  ', PUB_JSON);
  } else {
    console.log('\nSample mode — JSON files NOT written.');
  }

  console.log('\nSummary:');
  console.log(`  Titles fixed via TMDB:  ${titlesFixedTmdb}`);
  console.log(`  Decoys fixed via TMDB:  ${decoysFixedTmdb}`);
  console.log(`  Decoys via fallback:    ${decoysFallback}`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  saveCache();
  process.exit(1);
});
