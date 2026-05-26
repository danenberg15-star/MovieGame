// src/components/TrailerPlayer.js
//
// Cinema-styled trailer player.
//
// Visual elements:
//   • Velvet red curtains drawn aside on the left and right.
//   • Silver/black metallic frame around the video.
//   • Subtle audience silhouette below the screen.
//   • Soft ambilight pulsing around the frame (simulated projector wash).
//   • Old-film countdown timer (radar sweep + crosshair).
//   • Convex steel play / pause button.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './TrailerPlayer.css';

function TrailerPlayer({ movieId, onTrailerEnd, autoPlay = true }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [errorDetails, setErrorDetails] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const hasCalledOnTrailerEnd = useRef(false);
  const hasInitialized = useRef(false);
  const safetyTimeoutRef = useRef(null);

  const handleTrailerEndCallback = useCallback(() => {
    if (hasCalledOnTrailerEnd.current) return;
    hasCalledOnTrailerEnd.current = true;
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    if (onTrailerEnd) onTrailerEnd();
  }, [onTrailerEnd]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const handlePlay = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      handleTrailerEndCallback();
    };
    const handleError = () => {
      let msg = 'Failed to load trailer';
      if (video.error) {
        switch (video.error.code) {
          case 1: msg = 'Video loading aborted'; break;
          case 2: msg = 'Network error'; break;
          case 3: msg = 'Video decode failed'; break;
          case 4: msg = 'Video format not supported'; break;
          default: msg = 'Unknown error';
        }
      }
      setErrorDetails(msg);
      setError(true);
      setIsLoading(false);
    };
    const handleTimeUpdate = () => {
      const remaining = Math.ceil(video.duration - video.currentTime);
      setTimeLeft(Math.max(0, remaining));
    };
    const handleCanPlay = () => {
      setIsLoading(false);
      if (autoPlay) {
        video.muted = true;
        video.play()
          .then(() => {
            setTimeout(() => {
              if (video && !video.paused) {
                video.muted = false;
                setIsMuted(false);
              }
            }, 500);
          })
          .catch(() => setIsLoading(false));
      }
    };
    const handleLoadStart = () => setIsLoading(true);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadstart', handleLoadStart);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadstart', handleLoadStart);
    };
  }, [autoPlay, handleTrailerEndCallback]);

  useEffect(() => {
    hasCalledOnTrailerEnd.current = false;
    hasInitialized.current = false;
    setTimeLeft(15);
    setIsPlaying(false);
    setError(false);
    setIsLoading(true);

    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
    safetyTimeoutRef.current = setTimeout(() => {
      if (!hasCalledOnTrailerEnd.current) handleTrailerEndCallback();
    }, 17000);

    return () => {
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
    };
  }, [movieId, handleTrailerEndCallback]);

  useEffect(() => {
    if (hasCalledOnTrailerEnd.current && safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  });

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {
        setError(true);
        setErrorDetails('Unable to play video');
      });
    } else {
      video.pause();
    }
  };

  if (error) {
    return (
      <div className="trailer-player trailer-player--error">
        <div className="trailer-error">
          <span className="trailer-error__icon">⚠️</span>
          <p>{t('trailer_error') || 'Failed to load trailer'}</p>
          <p className="trailer-error__detail">{errorDetails}</p>
          <p className="trailer-error__detail">Movie ID: {movieId}</p>
          <button
            type="button"
            className="trailer-error__btn"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  // Compute timer angle for the sweep arm. The sweep itself continuously
  // rotates via CSS animation; we tint the inner ring to show progress.
  const fraction = Math.max(0, Math.min(1, timeLeft / 15));

  return (
    <div className="trailer-player">
      {/* Ambient projector glow behind everything */}
      <div className="cinema-stage__ambilight" aria-hidden="true" />
      <div className="cinema-stage__ambilight cinema-stage__ambilight--cool" aria-hidden="true" />

      {/* Velvet curtains tied off to the sides */}
      <Curtain side="left" />
      <Curtain side="right" />

      {/* The silver/black metallic frame around the screen */}
      <div className="cinema-frame">
        <span className="cinema-frame__bolt cinema-frame__bolt--tl" aria-hidden="true" />
        <span className="cinema-frame__bolt cinema-frame__bolt--tr" aria-hidden="true" />
        <span className="cinema-frame__bolt cinema-frame__bolt--bl" aria-hidden="true" />
        <span className="cinema-frame__bolt cinema-frame__bolt--br" aria-hidden="true" />

        <div className="cinema-frame__inner">
          <video
            key={movieId}
            ref={videoRef}
            className="trailer-video"
            src={`/assets/movies/${movieId}/trailer.mp4`}
            preload="auto"
            playsInline
            muted={isMuted}
            controls={false}
            webkit-playsinline="true"
          />

          {isLoading && (
            <div className="trailer-loading">
              <div className="trailer-loading__spinner" />
            </div>
          )}

          {!isLoading && <FilmCountdown seconds={timeLeft} fraction={fraction} />}

          {!isLoading && (
            <button
              type="button"
              className={`steel-btn ${isPlaying ? 'steel-btn--pause' : 'steel-btn--play'}`}
              onClick={handlePlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              <SteelBtnIcon isPlaying={isPlaying} />
            </button>
          )}
        </div>
      </div>

      {/* Audience silhouettes — front row */}
      <AudienceFloor />

      {/* Only show the info strip while the trailer is loading;
          once it's ready we don't need a "Watch the trailer" label. */}
      {isLoading && (
        <div className="trailer-info">
          <span className="trailer-info__icon">🎞️</span>
          <span className="trailer-info__text">
            {t('loading_trailer') || 'Loading trailer…'}
          </span>
        </div>
      )}
    </div>
  );
}

/* ===== Sub-components ===== */

function Curtain({ side }) {
  return (
    <div
      className={`velvet-curtain velvet-curtain--${side}`}
      aria-hidden="true"
    >
      {/* Tassel along the inner edge */}
      <div className="velvet-curtain__tassel" />
      {/* Subtle bottom hem highlight */}
      <div className="velvet-curtain__hem" />
    </div>
  );
}

function FilmCountdown({ seconds, fraction }) {
  // Inner ring uses stroke-dasharray to deplete as time runs out.
  const circumference = 2 * Math.PI * 28; // r=28
  const offset = circumference * (1 - fraction);

  return (
    <div className="film-countdown" role="timer" aria-label={`${seconds} seconds`}>
      <svg className="film-countdown__svg" viewBox="0 0 100 100">
        {/* Dark grungy background disc */}
        <defs>
          <radialGradient id="filmDisc" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#3a3530" />
            <stop offset="55%" stopColor="#1d1a17" />
            <stop offset="100%" stopColor="#0a0807" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#filmDisc)" stroke="#5a5450" strokeWidth="1.2" />

        {/* Crosshair lines */}
        <line x1="50" y1="2"  x2="50" y2="98" stroke="rgba(220,210,180,0.55)" strokeWidth="1" />
        <line x1="2"  y1="50" x2="98" y2="50" stroke="rgba(220,210,180,0.55)" strokeWidth="1" />
        <line x1="14" y1="14" x2="86" y2="86" stroke="rgba(140,130,110,0.4)"  strokeWidth="0.8" />
        <line x1="86" y1="14" x2="14" y2="86" stroke="rgba(140,130,110,0.4)"  strokeWidth="0.8" />

        {/* Concentric rings */}
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(180,170,150,0.3)" strokeWidth="0.6" />
        <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(180,170,150,0.3)" strokeWidth="0.6" />
        <circle cx="50" cy="50" r="20" fill="none" stroke="rgba(180,170,150,0.4)" strokeWidth="0.6" />

        {/* Progress ring (depletes as time runs out) */}
        <circle
          cx="50"
          cy="50"
          r="28"
          fill="none"
          stroke="#d4a047"
          strokeWidth="3"
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.35s linear' }}
        />

        {/* Rotating sweep arm (radar) */}
        <g className="film-countdown__sweep">
          <line x1="50" y1="50" x2="50" y2="6"
                stroke="rgba(255,210,140,0.9)" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="50" cy="50" r="3" fill="#ffd87a" />
        </g>

        {/* Scratchy film grain dots */}
        <g fill="rgba(255,240,210,0.18)">
          <circle cx="22" cy="32" r="0.6" />
          <circle cx="74" cy="40" r="0.5" />
          <circle cx="68" cy="72" r="0.6" />
          <circle cx="30" cy="68" r="0.5" />
          <circle cx="46" cy="80" r="0.5" />
        </g>
      </svg>
      <div className="film-countdown__text">{seconds}</div>
    </div>
  );
}

function SteelBtnIcon({ isPlaying }) {
  if (isPlaying) {
    return (
      <svg className="steel-btn__icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6"  y="4" width="4.5" height="16" rx="1" fill="#1a1a1a" />
        <rect x="13.5" y="4" width="4.5" height="16" rx="1" fill="#1a1a1a" />
      </svg>
    );
  }
  return (
    <svg className="steel-btn__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4 L7 20 L20 12 Z" fill="#1a1a1a" />
    </svg>
  );
}

function AudienceFloor() {
  // A subtle row of dark, slightly-blurred heads at the bottom of the
  // stage. SVG keeps things crisp and infinitely scalable.
  return (
    <div className="audience-floor" aria-hidden="true">
      <svg viewBox="0 0 1000 80" preserveAspectRatio="xMidYMax slice">
        <defs>
          <radialGradient id="headShade" cx="50%" cy="30%" r="60%">
            <stop offset="0%" stopColor="#1a1a1a" />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>
        </defs>
        {/* Heads arranged in slight stagger */}
        {[
          { cx: 40,  rx: 34, ry: 36 },
          { cx: 130, rx: 30, ry: 32 },
          { cx: 215, rx: 38, ry: 40 },
          { cx: 320, rx: 32, ry: 34 },
          { cx: 420, rx: 36, ry: 38 },
          { cx: 510, rx: 30, ry: 32 },
          { cx: 600, rx: 38, ry: 40 },
          { cx: 700, rx: 32, ry: 34 },
          { cx: 800, rx: 36, ry: 38 },
          { cx: 890, rx: 32, ry: 34 },
          { cx: 970, rx: 34, ry: 36 },
        ].map((h, i) => (
          <ellipse
            key={i}
            cx={h.cx}
            cy={80}
            rx={h.rx}
            ry={h.ry}
            fill="url(#headShade)"
          />
        ))}
      </svg>
    </div>
  );
}

export default TrailerPlayer;
