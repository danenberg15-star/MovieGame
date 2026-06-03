/**
 * OCR-based detection of on-screen MOVIE TITLE text in trailer clips.
 * Director / actor name cards are whitelisted (not treated as title).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { FFMPEG_PATH, ensureDir } from '../common.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CLIP_SECONDS = 15;
export const AUDIT_FRAME_TIMES = [0, 3, 6, 9, 12, 14];
export const RECUT_VERIFY_TIMES = [2, 7, 12];

const GENERIC_WORDS = new Set([
  'official', 'trailer', 'teaser', 'hd', '4k', 'uhd', 'the', 'a', 'an',
  'movie', 'film', 'cinema', 'coming', 'soon', 'watch', 'now',
]);

let cachedTesseract = null;
let cachedTessPrefix = null;

export function getTesseractExe() {
  if (cachedTesseract) return cachedTesseract;
  const env = process.env.TESSERACT_PATH;
  if (env && fs.existsSync(env)) {
    cachedTesseract = env;
    return cachedTesseract;
  }
  const candidates = [
    'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
    'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      cachedTesseract = c;
      return cachedTesseract;
    }
  }
  try {
    execFileSync('where', ['tesseract'], { stdio: ['ignore', 'pipe', 'pipe'] });
    cachedTesseract = 'tesseract';
  } catch {
    throw new Error(
      'Tesseract not found. Install UB-Mannheim.TesseractOCR or set TESSERACT_PATH'
    );
  }
  return cachedTesseract;
}

/** Project-local tessdata (eng + heb); override with TESSDATA_PREFIX. */
export function getTessdataPrefix() {
  if (cachedTessPrefix) return cachedTessPrefix;
  if (process.env.TESSDATA_PREFIX) {
    cachedTessPrefix = process.env.TESSDATA_PREFIX;
    return cachedTessPrefix;
  }
  const localDir = path.join(__dirname, '..', 'tessdata');
  if (fs.existsSync(path.join(localDir, 'eng.traineddata'))) {
    cachedTessPrefix = localDir + path.sep;
    return cachedTessPrefix;
  }
  cachedTessPrefix = 'C:\\Program Files\\Tesseract-OCR\\tessdata';
  return cachedTessPrefix;
}

export function ensureHebTessdata() {
  const prefix = getTessdataPrefix().replace(/[/\\]$/, '');
  const hebPath = path.join(prefix, 'heb.traineddata');
  if (fs.existsSync(hebPath)) return hebPath;
  throw new Error(
    `heb.traineddata missing in ${prefix}. Run scripts/run-trailer-title-audit.ps1 to download.`
  );
}

export function normalizeText(s) {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0591-\u05C7]/g, '') // Hebrew niqqud
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTitleNoise(title) {
  return (title || '')
    .replace(/\s*[-–—:]\s*.*/g, '') // subtitles after dash/colon
    .replace(/\b(vol\.?|volume|episode|part|chapter)\s*\d+/gi, '')
    .replace(/\b(the|a|an)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleVariants(title) {
  const variants = new Set();
  if (!title) return variants;
  variants.add(normalizeText(title));
  variants.add(normalizeText(stripTitleNoise(title)));
  const noThe = title.replace(/^\s*the\s+/i, '').trim();
  if (noThe) variants.add(normalizeText(noThe));
  return [...variants].filter((v) => v.length >= 3);
}

function significantTitleWords(title) {
  const base = stripTitleNoise(title);
  return normalizeText(base)
    .split(' ')
    .filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w));
}

/** Phrases that indicate the movie title is on screen. */
export function buildForbiddenPhrases(movie) {
  const phrases = new Set();
  const titles = [movie.title?.en, movie.title?.he].filter(Boolean);
  for (const t of titles) {
    for (const v of titleVariants(t)) {
      if (v.length >= 4) phrases.add(v);
    }
  }
  return { phrases: [...phrases], titleWords: significantTitleWords(movie.title?.en || '') };
}

/** Names allowed on screen (director, cast) — not flagged alone. */
export function buildWhitelist(movie) {
  const names = new Set();
  const addName = (n) => {
    const norm = normalizeText(n);
    if (norm.length >= 3) names.add(norm);
    // Last name only (common on title cards)
    const parts = norm.split(' ').filter((p) => p.length >= 3);
    if (parts.length) names.add(parts[parts.length - 1]);
  };
  if (movie.director?.name?.en) addName(movie.director.name.en);
  if (movie.director?.name?.he) addName(movie.director.name.he);
  for (const c of (movie.cast || []).slice(0, 3)) {
    if (c?.name?.en) addName(c.name.en);
    if (c?.name?.he) addName(c.name.he);
  }
  return names;
}

/**
 * @returns {{ flagged: boolean, matchedText?: string, matchedWords?: string[] }}
 */
export function detectTitleInText(ocrText, movie) {
  const normOcr = normalizeText(ocrText);
  if (!normOcr || normOcr.length < 2) {
    return { flagged: false };
  }

  const { phrases, titleWords } = buildForbiddenPhrases(movie);

  for (const phrase of phrases) {
    if (phrase.length >= 5 && normOcr.includes(phrase)) {
      return { flagged: true, matchedText: phrase, reason: 'full_title' };
    }
  }

  const matchedWords = titleWords.filter((w) => {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return re.test(normOcr) || normOcr.includes(w);
  });

  if (matchedWords.length >= 2) {
    return {
      flagged: true,
      matchedText: matchedWords.join(', '),
      matchedWords,
      reason: 'title_words',
    };
  }

  // Single distinctive word (e.g. "Equalizer", Hebrew title word)
  const heWords = significantTitleWords(movie.title?.he || '');
  const allDistinct = [...new Set([...titleWords, ...heWords])];
  for (const w of allDistinct) {
    if (w.length >= 5 && normOcr.includes(w)) {
      return { flagged: true, matchedText: w, reason: 'distinctive_word' };
    }
  }

  return { flagged: false };
}

export function ocrImage(imagePath) {
  const tess = getTesseractExe();
  const prefix = getTessdataPrefix();
  ensureHebTessdata();
  const outBase = imagePath.replace(/\.[^.]+$/, '_ocr');
  const args = [
    imagePath,
    outBase,
    '-l',
    'eng+heb',
    '--psm',
    '6',
    '--oem',
    '1',
  ];
  const env = { ...process.env, TESSDATA_PREFIX: prefix };
  execFileSync(tess, args, {
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
    timeout: 60000,
  });
  const txtPath = `${outBase}.txt`;
  if (!fs.existsSync(txtPath)) return '';
  return fs.readFileSync(txtPath, 'utf8');
}

export function extractFrame(videoPath, outPng, timeSec) {
  const t = Math.max(0, timeSec).toFixed(2);
  execFileSync(
    FFMPEG_PATH,
    [
      '-y',
      '-ss',
      t,
      '-i',
      videoPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      outPng,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 }
  );
}

/**
 * OCR trailer at given timestamps.
 * @returns {{ frames: Array<{ time: number, text: string, detection: object }>, flagged: boolean, bestMatch?: object }}
 */
export function auditTrailerVideo(videoPath, movie, frameTimes = AUDIT_FRAME_TIMES, workDir) {
  ensureDir(workDir);
  const frames = [];
  let flagged = false;
  let bestMatch = null;

  for (let i = 0; i < frameTimes.length; i++) {
    const time = frameTimes[i];
    const png = path.join(workDir, `frame_${String(i).padStart(2, '0')}.png`);
    extractFrame(videoPath, png, time);
    const text = ocrImage(png);
    const detection = detectTitleInText(text, movie);
    frames.push({ time, text: text.slice(0, 500), detection });
    if (detection.flagged) {
      flagged = true;
      if (!bestMatch || (detection.matchedText?.length || 0) > (bestMatch.matchedText?.length || 0)) {
        bestMatch = { ...detection, frameTime: time, frameIndex: i };
      }
    }
  }

  return { frames, flagged, bestMatch };
}
