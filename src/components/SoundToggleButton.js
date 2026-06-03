import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSound } from '../hooks/useSound';
import './SoundToggleButton.css';

function SoundToggleButton() {
  const { t } = useTranslation();
  const { muted, toggleMuted, unlock, unlocked } = useSound();

  const handleClick = () => {
    if (!unlocked) unlock();
    toggleMuted();
  };

  return (
    <button
      type="button"
      className={`sound-toggle ${muted ? 'sound-toggle--muted' : ''}`}
      onClick={handleClick}
      aria-label={muted ? t('sound_off') : t('sound_on')}
      title={muted ? t('sound_off') : t('sound_on')}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

export default SoundToggleButton;
