// src/components/TeamStatus.js
import React from 'react';
import { useTranslation } from 'react-i18next';
import './TeamStatus.css';

function TeamStatus({ teamA, teamB, currentTurn }) {
  const { t } = useTranslation();

  return (
    <div className="team-status-container">
      {/* Team A Status */}
      <div className={`team-status team-a ${currentTurn === 'A' ? 'active-turn' : ''}`}>
        <div className="team-header">
          <span className="team-icon">🎯</span>
          <span className="team-name">{t('team_a')}</span>
          {currentTurn === 'A' && <span className="turn-indicator">▶</span>}
        </div>
        <div className="team-stats">
          <div className="stat-item">
            <span className="stat-icon">🎬</span>
            <span className="stat-label">{t('cards')}:</span>
            <span className="stat-value">{teamA.cards.length}/10</span>
          </div>
          <div className="stat-item">
            <span className="stat-icon">🎫</span>
            <span className="stat-label">{t('tokens')}:</span>
            <span className="stat-value">{teamA.tokens}</span>
          </div>
        </div>
        {/* Progress Bar */}
        <div className="progress-bar">
          <div 
            className="progress-fill team-a-fill"
            style={{ width: `${(teamA.cards.length / 10) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* VS Divider */}
      <div className="vs-divider">VS</div>

      {/* Team B Status */}
      <div className={`team-status team-b ${currentTurn === 'B' ? 'active-turn' : ''}`}>
        <div className="team-header">
          {currentTurn === 'B' && <span className="turn-indicator">◀</span>}
          <span className="team-name">{t('team_b')}</span>
          <span className="team-icon">🎯</span>
        </div>
        <div className="team-stats">
          <div className="stat-item">
            <span className="stat-icon">🎬</span>
            <span className="stat-label">{t('cards')}:</span>
            <span className="stat-value">{teamB.cards.length}/10</span>
          </div>
          <div className="stat-item">
            <span className="stat-icon">🎫</span>
            <span className="stat-label">{t('tokens')}:</span>
            <span className="stat-value">{teamB.tokens}</span>
          </div>
        </div>
        {/* Progress Bar */}
        <div className="progress-bar">
          <div 
            className="progress-fill team-b-fill"
            style={{ width: `${(teamB.cards.length / 10) * 100}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}

export default TeamStatus;