// src/components/DecisionPhase.js
//
// Unified one-screen decision phase.
//
// Layout (always visible):
//   [ Won card BIG ]   [ scroll | of own cards small ]   [ Selected card BIG ]
//                              + bottom buttons row
//
// Flow:
//   1. mode = 'choose-action' — bottom shows CONNECT / BUY / SAVE.
//   2. Press CONNECT          → mode = 'armed'. Big right card glows;
//                                bottom shows hint + Cancel.
//   3. Click big right card   → mode = 'choose-type'. Bottom shows
//                                Director / Year / Actor + Cancel.
//   4. Pick a type            → submit. (Parent shows Oscar popup, then trailer.)

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './DecisionPhase.css';

const BUY_CONNECTION_COST = 3;

function DecisionPhase({
  wonCard,
  teamCards = [],
  teamTokens = 0,
  onConnect,
  onSaveToken,
  onBuyConnection,
  language = 'en',
  disabled = false,
}) {
  const { t } = useTranslation();

  // 'choose-action' | 'armed' | 'choose-type'
  const [mode, setMode] = useState('choose-action');

  // Index in teamCards of the card the player is focusing on (in the scroll).
  // The big right card mirrors this card.
  const [selectedIdx, setSelectedIdx] = useState(0);
  const scrollRef = useRef(null);

  // Reset mode + selection whenever a new round of decision starts
  useEffect(() => {
    setMode('choose-action');
    setSelectedIdx(0);
  }, [wonCard?.id]);

  // Keep selectedIdx in bounds
  useEffect(() => {
    if (selectedIdx >= teamCards.length) {
      setSelectedIdx(Math.max(0, teamCards.length - 1));
    }
  }, [teamCards.length, selectedIdx]);

  const hasChain = teamCards.length > 0;
  const selectedCard = hasChain
    ? teamCards[Math.min(selectedIdx, teamCards.length - 1)]
    : null;

  const canBuyConnection = teamTokens >= BUY_CONNECTION_COST;

  const titleOf = (card) =>
    card?.title?.[language] || card?.title?.en || '';

  const connectionTypes = [
    { id: 'director', label: t('connection_types.director'), icon: '🎬' },
    { id: 'year',     label: t('connection_types.year'),     icon: '📅' },
    { id: 'actor',    label: t('connection_types.actor'),    icon: '🎭' },
  ];

  /* ---- handlers ---- */
  const handleConnect = () => {
    if (disabled || !hasChain) return;
    setMode('armed');
  };

  const handleBigCardClick = () => {
    if (disabled) return;
    if (mode !== 'armed' || !selectedCard) return;
    setMode('choose-type');
  };

  const handleTypePick = (typeId) => {
    if (disabled || !selectedCard) return;
    onConnect && onConnect(selectedCard, typeId);
  };

  const handleCancel = () => setMode('choose-action');

  const handleBuy = () => {
    if (disabled || !canBuyConnection) return;
    onBuyConnection && onBuyConnection();
  };
  const handleSave = () => {
    if (disabled) return;
    onSaveToken && onSaveToken();
  };

  const handleScrollCardClick = (idx) => {
    if (disabled) return;
    setSelectedIdx(idx);
    // Bring the chosen mini-card into view smoothly
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector(
        `[data-scroll-idx="${idx}"]`
      );
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  /* ---- sub-renders ---- */
  const renderPoster = (card, size /* 'big' | 'small' */, opts = {}) => {
    if (!card) return null;
    const cls = [
      'poster-frame',
      size === 'big' ? 'poster-frame--big' : 'poster-frame--small',
      opts.armed && 'poster-frame--armed',
      opts.selected && 'poster-frame--selected',
      opts.clickable && 'poster-frame--clickable',
    ].filter(Boolean).join(' ');

    const body = (
      <>
        {size === 'big' && (
          <>
            <span className="poster-frame__bulbs poster-frame__bulbs--top" aria-hidden="true" />
            <span className="poster-frame__bulbs poster-frame__bulbs--bottom" aria-hidden="true" />
            <span className="poster-frame__bulbs poster-frame__bulbs--left" aria-hidden="true" />
            <span className="poster-frame__bulbs poster-frame__bulbs--right" aria-hidden="true" />
          </>
        )}
        <div className="poster-frame__inner">
          <img
            src={card.poster}
            alt={titleOf(card)}
            className="poster-frame__img"
            onError={(e) => { e.target.src = '/assets/placeholder-poster.png'; }}
          />
          <div className="poster-frame__caption">
            <span className="poster-frame__title">{titleOf(card)}</span>
          </div>
        </div>
        {opts.selected && size === 'small' && (
          <span className="poster-frame__check">✓</span>
        )}
      </>
    );

    if (opts.onClick) {
      return (
        <button
          type="button"
          className={cls}
          onClick={opts.onClick}
          disabled={disabled}
          data-scroll-idx={opts.idx}
        >
          {body}
        </button>
      );
    }

    return <div className={cls} data-scroll-idx={opts.idx}>{body}</div>;
  };

  /* ---- empty / loading state ---- */
  if (!wonCard) {
    return (
      <div className="decision-phase">
        <p className="decision-subtitle">
          {language === 'he' ? 'טוען קלף…' : 'Loading card…'}
        </p>
      </div>
    );
  }

  /* ---- header text per mode ---- */
  let headerNode;
  if (mode === 'choose-type') {
    headerNode = (
      <h3 className="decision-step">
        {language === 'he' ? '🎯 בחרו את סוג החיבור' : '🎯 Pick the connection type'}
      </h3>
    );
  } else if (mode === 'armed') {
    headerNode = (
      <h3 className="decision-step">
        {language === 'he'
          ? '👉 גללו, ולחצו על הקלף הגדול לחיבור'
          : '👉 Scroll, then tap the big card to connect'}
      </h3>
    );
  } else {
    headerNode = (
      <>
        <h2 className="decision-title">🎯 {t('decision_time')}</h2>
        <p className="decision-subtitle">{t('connect_or_save')}</p>
      </>
    );
  }

  const showChain = hasChain;

  return (
    <div className={`decision-phase decision-phase--${mode}`}>
      <div className="decision-header">{headerNode}</div>

      {/* === Three-column content === */}
      <div className={`dp-content${showChain ? '' : ' dp-content--solo'}`}>
        {/* Left: the won (new) card */}
        <div className="dp-pane dp-pane--won">
          <div className="dp-card-badge">🏆 {t('new_card')}</div>
          {renderPoster(wonCard, 'big')}
        </div>

        {showChain && (
          <>
            {/* Middle: vertical scroll of own cards */}
            <div className="dp-pane dp-pane--scroll">
              <p className="dp-pane__label">{t('your_chain') || 'Your chain'}</p>
              <div className="dp-scroll" ref={scrollRef}>
                {teamCards.map((card, idx) =>
                  renderPoster(card, 'small', {
                    idx,
                    selected: idx === selectedIdx,
                    onClick: () => handleScrollCardClick(idx),
                  })
                )}
              </div>
            </div>

            {/* Right: selected card BIG (same size as won) */}
            <div className="dp-pane dp-pane--selected">
              <div className="dp-card-badge dp-card-badge--neutral">
                {mode === 'armed'
                  ? (language === 'he' ? '👉 לחצו לחיבור' : '👉 Tap to connect')
                  : (language === 'he' ? 'מהשרשרת שלך' : 'From your chain')}
              </div>
              {renderPoster(selectedCard, 'big', {
                armed: mode === 'armed',
                clickable: mode === 'armed',
                onClick: mode === 'armed' ? handleBigCardClick : undefined,
              })}
            </div>
          </>
        )}
      </div>

      {/* === Bottom buttons row, swaps by mode === */}
      {mode === 'choose-action' && (
        <div className="dp-actions-row">
          <button
            type="button"
            className="dp-btn dp-btn--connect"
            onClick={handleConnect}
            disabled={disabled || !hasChain}
          >
            <span className="dp-btn__icon">🔗</span>
            <span className="dp-btn__text">{t('connect')}</span>
          </button>

          <button
            type="button"
            className="dp-btn dp-btn--buy"
            onClick={handleBuy}
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
            onClick={handleSave}
            disabled={disabled}
          >
            <span className="dp-btn__icon">🎫</span>
            <span className="dp-btn__text">
              {t('save_token')}
              <small className="dp-btn__hint">{t('no_card')}</small>
            </span>
          </button>
        </div>
      )}

      {mode === 'armed' && (
        <div className="dp-actions-row dp-actions-row--armed">
          <span className="dp-armed-hint">
            {language === 'he'
              ? '👉 בחרו קלף מהגלילה ואז לחצו על הקלף הגדול מימין'
              : '👉 Pick a card from the scroll, then tap the big card on the right'}
          </span>
          <button
            type="button"
            className="dp-btn dp-btn--cancel dp-btn--compact"
            onClick={handleCancel}
            disabled={disabled}
          >
            ← {t('cancel')}
          </button>
        </div>
      )}

      {mode === 'choose-type' && (
        <div className="dp-actions-row dp-actions-row--types">
          {connectionTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              className="dp-btn dp-btn--type"
              onClick={() => handleTypePick(type.id)}
              disabled={disabled}
            >
              <span className="dp-btn__icon">{type.icon}</span>
              <span className="dp-btn__text">{type.label}</span>
            </button>
          ))}
          <button
            type="button"
            className="dp-btn dp-btn--cancel dp-btn--compact"
            onClick={handleCancel}
            disabled={disabled}
          >
            ← {t('cancel')}
          </button>
        </div>
      )}
    </div>
  );
}

export default DecisionPhase;
