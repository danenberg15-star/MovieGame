// src/components/TrailerPlayer.js
import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './TrailerPlayer.css';

function TrailerPlayer({ movieId, onTrailerEnd, autoPlay = true }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleError = () => {
      console.error('Error loading video');
      setError(true);
    };

    const handleTimeUpdate = () => {
      const remaining = Math.ceil(15 - video.currentTime);
      setTimeLeft(Math.max(0, remaining));
      
      // Auto-stop at 15 seconds
      if (video.currentTime >= 15) {
        video.pause();
        if (onTrailerEnd) {
          onTrailerEnd();
        }
      }
    };

    const handleCanPlay = () => {
      if (autoPlay) {
        video.play().catch(err => {
          console.error('Auto-play failed:', err);
        });
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('canplay', handleCanPlay);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, [autoPlay, onTrailerEnd]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  if (error) {
    return (
      <div className="trailer-player error">
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <p>{t('trailer_error') || 'Failed to load trailer'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="trailer-player">
      <div className="video-container">
        <video
          ref={videoRef}
          className="trailer-video"
          src={`/assets/movies/${movieId}/trailer.mp4`}
          preload="auto"
          playsInline
        />
        
        {/* Timer Overlay */}
        <div className="timer-overlay">
          <div className="timer-circle">
            <svg className="timer-svg" viewBox="0 0 100 100">
              <circle
                className="timer-bg"
                cx="50"
                cy="50"
                r="45"
              />
              <circle
                className="timer-progress"
                cx="50"
                cy="50"
                r="45"
                style={{
                  strokeDasharray: `${(timeLeft / 15) * 283} 283`
                }}
              />
            </svg>
            <div className="timer-text">{timeLeft}s</div>
          </div>
        </div>

        {/* Play/Pause Button */}
        <button className="play-pause-btn" onClick={handlePlayPause}>
          {isPlaying ? '⏸️' : '▶️'}
        </button>
      </div>

      {/* Controls Info */}
      <div className="trailer-info">
        <span className="info-icon">🎬</span>
        <span className="info-text">
          {t('watch_trailer') || 'Watch the 15-second trailer'}
        </span>
      </div>
    </div>
  );
}

export default TrailerPlayer;