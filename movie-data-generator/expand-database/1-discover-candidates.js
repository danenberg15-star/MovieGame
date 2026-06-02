// Step 1: Discover TMDB candidates that aren't already in our DB.
// Query: top-rated, non-animated, 1976-now, >=5000 votes.
//
// Run:  node 1-discover-candidates.js [count]
//
// Output: staging/candidates.json — array of { tmdb_id, title, year, vote_average, vote_count }

import 'dotenv/config';
import axios from 'axios';
import {
  TMDB_BASE,
  STAGING_ROOT,
  CANDIDATES_FILE,
  ensureDir,
  writeJson,
  sleep,
  buildExistingIndex,
  normalizeTitle,
} from './common.js';

const TARGET_COUNT = parseInt(process.argv[2] || '200', 10);
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const MIN_VOTES = 5000;
const ANIMATION_GENRE = 16;
const MIN_YEAR = new Date().getFullYear() - 50;

if (!TMDB_API_KEY) {
  console.error('Missing TMDB_API_KEY in .env');
  process.exit(1);
}

async function discoverPage(page) {
  const { data } = await axios.get(`${TMDB_BASE}/discover/movie`, {
    params: {
      api_key: TMDB_API_KEY,
      language: 'en-US',
      sort_by: 'vote_average.desc',
      'vote_count.gte': MIN_VOTES,
      'primary_release_date.gte': `${MIN_YEAR}-01-01`,
      without_genres: ANIMATION_GENRE,
      include_adult: false,
      page,
    },
    timeout: 20000,
  });
  return data;
}

async function main() {
  ensureDir(STAGING_ROOT);
  const { titleYear, titlesOnly } = buildExistingIndex();
  console.log(`Existing DB: ${titlesOnly.size} unique titles, ${titleYear.size} title+year keys`);
  console.log(`Target: ${TARGET_COUNT} new movies, votes>=${MIN_VOTES}, year>=${MIN_YEAR}, non-animated`);

  const candidates = [];
  const seenTmdb = new Set();
  let skippedDupe = 0;
  let page = 1;

  while (candidates.length < TARGET_COUNT && page <= 500) {
    let data;
    try {
      data = await discoverPage(page);
    } catch (e) {
      console.log(`  page ${page} error: ${e.message}, retrying after 3s`);
      await sleep(3000);
      continue;
    }

    if (!data.results?.length) {
      console.log('No more results from TMDB.');
      break;
    }

    for (const r of data.results) {
      if (candidates.length >= TARGET_COUNT) break;
      if (seenTmdb.has(r.id)) continue;
      seenTmdb.add(r.id);
      if (!r.release_date) continue;
      const year = parseInt(r.release_date.substring(0, 4), 10);
      if (!year || year < MIN_YEAR) continue;
      const titleKey = normalizeTitle(r.title);
      if (!titleKey) continue;
      if (titleYear.has(`${titleKey}|${year}`) || titlesOnly.has(titleKey)) {
        skippedDupe++;
        continue;
      }
      candidates.push({
        tmdb_id: r.id,
        title: r.title,
        original_title: r.original_title,
        year,
        vote_average: r.vote_average,
        vote_count: r.vote_count,
        popularity: r.popularity,
      });
    }

    if (page % 10 === 0 || candidates.length >= TARGET_COUNT) {
      console.log(`  page ${page}: have ${candidates.length}/${TARGET_COUNT} candidates (skipped ${skippedDupe} dupes)`);
    }

    if (page >= (data.total_pages || 0)) {
      console.log(`Reached last TMDB page (${page}).`);
      break;
    }

    page++;
    await sleep(120);
  }

  writeJson(CANDIDATES_FILE, candidates);
  console.log(`\nDone. ${candidates.length} candidates → ${CANDIDATES_FILE}`);
  console.log('Top 5:');
  for (const c of candidates.slice(0, 5)) {
    console.log(`  ${c.title} (${c.year})  rating=${c.vote_average} votes=${c.vote_count}`);
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
