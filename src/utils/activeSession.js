// src/utils/activeSession.js
//
// Tracks the player's currently active CINEMASTER game in localStorage
// so we can resume the right screen after a crash, accidental swipe-away,
// incoming phone call, etc.
//
// Stored value shape:
//   {
//     roomCode:  '1234',
//     playerId:  'player_1716...',
//     screen:    'lobby' | 'game',
//     savedAt:   <ms epoch>
//   }

const KEY = 'cinemaster_active_session';
// Sessions older than this are considered stale (12h)
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

const safeStorage = () => {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
};

export function setActiveSession({ roomCode, playerId, screen }) {
  if (!roomCode || !playerId) return;
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(
      KEY,
      JSON.stringify({
        roomCode: String(roomCode),
        playerId: String(playerId),
        screen: screen === 'game' ? 'game' : 'lobby',
        savedAt: Date.now(),
      })
    );
  } catch {
    /* quota / private mode — best effort only */
  }
}

export function getActiveSession() {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.roomCode || !parsed.playerId) {
      return null;
    }
    if (
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > MAX_AGE_MS
    ) {
      storage.removeItem(KEY);
      return null;
    }
    return {
      roomCode: String(parsed.roomCode),
      playerId: String(parsed.playerId),
      screen: parsed.screen === 'game' ? 'game' : 'lobby',
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearActiveSession() {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function buildResumeUrl(session) {
  if (!session) return null;
  const path = session.screen === 'game' ? '/game' : '/lobby';
  return `${path}/${encodeURIComponent(session.roomCode)}?playerId=${encodeURIComponent(
    session.playerId
  )}`;
}
