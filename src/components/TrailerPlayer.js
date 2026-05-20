// src/components/TrailerPlayer.js
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

  // Memoize callback to prevent re-renders
  const handleTrailerEndCallback = useCallback(() => {
    if (hasCalledOnTrailerEnd.current) return;
    hasCalledOnTrailerEnd.current = true;
    if (onTrailerEnd) {
      onTrailerEnd();
    }
  }, [onTrailerEnd]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Prevent multiple initializations
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const handlePlay = () => {
      console.log('✅ Video started playing');
      setIsPlaying(true);
      setIsLoading(false);
    };

    const handlePause = () => {
      console.log('⏸️ Video paused');
      setIsPlaying(false);
    };

    const handleError = (e) => {
      console.error('❌ Video error:', e);
      console.error('Video error details:', video.error);
      
      let errorMsg = 'Failed to load trailer';
      if (video.error) {
        switch (video.error.code) {
          case 1:
            errorMsg = 'Video loading aborted';
            break;
          case 2:
            errorMsg = 'Network error';
            break;
          case 3:
            errorMsg = 'Video decode failed';
            break;
          case 4:
            errorMsg = 'Video format not supported';
            break;
          default:
            errorMsg = 'Unknown error';
        }
      }
      
      setErrorDetails(errorMsg);
      setError(true);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      const remaining = Math.ceil(15 - video.currentTime);
      setTimeLeft(Math.max(0, remaining));
      
      // Auto-stop at 15 seconds
      if (video.currentTime >= 15) {
        video.pause();
        handleTrailerEndCallback();
      }
    };

    const handleCanPlay = () => {
      console.log('✅ Video can play - ready to start');
      setIsLoading(false);
      
      // Try to play automatically with muted (required for mobile autoplay)
      if (autoPlay) {
        video.muted = true;
        video.play()
          .then(() => {
            console.log('✅ Playing muted - will unmute after user interaction');
            setTimeout(() => {
              if (video && !video.paused) {
                video.muted = false;
                setIsMuted(false);
                console.log('🔊 Sound enabled');
              }
            }, 500);
          })
          .catch(err => {
            console.error('❌ Auto-play failed:', err);
            setIsLoading(false);
          });
      }
    };

    const handleLoadStart = () => {
      console.log('📥 Video loading started...');
      setIsLoading(true);
    };

    const handleLoadedMetadata = () => {
      console.log('📊 Video metadata loaded');
      console.log('Duration:', video.duration);
      console.log('Video dimensions:', video.videoWidth, 'x', video.videoHeight);
    };

    const handleLoadedData = () => {
      console.log('✅ Video data loaded');
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('loadeddata', handleLoadedData);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [autoPlay, handleTrailerEndCallback]);

  // Reset on movieId change
  useEffect(() => {
    hasCalledOnTrailerEnd.current = false;
    hasInitialized.current = false;
    setTimeLeft(15);
    setIsPlaying(false);
    setError(false);
    setIsLoading(true);
  }, [movieId]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(err => {
        console.error('Play failed:', err);
        setError(true);
        setErrorDetails('Unable to play video');
      });
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
          <p style={{ fontSize: '14px', marginTop: '10px', opacity: 0.8 }}>
            {errorDetails}
          </p>
          <p style={{ fontSize: '12px', marginTop: '5px', opacity: 0.6 }}>
            Movie ID: {movieId}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="trailer-player">
      <div className="video-container">
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
        
        {/* Loading Indicator */}
        {isLoading && (
          <div className="loading-overlay" style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)',
            zIndex: 10
          }}>
            <div className="loading-spinner" style={{
              width: '50px',
              height: '50px',
              border: '4px solid rgba(255,255,255,0.3)',
              borderTop: '4px solid #fff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
          </div>
        )}
        
        {/* Timer Overlay */}
        {!isLoading && (
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
        )}

        {/* Play/Pause Button */}
        {!isLoading && (
          <button className="play-pause-btn" onClick={handlePlayPause}>
            {isPlaying ? '⏸️' : '▶️'}
          </button>
        )}
      </div>

      {/* Controls Info */}
      <div className="trailer-info">
        <span className="info-icon">🎬</span>
        <span className="info-text">
          {isLoading 
            ? (t('loading_trailer') || 'Loading trailer...') 
            : (t('watch_trailer') || 'Watch the 15-second trailer')
          }
        </span>
      </div>
    </div>
  );
}

export default TrailerPlayer;