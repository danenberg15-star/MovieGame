// src/components/AnchorReveal.js
import React from 'react';
import { useTranslation } from 'react-i18next';
import './AnchorReveal.css';

function AnchorReveal({ teamACard, teamBCard, onContinue, language = 'en' }) {
  const { t } = useTranslation();

  // The reveal animation is now driven entirely by CSS (see
  // anchorPosterIn in AnchorReveal.css), so we don't need a JS state
  // toggle anymore. Removing it also closes a small race where the card
  // could remain at opacity:0 if React didn't re-render in time.

  const renderCard = (card, team) => {
    const titleLocal = card?.title?.[language] || card?.title?.en || '';

    return (
      <div className={`anchor-card-section anchor-card-section--${team}`}>
        <div className="anchor-screen">
          <span className="anchor-screen__glow" aria-hidden="true" />
          <span className="anchor-screen__label">
            {team === 'a' ? t('team_a') : t('team_b')}
          </span>
        </div>

        <div className="poster-frame poster-frame--in">
          <span className="poster-frame__bulbs poster-frame__bulbs--top" aria-hidden="true" />
          <span className="poster-frame__bulbs poster-frame__bulbs--bottom" aria-hidden="true" />
          <span className="poster-frame__bulbs poster-frame__bulbs--left" aria-hidden="true" />
          <span className="poster-frame__bulbs poster-frame__bulbs--right" aria-hidden="true" />

          <div className="poster-frame__inner">
            {card?.poster ? (
              <img
                src={card.poster}
                alt={titleLocal}
                className="poster-frame__img"
                loading="eager"
                onError={(e) => {
                  // The placeholder image doesn't ship with the build,
                  // so don't swap it in — the dark themed background of
                  // the inner div is already visible underneath, and
                  // we don't want a broken-image icon to overlay it.
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : null}
            <div className="poster-frame__caption">
              <span className="poster-frame__title">{titleLocal}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

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
