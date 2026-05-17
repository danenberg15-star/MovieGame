// src/components/AnchorReveal.js
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './AnchorReveal.css';

function AnchorReveal({ teamACard, teamBCard, onContinue, language = 'en' }) {
  const { t } = useTranslation();

  // Auto-continue after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onContinue();
    }, 5000);

    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <div className="anchor-reveal">
      <div className="anchor-container">
        <h1 className="anchor-title">
          {t('starting_cards') || '🎬 Starting Cards'}
        </h1>
        <p className="anchor-subtitle">
          {t('anchor_subtitle') || 'Each team begins with one card'}
        </p>

        <div className="anchor-cards-display">
          {/* Team A Card */}
          <div className="anchor-card-section">
            <div className="team-label team-a-label">
              {t('team_a') || 'Team A'}
            </div>
            <div className="movie-card anchor">
              <img 
                src={teamACard.poster} 
                alt={teamACard.title[language]}
                className="card-poster"
                onError={(e) => {
                  e.target.src = '/assets/placeholder-poster.png';
                }}
              />
              <div className="card-info">
                <h3 className="card-title">{teamACard.title[language]}</h3>
              </div>
            </div>
          </div>

          {/* VS Divider */}
          <div className="vs-divider">
            <span className="vs-text">VS</span>
          </div>

          {/* Team B Card */}
          <div className="anchor-card-section">
            <div className="team-label team-b-label">
              {t('team_b') || 'Team B'}
            </div>
            <div className="movie-card anchor">
              <img 
                src={teamBCard.poster} 
                alt={teamBCard.title[language]}
                className="card-poster"
                onError={(e) => {
                  e.target.src = '/assets/placeholder-poster.png';
                }}
              />
              <div className="card-info">
                <h3 className="card-title">{teamBCard.title[language]}</h3>
              </div>
            </div>
          </div>
        </div>

        <button 
          className="btn btn-continue"
          onClick={onContinue}
        >
          {t('continue') || '▶️ Continue'}
        </button>
      </div>
    </div>
  );
}

export default AnchorReveal;