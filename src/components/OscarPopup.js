// src/components/OscarPopup.js
//
// Award-ceremony style feedback popup. Used to celebrate (or roast) the
// player after a guess / connection attempt.
//
// Visuals:
//   • Black backdrop with vignette
//   • Quick paparazzi camera flashes
//   • Spinning, sparkling golden coin/token
//   • Red ribbon banner ("WINNER" / "OSCAR" / "FLOP") with serif gold text
//   • Quip line below the ribbon
//
// Props:
//   open       - boolean
//   variant    - 'success' | 'failure'
//   quip       - string, the witty line to display
//   subText    - optional subtitle (e.g. "+1 Token")
//   onClose    - optional callback fired after auto-dismiss
//   duration   - ms before onClose fires (default 3000)

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './OscarPopup.css';

function OscarPopup({
  open,
  variant = 'success',
  quip,
  subText,
  onClose,
  duration = 3000,
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open || !onClose) return undefined;
    const id = setTimeout(onClose, duration);
    return () => clearTimeout(id);
  }, [open, onClose, duration]);

  if (!open) return null;

  const isSuccess = variant === 'success';
  const ribbonLabel = isSuccess
    ? t('oscar_winner') || 'WINNER'
    : t('oscar_flop') || 'FLOP';

  return (
    <div
      className={`oscar-popup oscar-popup--${variant}`}
      role="dialog"
      aria-live="polite"
    >
      {/* Paparazzi camera flashes */}
      <span className="oscar-flash oscar-flash--a" aria-hidden="true" />
      <span className="oscar-flash oscar-flash--b" aria-hidden="true" />
      <span className="oscar-flash oscar-flash--c" aria-hidden="true" />
      <span className="oscar-flash oscar-flash--d" aria-hidden="true" />

      <div className="oscar-card">
        {/* Golden sparkling coin (or red X for failure) */}
        <div className="oscar-coin">
          {isSuccess ? <CoinSvg /> : <FlopSvg />}
          <span className="oscar-spark oscar-spark--tl" aria-hidden="true" />
          <span className="oscar-spark oscar-spark--tr" aria-hidden="true" />
          <span className="oscar-spark oscar-spark--bl" aria-hidden="true" />
          <span className="oscar-spark oscar-spark--br" aria-hidden="true" />
          <span className="oscar-spark oscar-spark--c" aria-hidden="true" />
        </div>

        {/* Red ribbon banner */}
        <div className="oscar-ribbon" aria-hidden="true">
          <span className="oscar-ribbon__tail oscar-ribbon__tail--left" />
          <span className="oscar-ribbon__core">{ribbonLabel}</span>
          <span className="oscar-ribbon__tail oscar-ribbon__tail--right" />
        </div>

        {/* Quip line */}
        <p className="oscar-quip">{quip}</p>

        {subText && <p className="oscar-sub">{subText}</p>}
      </div>
    </div>
  );
}

/* ----- Inline SVGs ----- */

function CoinSvg() {
  return (
    <svg
      className="oscar-coin__svg"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="coinFace" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fff5c2" />
          <stop offset="35%" stopColor="#ffd766" />
          <stop offset="70%" stopColor="#d4a047" />
          <stop offset="100%" stopColor="#8c6320" />
        </radialGradient>
        <radialGradient id="coinShine" cx="30%" cy="22%" r="45%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.85)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#coinFace)" stroke="#8c6320" strokeWidth="2" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,248,214,0.6)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="0.8" />
      {/* Reel / cinema star */}
      <path
        d="M50 26 L55.5 43.5 L74 43.5 L59.2 54.5 L64.8 72 L50 61 L35.2 72 L40.8 54.5 L26 43.5 L44.5 43.5 Z"
        fill="#3a2208"
        opacity="0.85"
      />
      {/* Highlight */}
      <ellipse cx="38" cy="34" rx="18" ry="9" fill="url(#coinShine)" />
    </svg>
  );
}

function FlopSvg() {
  return (
    <svg
      className="oscar-coin__svg"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="flopFace" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#6c6f76" />
          <stop offset="100%" stopColor="#2a2d33" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#flopFace)" stroke="#1a1c20" strokeWidth="2" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      <path
        d="M34 34 L66 66 M66 34 L34 66"
        stroke="#ff4d4d"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default OscarPopup;
