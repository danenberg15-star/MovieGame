/**
 * Central audio manager for CINEMASTER UI SFX and pre-trailer ambient music.
 * Uses HTMLAudioElement; requires unlock() after first user gesture (mobile autoplay).
 */

const STORAGE_MUTED_KEY = 'cinemaster_sound_muted';

/** @type {Record<string, { path: string, volume: number, type: 'sfx' | 'music' }>} */
export const SOUND_CATALOG = {
  'ui.click': { path: '/assets/audio/sfx/ui-click.mp3', volume: 0.55, type: 'sfx' },
  'ui.back': { path: '/assets/audio/sfx/ui-back.mp3', volume: 0.45, type: 'sfx' },
  'curtain.open': { path: '/assets/audio/sfx/curtain-open.mp3', volume: 0.7, type: 'sfx' },
  'mode.select': { path: '/assets/audio/sfx/mode-select.mp3', volume: 0.5, type: 'sfx' },
  'seat.pick': { path: '/assets/audio/sfx/seat-pick.mp3', volume: 0.55, type: 'sfx' },
  'game.start': { path: '/assets/audio/sfx/game-start.mp3', volume: 0.65, type: 'sfx' },
  'anchor.reveal': { path: '/assets/audio/sfx/anchor-reveal.mp3', volume: 0.6, type: 'sfx' },
  'modal.open': { path: '/assets/audio/sfx/modal-open.mp3', volume: 0.4, type: 'sfx' },
  'result.cheer': { path: '/Cheer.m4a', volume: 0.8, type: 'sfx' },
  'result.boo': { path: '/Boo.m4a', volume: 0.8, type: 'sfx' },
  'music.home': { path: '/assets/audio/music/home-ambient.mp3', volume: 0.22, type: 'music' },
  'music.lobby': { path: '/assets/audio/music/lobby-tension.mp3', volume: 0.28, type: 'music' },
};

const DEFAULT_VOLUMES = {
  master: 1,
  sfx: 1,
  music: 1,
};

let unlocked = false;
let muted = false;
let musicAudio = null;
let currentMusicId = null;
let musicFadeTimer = null;
let loopAudio = null;
let currentLoopId = null;
const sfxCache = new Map();

function readMutedFromStorage() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMutedToStorage(value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_MUTED_KEY, value ? '1' : '0');
  } catch {
    // ignore
  }
}

function effectiveVolume(entry) {
  const cat = entry.type === 'music' ? DEFAULT_VOLUMES.music : DEFAULT_VOLUMES.sfx;
  return DEFAULT_VOLUMES.master * cat * entry.volume;
}

function getSfxAudio(id) {
  const entry = SOUND_CATALOG[id];
  if (!entry || entry.type !== 'sfx') return null;
  if (!sfxCache.has(id)) {
    const audio = new Audio(entry.path);
    audio.preload = 'auto';
    sfxCache.set(id, audio);
  }
  return sfxCache.get(id);
}

function clearMusicFade() {
  if (musicFadeTimer) {
    clearInterval(musicFadeTimer);
    musicFadeTimer = null;
  }
}

export function initSoundManager() {
  muted = readMutedFromStorage();
}

export function isSoundMuted() {
  return muted;
}

export function isSoundUnlocked() {
  return unlocked;
}

/** Call once after first user tap/click so mobile browsers allow playback. */
export function unlockSound() {
  if (unlocked) return;
  unlocked = true;
  Object.keys(SOUND_CATALOG).forEach((id) => {
    const entry = SOUND_CATALOG[id];
    const probe = new Audio(entry.path);
    probe.preload = 'auto';
    probe.volume = 0;
    const p = probe.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        probe.pause();
        probe.currentTime = 0;
      }).catch(() => {});
    }
  });
}

export function setSoundMuted(value) {
  muted = Boolean(value);
  writeMutedToStorage(muted);
  if (muted) {
    stopMusic();
    stopLoopingSfx();
  }
}

export function toggleSoundMuted() {
  setSoundMuted(!muted);
  return muted;
}

/**
 * Play a one-shot SFX. Clones the cached element so rapid taps overlap.
 * @param {string} id — key from SOUND_CATALOG
 * @param {{ volumeScale?: number }} [opts]
 */
export function playSfx(id, opts = {}) {
  if (muted || !unlocked) return;
  const entry = SOUND_CATALOG[id];
  if (!entry || entry.type !== 'sfx') return;

  const template = getSfxAudio(id);
  if (!template) return;

  const audio = template.cloneNode();
  const scale = opts.volumeScale ?? 1;
  audio.volume = Math.min(1, effectiveVolume(entry) * scale);
  const p = audio.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => {});
  }
}

/**
 * Loop a one-shot SFX continuously until stopLoopingSfx() is called.
 * Used for the victory/defeat result screen ambience.
 * @param {string} id — key from SOUND_CATALOG
 */
export function playLoopingSfx(id) {
  if (muted || !unlocked) return;
  const entry = SOUND_CATALOG[id];
  if (!entry) return;
  if (currentLoopId === id && loopAudio && !loopAudio.paused) return;

  stopLoopingSfx();

  loopAudio = new Audio(entry.path);
  loopAudio.loop = true;
  loopAudio.volume = effectiveVolume(entry);
  currentLoopId = id;

  const p = loopAudio.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => {});
  }
}

/** Stop the looping result-screen SFX. */
export function stopLoopingSfx() {
  if (loopAudio) {
    loopAudio.pause();
    loopAudio.currentTime = 0;
    loopAudio = null;
  }
  currentLoopId = null;
}

/**
 * Loop background music; replaces any current music track.
 * @param {string} id — 'music.home' | 'music.lobby'
 */
export function playMusic(id) {
  if (muted || !unlocked) return;
  const entry = SOUND_CATALOG[id];
  if (!entry || entry.type !== 'music') return;
  if (currentMusicId === id && musicAudio && !musicAudio.paused) return;

  clearMusicFade();
  stopMusic(false);

  musicAudio = new Audio(entry.path);
  musicAudio.loop = true;
  musicAudio.volume = effectiveVolume(entry);
  currentMusicId = id;

  const p = musicAudio.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => {});
  }
}

/** Fade out and stop background music over `ms` milliseconds. */
export function fadeOutMusic(ms = 600) {
  if (!musicAudio || muted) {
    stopMusic();
    return;
  }

  clearMusicFade();
  const startVol = musicAudio.volume;
  const steps = Math.max(4, Math.floor(ms / 50));
  const stepMs = ms / steps;
  let step = 0;

  musicFadeTimer = setInterval(() => {
    step += 1;
    if (!musicAudio) {
      clearMusicFade();
      return;
    }
    const t = step / steps;
    musicAudio.volume = Math.max(0, startVol * (1 - t));
    if (step >= steps) {
      clearMusicFade();
      stopMusic();
    }
  }, stepMs);
}

/** @param {boolean} [resetId=true] */
export function stopMusic(resetId = true) {
  clearMusicFade();
  if (musicAudio) {
    musicAudio.pause();
    musicAudio.currentTime = 0;
    musicAudio = null;
  }
  if (resetId) currentMusicId = null;
}

export function stopAllSounds() {
  stopMusic();
  stopLoopingSfx();
  sfxCache.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
}
