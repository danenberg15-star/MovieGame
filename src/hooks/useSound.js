import { useCallback, useEffect } from 'react';
import { useSoundContext } from '../context/SoundContext';

/**
 * Hook for screen-level sound integration.
 * Registers a one-time unlock listener on first pointer down.
 */
export function useSound() {
  const sound = useSoundContext();

  useEffect(() => {
    if (sound.unlocked) return undefined;

    const onFirstInteract = () => {
      sound.unlock();
    };

    window.addEventListener('pointerdown', onFirstInteract, { once: true });
    window.addEventListener('keydown', onFirstInteract, { once: true });

    return () => {
      window.removeEventListener('pointerdown', onFirstInteract);
      window.removeEventListener('keydown', onFirstInteract);
    };
  }, [sound]);

  const play = useCallback(
    (id, opts) => {
      if (!sound.unlocked) sound.unlock();
      sound.play(id, opts);
    },
    [sound]
  );

  const playMusic = useCallback(
    (id) => {
      if (!sound.unlocked) sound.unlock();
      sound.playMusic(id);
    },
    [sound]
  );

  return {
    muted: sound.muted,
    unlocked: sound.unlocked,
    unlock: sound.unlock,
    setMuted: sound.setMuted,
    toggleMuted: sound.toggleMuted,
    play,
    playMusic,
    fadeOutMusic: sound.fadeOutMusic,
    stopMusic: sound.stopMusic,
    stopAll: sound.stopAll,
  };
}
