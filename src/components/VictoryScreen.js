// src/components/VictoryScreen.js
//
// Cinematic end-of-game victory screen.
//
// - Randomly picks one of 5 winner images from /public (won1..won5.webp)
//   and displays it as large as the viewport allows.
// - Wraps the image in a silver/black cinema frame with a soft "ambilight"
//   glow that bleeds onto the dark background.
// - Floats a golden WINNER ribbon (matching OscarPopup) over the top of
//   the frame with the winning team name.
// - Below the frame: compact team-vs-team score row + a "back home" CTA.
// - Subtle paparazzi camera flashes flicker over the whole screen.

import React, { useMemo } from 'react';
import './VictoryScreen.css';

const TRANSLATIONS = {
  en: {
    winner: 'WINNER',
    team_a: 'Team A',
    team_b: 'Team B',
    cards: 'cards',
    back_home: 'Back to Home',
    vs: 'VS',
  },
  he: {
    winner: 'הזוכים',
    team_a: "קבוצה A",
    team_b: "קבוצה B",
    cards: 'קלפים',
    back_home: 'חזרה לדף הבית',
    vs: 'מול',
  },
};

const TOTAL_IMAGES = 5;

export default function VictoryScreen({
  winner,
  teamACards = 0,
  teamBCards = 0,
  onBackHome,
  language = 'en',
}) {
  const dict = TRANSLATIONS[language] || TRANSLATIONS.en;
  const t = (key) => dict[key] ?? key;

  // Pick a random victory image once per mount so it stays stable across
  // re-renders triggered by Firebase updates while the screen is open.
  const imgSrc = useMemo(() => {
    const n = Math.floor(Math.random() * TOTAL_IMAGES) + 1;
    const base = process.env.PUBLIC_URL || '';
    return `${base}/won${n}.webp`;
  }, []);

  const winnerKey = winner === 'B' ? 'team_b' : 'team_a';
  const winnerLabel = winner === 'draw' ? t('winner') : t(winnerKey);

  return (
    <div className="victory-screen" role="dialog" aria-live="polite">
      {/* Paparazzi camera flashes */}
      <span className="vs-flash vs-flash--a" aria-hidden="true" />
      <span className="vs-flash vs-flash--b" aria-hidden="true" />
      <span className="vs-flash vs-flash--c" aria-hidden="true" />
      <span className="vs-flash vs-flash--d" aria-hidden="true" />

      {/* Gold WINNER ribbon above the frame */}
      <div className="vs-ribbon" aria-hidden="true">
        <span className="vs-ribbon__tail vs-ribbon__tail--left" />
        <span className="vs-ribbon__core">
          <span className="vs-ribbon__label">{t('winner')}</span>
          {winner !== 'draw' && (
            <span className="vs-ribbon__team">{winnerLabel}</span>
          )}
        </span>
        <span className="vs-ribbon__tail vs-ribbon__tail--right" />
      </div>

      {/* Big cinematic image stage */}
      <div className="vs-stage">
        <div className="vs-frame">
          <div className="vs-frame__inner">
            <img
              className="vs-image"
              src={imgSrc}
              alt="Victory celebration"
              draggable="false"
            />
          </div>
          <div className="vs-ambilight" aria-hidden="true" />
        </div>
      </div>

      {/* Compact team vs team score + back home */}
      <div className="vs-footer">
        <div className="vs-score">
          <div className={`vs-score__col${winner === 'A' ? ' vs-score__col--win' : ''}`}>
            <span className="vs-score__label">{t('team_a')}</span>
            <span className="vs-score__value">{teamACards}</span>
            <span className="vs-score__cards">{t('cards')}</span>
          </div>
          <div className="vs-score__sep" aria-hidden="true">{t('vs')}</div>
          <div className={`vs-score__col${winner === 'B' ? ' vs-score__col--win' : ''}`}>
            <span className="vs-score__label">{t('team_b')}</span>
            <span className="vs-score__value">{teamBCards}</span>
            <span className="vs-score__cards">{t('cards')}</span>
          </div>
        </div>

        <button type="button" className="vs-btn" onClick={onBackHome}>
          {t('back_home')}
        </button>
      </div>
    </div>
  );
}
