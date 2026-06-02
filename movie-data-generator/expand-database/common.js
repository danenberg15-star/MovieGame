// Shared helpers for the database expansion pipeline.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from movie-data-generator/ regardless of CWD.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export const PIPELINE_ROOT = __dirname;
export const STAGING_ROOT = path.join(__dirname, 'staging');
export const STAGING_MOVIES_DIR = path.join(STAGING_ROOT, 'movies');
export const STAGING_RAW_DIR = path.join(STAGING_ROOT, 'raw_youtube');
export const CANDIDATES_FILE = path.join(STAGING_ROOT, 'candidates.json');
export const NEW_MOVIES_FILE = path.join(STAGING_ROOT, 'new-movies.json');
export const REPORT_FILE = path.join(STAGING_ROOT, 'report.json');

export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const EXISTING_MOVIES_JSON = path.join(REPO_ROOT, 'src', 'data', 'movies-clean.json');
export const PUBLIC_MOVIES_JSON = path.join(REPO_ROOT, 'public', 'movies-clean.json');
export const PUBLIC_ASSETS_MOVIES = path.join(REPO_ROOT, 'public', 'assets', 'movies');

export const FFMPEG_PATH =
  process.env.FFMPEG_PATH ||
  'C:\\Users\\USER\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe';

export const TMDB_BASE = 'https://api.themoviedb.org/3';

export const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

export const readJson = (file, fallback) => {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

export const writeJson = (file, data) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Normalize a movie title for dedupe comparison. */
export const normalizeTitle = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0590-\u05ff]+/gi, ' ')
    .trim();

/** Build a Set of "title|year" keys from the existing DB so we can skip dupes. */
export const buildExistingIndex = () => {
  const data = readJson(EXISTING_MOVIES_JSON, { movies: [] });
  const titleYear = new Set();
  const titlesOnly = new Set();
  for (const m of data.movies || []) {
    const titles = [m.title?.en, m.title?.he, m.original_filename].filter(Boolean);
    for (const t of titles) {
      const key = normalizeTitle(t);
      if (!key) continue;
      titlesOnly.add(key);
      if (m.year) {
        for (let yo = -1; yo <= 1; yo++) {
          titleYear.add(`${key}|${m.year + yo}`);
        }
      }
    }
  }
  return { titleYear, titlesOnly, existing: data.movies || [] };
};

export const isLatin = (s) =>
  typeof s === 'string' &&
  /^[\x00-\x7F\s\d:,''.!?()\-–—&\/]+$/.test(s) &&
  /[A-Za-z]/.test(s);

/** Find the next free movie_NNN id, considering existing DB + any extra
 *  sources of already-used IDs (staging folders, prior report entries). */
export const nextMovieIdAllocator = (existingMovies, ...extraIdSources) => {
  let max = 0;
  const consider = (id) => {
    const match = /^movie_(\d+)$/.exec(id || '');
    if (match) max = Math.max(max, parseInt(match[1], 10));
  };
  for (const m of existingMovies || []) consider(m.id);
  for (const src of extraIdSources) {
    if (!src) continue;
    if (Array.isArray(src)) {
      for (const id of src) consider(id);
    } else {
      for (const id of Object.values(src)) consider(id);
    }
  }
  let n = max;
  return () => {
    n += 1;
    return `movie_${String(n).padStart(3, '0')}`;
  };
};

/** Read existing staging movie IDs (folder names matching movie_NNN). */
export const readStagedMovieIds = () => {
  if (!fs.existsSync(STAGING_MOVIES_DIR)) return [];
  return fs
    .readdirSync(STAGING_MOVIES_DIR)
    .filter((name) => /^movie_\d+$/.test(name));
};
