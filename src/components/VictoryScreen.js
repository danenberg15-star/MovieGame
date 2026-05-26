// src/components/VictoryScreen.js
//
// Cinematic end-of-game result screen. Used for BOTH:
//   • WIN  — gold/red palette, paparazzi flashes, "WINNER" ribbon,
//            random `won{1..5}.webp` image.
//   • LOSE — muted silver/gunmetal palette, dim flicker, "FLOP"
//            ribbon, random `lose{1..5}.webp` image.
//
// Pass the current player's team via `myTeam`; the component decides
// which variant to render by comparing it to `winner`.

import React, { useMemo } from 'react';
import './VictoryScreen.css';

const TRANSLATIONS = {
  en: {
    winner: 'WINNER',
    flop: 'FLOP',
    team_a: 'Team A',
    team_b: 'Team B',
    cards: 'cards',
    back_home: 'Back to Home',
    vs: 'VS',
    you_lost_to: 'Beaten by',
    draw: 'DRAW',
  },
  he: {
    winner: 'הזוכים',
    flop: 'פלופ',
    team_a: 'קבוצה A',
    team_b: 'קבוצה B',
    cards: 'קלפים',
    back_home: 'חזרה לדף הבית',
    vs: 'מול',
    you_lost_to: 'הפסדתם ל',
    draw: 'תיקו',
  },
};

const TOTAL_IMAGES = 5;

export default function VictoryScreen({
  winner,
  myTeam = null,
  teamACards = 0,
  teamBCards = 0,
  onBackHome,
  language = 'en',
}) {
  const dict = TRANSLATIONS[language] || TRANSLATIONS.en;
  const t = (key) => dict[key] ?? key;

  const isDraw = winner === 'draw' || winner == null;
  const isLoser = !isDraw && myTeam && myTeam !== winner;
  const variant = isLoser ? 'lose' : 'win';

  // Pick a random end-game image once per mount so it stays stable across
  // re-renders triggered by Firebase updates while the screen is open.
  // Folder layout in /public:
  //   won1.webp ... won5.webp     (celebratory images)
  //   lose1.webp ... lose5.webp   (defeat images)
  const imgSrc = useMemo(() => {
    const n = Math.floor(Math.random() * TOTAL_IMAGES) + 1;
    const prefix = isLoser ? 'lose' : 'won';
    const base = process.env.PUBLIC_URL || '';
    return `${base}/${prefix}${n}.webp`;
  }, [isLoser]);

  // Ribbon copy
  const ribbonLabel = isDraw
    ? t('draw')
    : isLoser
    ? t('flop')
    : t('winner');

  const winningTeamLabel = winner === 'B' ? t('team_b') : t('team_a');

  const ribbonSub = isDraw
    ? null
    : isLoser
    ? `${t('you_lost_to')} ${winningTeamLabel}`
    : winningTeamLabel;

  return (
    <div
      className={`victory-screen victory-screen--${variant}`}
      role="dialog"
      aria-live="polite"
    >
      {/* Paparazzi flashes (win) / projector flicker (lose) */}
      <span className="vs-flash vs-flash--a" aria-hidden="true" />
      <span className="vs-flash vs-flash--b" aria-hidden="true" />
      <span className="vs-flash vs-flash--c" aria-hidden="true" />
      <span className="vs-flash vs-flash--d" aria-hidden="true" />

      {/* Ribbon above the frame */}
      <div className="vs-ribbon" aria-hidden="true">
        <span className="vs-ribbon__tail vs-ribbon__tail--left" />
        <span className="vs-ribbon__core">
          <span className="vs-ribbon__label">{ribbonLabel}</span>
          {ribbonSub && <span className="vs-ribbon__team">{ribbonSub}</span>}
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
              alt={isLoser ? 'Defeat' : 'Victory celebration'}
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
