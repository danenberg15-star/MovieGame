/**
 * YouTube download, ffmpeg cut, TMDB trailer discovery — shared by recut scripts.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import axios from 'axios';
import ytSearch from 'yt-search';
import {
  STAGING_RAW_DIR,
  PUBLIC_ASSETS_MOVIES,
  FFMPEG_PATH,
  TMDB_BASE,
  ensureDir,
  sleep,
} from '../common.js';
import {
  CLIP_SECONDS,
  auditTrailerVideo,
  RECUT_VERIFY_TIMES,
} from './trailerTitleDetect.js';

const TMDB_API_KEY = process.env.TMDB_API_KEY;

export function ytDlpDownload(url, outDir, outBase, force = false) {
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
  if (force) args.splice(4, 0, '--force-overwrites');
  execFileSync('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
}

export function findExistingDownload(rawDir, outBase) {
  ensureDir(rawDir);
  if (!fs.existsSync(rawDir)) {
    return { videoPath: null, infoPath: null };
  }
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

export function videoDuration(infoJsonPath) {
  try {
    const info = JSON.parse(fs.readFileSync(infoJsonPath, 'utf8'));
    return info.duration || null;
  } catch {
    return null;
  }
}

export function calcSmartStart(infoJsonPath) {
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

export function ffmpegCut(srcPath, startSec, outPath, clipSeconds = CLIP_SECONDS) {
  ensureDir(path.dirname(outPath));
  const start = new Date(startSec * 1000).toISOString().substr(11, 8);
  const len = new Date(clipSeconds * 1000).toISOString().substr(11, 8);
  execFileSync(
    FFMPEG_PATH,
    [
      '-y',
      '-ss',
      start,
      '-t',
      len,
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

export function backupExisting(finalPath) {
  if (!fs.existsSync(finalPath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = finalPath.replace(/\.mp4$/i, `.bak-${stamp}.mp4`);
  fs.copyFileSync(finalPath, bak);
  return bak;
}

async function tmdb(pathStr, params = {}) {
  const { data } = await axios.get(`${TMDB_BASE}${pathStr}`, {
    params: { api_key: TMDB_API_KEY, ...params },
    timeout: 20000,
  });
  return data;
}

export function pickTrailerVideos(videos, limit = 5) {
  if (!videos?.results?.length) return [];
  const yt = videos.results.filter((v) => v.site === 'YouTube');
  const score = (v) =>
    (v.type === 'Trailer' ? 8 : v.type === 'Teaser' ? 4 : 1) +
    (v.official ? 2 : 0) +
    (v.iso_639_1 === 'en' ? 1 : 0);
  yt.sort((a, b) => score(b) - score(a));
  return yt.slice(0, limit);
}

export async function listYoutubeKeysForMovie(movie) {
  const keys = [];
  try {
    const videos = await tmdb(`/movie/${movie.tmdb_id}/videos`);
    await sleep(250);
    for (const v of pickTrailerVideos(videos, 5)) {
      if (v.key && !keys.includes(v.key)) keys.push(v.key);
    }
  } catch {
    // ignore
  }
  if (!keys.length) {
    const term = `${movie.title?.en || movie.title} ${movie.year || ''} official trailer`;
    const search = await ytSearch(term);
    if (search?.videos?.[0]?.videoId) keys.push(search.videos[0].videoId);
  }
  return keys;
}

/** Candidate start times (seconds), avoiding typical title-card regions. */
export function buildCandidateStarts(duration, infoJsonPath) {
  const starts = new Set();
  const minStart = 25;
  const maxStart = duration ? Math.max(minStart, duration - CLIP_SECONDS - 30) : 120;

  if (infoJsonPath && fs.existsSync(infoJsonPath)) {
    const smart = calcSmartStart(infoJsonPath);
    if (smart >= minStart && smart <= maxStart) starts.add(Math.round(smart));
  }

  for (let t = minStart; t <= maxStart; t += 5) {
    starts.add(t);
  }

  return [...starts].sort((a, b) => a - b);
}

export async function downloadRawTrailer(tmdbId, youtubeKey, forceDownload = false) {
  const rawDir = path.join(STAGING_RAW_DIR, String(tmdbId));
  const outBase = `tmdb_${tmdbId}_${youtubeKey}`;
  let { videoPath, infoPath } = findExistingDownload(rawDir, outBase);
  if (forceDownload || !videoPath || !infoPath) {
    const url = `https://www.youtube.com/watch?v=${youtubeKey}`;
    ytDlpDownload(url, rawDir, outBase, forceDownload);
    ({ videoPath, infoPath } = findExistingDownload(rawDir, outBase));
  }
  return { videoPath, infoPath, rawDir, outBase };
}

/**
 * Find a 15s window with no movie title on screen (OCR on 3 frames).
 */
export function findCleanWindow(videoPath, infoPath, movie, workDir) {
  const duration = videoPath && infoPath ? videoDuration(infoPath) : 120;
  const candidates = buildCandidateStarts(duration || 120, infoPath);

  for (const start of candidates) {
    const probeDir = path.join(workDir, `probe_${start}`);
    ensureDir(probeDir);
    const clipPath = path.join(probeDir, 'clip.mp4');
    try {
      ffmpegCut(videoPath, start, clipPath, CLIP_SECONDS);
      const result = auditTrailerVideo(clipPath, movie, RECUT_VERIFY_TIMES, probeDir);
      if (!result.flagged) {
        return { start, clipPath };
      }
    } catch {
      // try next window
    }
  }
  return null;
}

export async function recutMovieTrailer(movie, opts = {}) {
  const { forceDownload = false, workRoot } = opts;
  const movieId = movie.id;
  const tmdbId = movie.tmdb_id;
  const workDir = path.join(workRoot, movieId);
  ensureDir(workDir);

  const keys = await listYoutubeKeysForMovie(movie);
  if (!keys.length) {
    return { status: 'failed', reason: 'no-youtube-url' };
  }

  for (const key of keys) {
    try {
      const { videoPath, infoPath } = await downloadRawTrailer(
        tmdbId,
        key,
        forceDownload
      );
      if (!videoPath) continue;

      const clean = findCleanWindow(videoPath, infoPath, movie, workDir);
      if (!clean) continue;

      const finalPath = path.join(PUBLIC_ASSETS_MOVIES, movieId, 'trailer.mp4');
      backupExisting(finalPath);
      if (clean.clipPath !== finalPath) {
        fs.copyFileSync(clean.clipPath, finalPath);
      } else {
        ffmpegCut(videoPath, clean.start, finalPath, CLIP_SECONDS);
      }

      const verify = auditTrailerVideo(
        finalPath,
        movie,
        RECUT_VERIFY_TIMES,
        path.join(workDir, 'verify')
      );
      if (verify.flagged) {
        return {
          status: 'failed',
          reason: 'still_has_title_after_recut',
          youtubeKey: key,
          start: clean.start,
          match: verify.bestMatch,
        };
      }

      return {
        status: 'ok',
        youtubeKey: key,
        startSeconds: clean.start,
      };
    } catch (e) {
      // try next youtube key
      if (key === keys[keys.length - 1]) {
        return { status: 'failed', reason: e.message?.split('\n')[0] || String(e) };
      }
    }
    await sleep(300);
  }

  return { status: 'failed', reason: 'no_clean_window' };
}
