// Retry specific failed candidates by trying alternative YouTube results
// from yt-search (instead of the single TMDB URL that failed).
//
// Run:
//   node retry-failed.js                 # retry first 3 failed entries
//   node retry-failed.js --all           # retry all failed
//   node retry-failed.js "Pulp Fiction"  # retry whose title contains this

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import ytSearch from 'yt-search';
import axios from 'axios';
import {
  TMDB_BASE,
  STAGING_MOVIES_DIR,
  STAGING_RAW_DIR,
  REPORT_FILE,
  NEW_MOVIES_FILE,
  FFMPEG_PATH,
  ensureDir,
  readJson,
  writeJson,
  sleep,
  isLatin,
} from './common.js';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_CAST_IMAGE = 'https://image.tmdb.org/t/p/w200';

async function tmdb(p, params = {}) {
  const { data } = await axios.get(`${TMDB_BASE}${p}`, {
    params: { api_key: TMDB_API_KEY, ...params },
    timeout: 20000,
  });
  return data;
}

function ytDlpDownload(url, outDir, outBase) {
  ensureDir(outDir);
  const tmpl = path.join(outDir, `${outBase}.%(ext)s`);
  const args = [
    '-f', 'bv*[height<=480]+ba/b[height<=480]/best',
    '--write-info-json',
    '--no-playlist',
    '--no-warnings',
    '--ffmpeg-location', FFMPEG_PATH,
    '-o', tmpl,
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
      (b, p) => (p.value > b.value ? p : b),
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
      '-y', '-ss', start, '-t', '00:00:15',
      '-i', srcPath,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
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

async function buildDecoys(tmdbId) {
  const similar = await tmdb(`/movie/${tmdbId}/similar`, { language: 'en-US' });
  const ids = (similar?.results || []).slice(0, 12).map((s) => s.id);
  const en = [];
  const he = [];
  for (const id of ids) {
    try {
      const enRes = await tmdb(`/movie/${id}`, { language: 'en-US' });
      if (enRes?.title) en.push(enRes.title);
      await sleep(80);
      const heRes = await tmdb(`/movie/${id}`, { language: 'he-IL' });
      if (heRes?.title && !isLatin(heRes.title)) he.push(heRes.title);
    } catch { /* ignore */ }
  }
  return { en: en.slice(0, 9), he: he.slice(0, 9) };
}

async function tryDownloadAlternatives(candidate, rawDir, outBase) {
  const queries = [
    `${candidate.title} ${candidate.year} official trailer`,
    `${candidate.title} ${candidate.year} trailer HD`,
    `${candidate.title} ${candidate.year} movie trailer`,
    `${candidate.title} trailer`,
  ];
  for (const q of queries) {
    console.log(`  searching: "${q}"`);
    let results;
    try {
      results = await ytSearch(q);
    } catch (e) {
      console.log(`    yt-search error: ${e.message}`);
      continue;
    }
    const videos = (results?.videos || []).slice(0, 6);
    for (const v of videos) {
      console.log(`    trying: ${v.title} (${v.duration?.timestamp || '?'})  ${v.url}`);
      try {
        ytDlpDownload(v.url, rawDir, outBase);
        const { videoPath, infoPath } = findExistingDownload(rawDir, outBase);
        if (videoPath && infoPath) {
          console.log(`    ✓ downloaded`);
          return { videoPath, infoPath, sourceUrl: v.url };
        }
      } catch (e) {
        const msg = (e.message || '').split('\n')[0];
        console.log(`    failed: ${msg}`);
      }
    }
  }
  return null;
}

async function processRetry(reportEntry) {
  const { tmdb_id, movie_id, title, year } = reportEntry;
  console.log(`\n--- ${title} (${year}) -> ${movie_id} (tmdb=${tmdb_id}) ---`);

  const rawDir = path.join(STAGING_RAW_DIR, String(tmdb_id));
  const outBase = `tmdb_${tmdb_id}`;
  const stagingDir = path.join(STAGING_MOVIES_DIR, movie_id);
  const finalTrailer = path.join(stagingDir, 'trailer.mp4');
  const finalData = path.join(stagingDir, 'data.json');

  // Clear any partial downloads from a previous attempt.
  if (fs.existsSync(rawDir)) {
    for (const f of fs.readdirSync(rawDir)) {
      try { fs.unlinkSync(path.join(rawDir, f)); } catch { /* ignore */ }
    }
  }

  const dl = await tryDownloadAlternatives({ title, year }, rawDir, outBase);
  if (!dl) return { ok: false, reason: 'all-yt-attempts-failed' };

  const startSec = calcSmartStart(dl.infoPath);
  try {
    ffmpegCut(dl.videoPath, startSec, finalTrailer);
  } catch (e) {
    return { ok: false, reason: `ffmpeg: ${(e.message || '').split('\n')[0]}` };
  }

  const details = await tmdb(`/movie/${tmdb_id}`, { language: 'en-US' });
  await sleep(80);
  const credits = await tmdb(`/movie/${tmdb_id}/credits`);
  await sleep(80);
  let heTitle = title;
  try {
    const heDetails = await tmdb(`/movie/${tmdb_id}`, { language: 'he-IL' });
    if (heDetails?.title && !isLatin(heDetails.title)) heTitle = heDetails.title;
  } catch { /* ignore */ }
  await sleep(80);

  const decoys = await buildDecoys(tmdb_id);

  const data = {
    id: movie_id,
    tmdb_id,
    title: { en: details.title, he: heTitle },
    year,
    director: buildPerson(credits, 'Director'),
    producer: buildPerson(credits, 'Producer'),
    cast: buildCastEntries(credits),
    oscars: [],
    trailer: `/assets/movies/${movie_id}/trailer.mp4`,
    poster: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : null,
    decoy_answers: decoys,
    smart_cut: { start_seconds: Number(startSec.toFixed(2)) },
    source: 'expand-database-v1-retry',
    retry_source_url: dl.sourceUrl,
  };
  writeJson(finalData, data);

  return { ok: true, start: data.smart_cut.start_seconds };
}

async function main() {
  const report = readJson(REPORT_FILE, null);
  if (!report?.results) {
    console.error('No staging/report.json found.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const positional = args.filter((a) => !a.startsWith('--'));

  let toRetry = report.results.filter((r) => r.status === 'failed');
  if (positional.length) {
    toRetry = toRetry.filter((r) =>
      positional.some((p) => r.title.toLowerCase().includes(p.toLowerCase()))
    );
  } else if (!all) {
    toRetry = toRetry.slice(0, 3);
  }

  console.log(`Retrying ${toRetry.length} failed entries:`);
  for (const r of toRetry) console.log(`  - ${r.title} (${r.year})`);

  const updates = [];
  for (const entry of toRetry) {
    const res = await processRetry(entry);
    updates.push({ entry, res });
  }

  // Update report.json + new-movies.json with successful retries.
  for (const { entry, res } of updates) {
    const idx = report.results.findIndex((r) => r.tmdb_id === entry.tmdb_id);
    if (idx >= 0) {
      report.results[idx].status = res.ok ? 'ok' : 'failed';
      report.results[idx].reason = res.ok ? undefined : res.reason;
      report.results[idx].start = res.start;
      report.results[idx].retried = true;
    }
  }
  report.ok = report.results.filter((r) => r.status === 'ok').length;
  report.failed = report.results.filter((r) => r.status === 'failed').length;
  report.skipped = report.results.filter((r) => r.status === 'skipped').length;
  writeJson(REPORT_FILE, report);

  // Rebuild new-movies.json from all staged data.json files.
  const staged = [];
  for (const r of report.results) {
    if (!r.movie_id) continue;
    const dataPath = path.join(STAGING_MOVIES_DIR, r.movie_id, 'data.json');
    if (fs.existsSync(dataPath)) {
      staged.push(JSON.parse(fs.readFileSync(dataPath, 'utf8')));
    }
  }
  writeJson(NEW_MOVIES_FILE, staged);

  console.log(`\nDone. New report totals: ok=${report.ok} failed=${report.failed} skipped=${report.skipped}`);
  console.log(`Staged movies: ${staged.length}`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
