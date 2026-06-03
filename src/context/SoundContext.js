import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  initSoundManager,
  isSoundMuted,
  isSoundUnlocked,
  unlockSound,
  setSoundMuted,
  toggleSoundMuted,
  playSfx,
  playMusic,
  playLoopingSfx,
  stopLoopingSfx,
  fadeOutMusic,
  stopMusic,
  stopAllSounds,
} from '../utils/soundManager';

const SoundContext = createContext(null);

export function SoundProvider({ children }) {
  const [muted, setMutedState] = useState(() => {
    initSoundManager();
    return isSoundMuted();
  });
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    initSoundManager();
    setMutedState(isSoundMuted());
  }, []);

  const unlock = useCallback(() => {
    unlockSound();
    setUnlocked(true);
  }, []);

  const setMuted = useCallback((value) => {
    setSoundMuted(value);
    setMutedState(isSoundMuted());
  }, []);

  const toggleMuted = useCallback(() => {
    toggleSoundMuted();
    setMutedState(isSoundMuted());
    return isSoundMuted();
  }, []);

  const value = useMemo(
    () => ({
      muted,
      unlocked: unlocked || isSoundUnlocked(),
      unlock,
      setMuted,
      toggleMuted,
      play: playSfx,
      playMusic,
      playLoop: playLoopingSfx,
      stopLoop: stopLoopingSfx,
      fadeOutMusic,
      stopMusic,
      stopAll: stopAllSounds,
    }),
    [muted, unlocked, unlock, setMuted, toggleMuted]
  );

  return (
    <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
  );
}

export function useSoundContext() {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    throw new Error('useSoundContext must be used within SoundProvider');
  }
  return ctx;
}

/** Safe hook when provider might be absent (tests). */
export function useSoundOptional() {
  return useContext(SoundContext);
}
