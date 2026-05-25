// src/components/AnchorReveal.js
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './AnchorReveal.css';

function AnchorReveal({ teamACard, teamBCard, onContinue, language = 'en' }) {
  const { t } = useTranslation();

  // Slight stagger so the cards "appear under the spotlights" instead
  // of just popping in flat.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setRevealed(true), 120);
    return () => clearTimeout(t1);
  }, []);

  const renderCard = (card, team) => (
    <div className={`anchor-card-section anchor-card-section--${team}`}>
      <div className="anchor-screen">
        <span className="anchor-screen__glow" aria-hidden="true" />
        <span className="anchor-screen__label">
          {team === 'a' ? t('team_a') : t('team_b')}
        </span>
      </div>

      <div className={`poster-frame ${revealed ? 'poster-frame--in' : ''}`}>
        <span className="poster-frame__bulbs poster-frame__bulbs--top" aria-hidden="true" />
        <span className="poster-frame__bulbs poster-frame__bulbs--bottom" aria-hidden="true" />
        <span className="poster-frame__bulbs poster-frame__bulbs--left" aria-hidden="true" />
        <span className="poster-frame__bulbs poster-frame__bulbs--right" aria-hidden="true" />

        <div className="poster-frame__inner">
          <img
            src={card.poster}
            alt={card.title?.[language] || ''}
            className="poster-frame__img"
            onError={(e) => {
              e.target.src = '/assets/placeholder-poster.png';
            }}
          />
          <div className="poster-frame__caption">
            <span className="poster-frame__title">
              {card.title?.[language] || card.title?.en || ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="anchor-reveal">
      {/* Soft red curtain glows top + bottom (matches the lobby/home) */}
      <div className="anchor-reveal__topglow" aria-hidden="true" />
      <div className="anchor-reveal__bottomglow" aria-hidden="true" />

      <div className="anchor-container">
        {/* Marquee title — same lit-up style as the home screen */}
        <div className="anchor-marquee-wrap">
          <div className="anchor-marquee-frame">
            <span className="anchor-marquee-bulbs anchor-marquee-bulbs--top" aria-hidden="true" />
            <span className="anchor-marquee-bulbs anchor-marquee-bulbs--bottom" aria-hidden="true" />
            <h1 className="anchor-title">{t('starting_cards')}</h1>
          </div>
        </div>
        <p className="anchor-subtitle">{t('anchor_subtitle')}</p>

        <div className="anchor-cards-display">
          {renderCard(teamACard, 'a')}

          <div className="anchor-vs">
            <span className="anchor-vs__text">VS</span>
          </div>

          {renderCard(teamBCard, 'b')}
        </div>

        <button type="button" className="btn-continue" onClick={onContinue}>
          ▶ {t('continue')}
        </button>
      </div>
    </div>
  );
}

export default AnchorReveal;
