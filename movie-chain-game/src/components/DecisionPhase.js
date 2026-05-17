// src/components/DecisionPhase.js
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './DecisionPhase.css';

function DecisionPhase({ 
  wonCard, 
  teamCards, 
  onConnect, 
  onSaveToken,
  language = 'en'
}) {
  const { t } = useTranslation();
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedConnectionType, setSelectedConnectionType] = useState(null);
  const [showCardSelection, setShowCardSelection] = useState(false);

  const connectionTypes = [
    { id: 'actor', label: t('connection_types.actor'), icon: '🎭' },
    { id: 'director', label: t('connection_types.director'), icon: '🎬' },
    { id: 'producer', label: t('connection_types.producer'), icon: '🎥' },
    { id: 'year', label: t('connection_types.year'), icon: '📅' },
    { id: 'oscar', label: t('connection_types.oscar'), icon: '🏆' }
  ];

  const handleConnectClick = () => {
    if (teamCards.length === 0) {
      alert(t('no_cards_to_connect') || 'No cards available to connect');
      return;
    }
    setShowCardSelection(true);
  };

  const handleCardSelect = (card) => {
    setSelectedCard(card);
  };

  const handleConnectionTypeSelect = (type) => {
    setSelectedConnectionType(type);
  };

  const handleConfirmConnection = () => {
    if (!selectedCard || !selectedConnectionType) {
      alert(t('select_card_and_type') || 'Please select both a card and connection type');
      return;
    }

    if (onConnect) {
      onConnect(selectedCard, selectedConnectionType);
    }
  };

  const handleSaveToken = () => {
    if (onSaveToken) {
      onSaveToken();
    }
  };

  const handleCancel = () => {
    setShowCardSelection(false);
    setSelectedCard(null);
    setSelectedConnectionType(null);
  };

  return (
    <div className="decision-phase">
      <div className="decision-header">
        <h2 className="decision-title">
          {t('decision_time') || '🎯 Decision Time!'}
        </h2>
        <p className="decision-subtitle">
          {t('connect_or_save') || 'Connect this card or save a token?'}
        </p>
      </div>

      {/* Won Card Display */}
      <div className="won-card-display">
        <div className="card-badge">{t('new_card') || '🆕 New Card'}</div>
        <div className="movie-card won">
          <img 
            src={wonCard.poster} 
            alt={wonCard.title[language]}
            className="card-poster"
            onError={(e) => {
              e.target.src = '/assets/placeholder-poster.png';
            }}
          />
          <div className="card-info">
            <h3 className="card-title">{wonCard.title[language]}</h3>
          </div>
        </div>
      </div>

      {!showCardSelection ? (
        /* Main Decision Buttons */
        <div className="decision-actions">
          <button 
            className="btn btn-connect"
            onClick={handleConnectClick}
            disabled={teamCards.length === 0}
          >
            <span className="btn-icon">🔗</span>
            <span className="btn-text">{t('connect')}</span>
          </button>

          <button 
            className="btn btn-save-token"
            onClick={handleSaveToken}
          >
            <span className="btn-icon">🎫</span>
            <span className="btn-text">{t('save_token')}</span>
          </button>
        </div>
      ) : (
        /* Connection Selection UI */
        <div className="connection-selection">
          {/* Step 1: Select Target Card */}
          <div className="selection-step">
            <h3 className="step-title">
              {t('step_1_select_card') || '1️⃣ Select a card to connect with:'}
            </h3>
            <div className="team-cards-grid">
              {teamCards.map((card) => (
                <div
                  key={card.id}
                  className={`movie-card selectable ${selectedCard?.id === card.id ? 'selected' : ''}`}
                  onClick={() => handleCardSelect(card)}
                >
                  <img 
                    src={card.poster} 
                    alt={card.title[language]}
                    className="card-poster"
                    onError={(e) => {
                      e.target.src = '/assets/placeholder-poster.png';
                    }}
                  />
                  <div className="card-info">
                    <h4 className="card-title">{card.title[language]}</h4>
                  </div>
                  {selectedCard?.id === card.id && (
                    <div className="selected-badge">✓</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step 2: Select Connection Type */}
          {selectedCard && (
            <div className="selection-step">
              <h3 className="step-title">
                {t('step_2_select_type') || '2️⃣ Select connection type:'}
              </h3>
              <div className="connection-types-grid">
                {connectionTypes.map((type) => (
                  <button
                    key={type.id}
                    className={`connection-type-btn ${selectedConnectionType === type.id ? 'selected' : ''}`}
                    onClick={() => handleConnectionTypeSelect(type.id)}
                  >
                    <span className="type-icon">{type.icon}</span>
                    <span className="type-label">{type.label}</span>
                    {selectedConnectionType === type.id && (
                      <span className="selected-check">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Confirm Buttons */}
          <div className="confirm-actions">
            <button 
              className="btn btn-cancel"
              onClick={handleCancel}
            >
              {t('cancel') || '← Back'}
            </button>
            <button 
              className="btn btn-confirm"
              onClick={handleConfirmConnection}
              disabled={!selectedCard || !selectedConnectionType}
            >
              {t('confirm_connection') || '✓ Confirm Connection'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DecisionPhase;