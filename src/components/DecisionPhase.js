// src/components/DecisionPhase.js
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './DecisionPhase.css';

const BUY_CONNECTION_COST = 3;

function DecisionPhase({
  wonCard,
  teamCards,
  teamTokens = 0,
  onConnect,
  onSaveToken,
  onBuyConnection,
  language = 'en',
  connectionResult = null,
  disabled = false,
}) {
  const { t } = useTranslation();
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedConnectionType, setSelectedConnectionType] = useState(null);
  const [showCardSelection, setShowCardSelection] = useState(false);

  const connectionTypes = [
    { id: 'actor',    label: t('connection_types.actor'),    icon: '🎭' },
    { id: 'director', label: t('connection_types.director'), icon: '🎬' },
    { id: 'year',     label: t('connection_types.year'),     icon: '📅' },
  ];

  const handleConnectClick = () => {
    if (disabled) return;
    if (!teamCards || teamCards.length === 0) {
      alert(t('no_cards_to_connect') || 'No cards available to connect');
      return;
    }
    setShowCardSelection(true);
  };

  const handleCardSelect = (card) => {
    if (disabled) return;
    setSelectedCard(card);
  };

  const handleConnectionTypeSelect = (type) => {
    if (disabled) return;
    setSelectedConnectionType(type);
  };

  const handleConfirmConnection = () => {
    if (disabled) return;
    if (!selectedCard || !selectedConnectionType) {
      alert(t('select_card_and_type') || 'Please select both a card and connection type');
      return;
    }
    if (onConnect) onConnect(selectedCard, selectedConnectionType);
  };

  const handleSaveToken = () => {
    if (disabled) return;
    if (onSaveToken) onSaveToken();
  };

  const handleBuyConnection = () => {
    if (disabled) return;
    if (teamTokens < BUY_CONNECTION_COST) return;
    if (onBuyConnection) onBuyConnection();
  };

  const canBuyConnection = teamTokens >= BUY_CONNECTION_COST;

  const handleCancel = () => {
    if (disabled) return;
    setShowCardSelection(false);
    setSelectedCard(null);
    setSelectedConnectionType(null);
  };

  // Possible-connections hint shown after a failed attempt is now driven by
  // the Oscar popup, so we no longer render the in-panel feedback box here.

  return (
    <div className="decision-phase">
      {!showCardSelection ? (
        <>
          {/* Compact cinema-style header */}
          <div className="decision-header">
            <h2 className="decision-title">🎯 {t('decision_time')}</h2>
            <p className="decision-subtitle">{t('connect_or_save')}</p>
          </div>

          {/* HUGE won-card poster with brass marquee frame */}
          <div className="dp-card-stage">
            <div className="dp-card-badge">🏆 {t('new_card')}</div>

            <div className="poster-frame poster-frame--won">
              <span className="poster-frame__bulbs poster-frame__bulbs--top" aria-hidden="true" />
              <span className="poster-frame__bulbs poster-frame__bulbs--bottom" aria-hidden="true" />
              <span className="poster-frame__bulbs poster-frame__bulbs--left" aria-hidden="true" />
              <span className="poster-frame__bulbs poster-frame__bulbs--right" aria-hidden="true" />

              <div className="poster-frame__inner">
                <img
                  src={wonCard.poster}
                  alt={wonCard.title?.[language] || ''}
                  className="poster-frame__img"
                  onError={(e) => {
                    e.target.src = '/assets/placeholder-poster.png';
                  }}
                />
                <div className="poster-frame__caption">
                  <span className="poster-frame__title">
                    {wonCard.title?.[language] || wonCard.title?.en || ''}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Compact action ROW (smaller than the poster) */}
          <div className="dp-actions-row">
            <button
              type="button"
              className="dp-btn dp-btn--connect"
              onClick={handleConnectClick}
              disabled={disabled || !teamCards || teamCards.length === 0}
            >
              <span className="dp-btn__icon">🔗</span>
              <span className="dp-btn__text">{t('connect')}</span>
            </button>

            <button
              type="button"
              className="dp-btn dp-btn--buy"
              onClick={handleBuyConnection}
              disabled={disabled || !canBuyConnection}
              title={
                canBuyConnection
                  ? ''
                  : language === 'he'
                    ? `דרושים ${BUY_CONNECTION_COST} אסימונים (יש לך ${teamTokens})`
                    : `Requires ${BUY_CONNECTION_COST} tokens (you have ${teamTokens})`
              }
            >
              <span className="dp-btn__icon">💰</span>
              <span className="dp-btn__text">
                {t('buy_connection')}
                <small className="dp-btn__hint">
                  {language === 'he' ? `${BUY_CONNECTION_COST} אסימונים` : `${BUY_CONNECTION_COST} tokens`}
                </small>
              </span>
            </button>

            <button
              type="button"
              className="dp-btn dp-btn--save"
              onClick={handleSaveToken}
              disabled={disabled}
            >
              <span className="dp-btn__icon">🎫</span>
              <span className="dp-btn__text">
                {t('save_token')}
                <small className="dp-btn__hint">{t('no_card')}</small>
              </span>
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Compact selection header */}
          <div className="decision-header">
            <h3 className="decision-step">1 — {t('step_1_select_card')}</h3>
          </div>

          {/* Large team-card grid */}
          <div className="dp-team-grid">
            {teamCards.map((card) => {
              const isSel = selectedCard?.id === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  className={`poster-frame poster-frame--small ${
                    isSel ? 'poster-frame--selected' : ''
                  }`}
                  onClick={() => handleCardSelect(card)}
                  disabled={disabled}
                >
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
                  {isSel && <span className="poster-frame__check">✓</span>}
                </button>
              );
            })}
          </div>

          {/* Connection-type selector (only after a card is picked) */}
          {selectedCard && (
            <div className="dp-types-row">
              <span className="dp-types-row__label">2 — {t('step_2_select_type')}:</span>
              <div className="dp-types-row__btns">
                {connectionTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    className={`dp-type-btn ${
                      selectedConnectionType === type.id ? 'dp-type-btn--selected' : ''
                    }`}
                    onClick={() => handleConnectionTypeSelect(type.id)}
                    disabled={disabled}
                  >
                    <span className="dp-type-btn__icon">{type.icon}</span>
                    <span className="dp-type-btn__label">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Confirm/Cancel */}
          <div className="dp-confirm-row">
            <button
              type="button"
              className="dp-btn dp-btn--cancel"
              onClick={handleCancel}
              disabled={disabled}
            >
              ← {t('cancel')}
            </button>
            <button
              type="button"
              className="dp-btn dp-btn--confirm"
              onClick={handleConfirmConnection}
              disabled={disabled || !selectedCard || !selectedConnectionType}
            >
              ✓ {t('confirm_connection')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default DecisionPhase;
