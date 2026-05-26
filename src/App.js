// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './App.css';
import './i18n';

// Import screens
import HomeScreen from './screens/HomeScreen';
import LobbyScreen from './screens/LobbyScreen';
import GameScreen from './screens/GameScreen';

// Import PWA utilities
import { installPWA, isPWAInstalled } from './utils/pwaInstall';

function App() {
  const { i18n } = useTranslation();
  const [currentLang, setCurrentLang] = useState('en');
  const [showInstallButton, setShowInstallButton] = useState(false);

  // Set document direction based on language
  useEffect(() => {
    document.documentElement.setAttribute('dir', currentLang === 'he' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', currentLang);
  }, [currentLang]);

  // Handle language change
  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setCurrentLang(newLang);
    i18n.changeLanguage(newLang);
    localStorage.setItem('preferredLanguage', newLang);
  };

  // Load saved language preference
  useEffect(() => {
    const savedLang = localStorage.getItem('preferredLanguage');
    if (savedLang) {
      setCurrentLang(savedLang);
      i18n.changeLanguage(savedLang);
    }
  }, [i18n]);

  // Check if PWA can be installed
  useEffect(() => {
    const checkInstallStatus = () => {
      const isInstalled = isPWAInstalled();
      setShowInstallButton(!isInstalled);
      console.log('📱 PWA Installation status:', isInstalled ? 'Installed' : 'Not installed');
    };

    checkInstallStatus();

    // Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = () => {
      setShowInstallButton(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Handle install button click
  const handleInstallClick = async () => {
    const installed = await installPWA();
    if (installed) {
      setShowInstallButton(false);
    }
  };

  return (
    <div className="App">
      {/* PWA Install Button (optional - shows only if installable) */}
      {showInstallButton && (
        <button 
          id="pwa-install-button"
          className="pwa-install-btn"
          onClick={handleInstallClick}
          title={currentLang === 'he' ? 'התקן את האפליקציה' : 'Install App'}
        >
          📱
        </button>
      )}

      {/* Landscape Lock Message */}
      <div className="landscape-lock">
        <div className="rotate-icon">📱</div>
        {currentLang === 'he' ? (
          <>
            <h2>אנא סובבו את המכשיר</h2>
            <p>המשחק מתוכנן למצב לרוחב בלבד</p>
            <p style={{ marginTop: '10px', fontSize: '16px' }}>
              אנא סובבו את המכשיר למצב אופקי
            </p>
          </>
        ) : (
          <>
            <h2>Please rotate your device</h2>
            <p>This game is designed for landscape mode only</p>
            <p style={{ marginTop: '10px', fontSize: '16px' }}>
              Please rotate to landscape mode
            </p>
          </>
        )}
      </div>

      {/* Main Content */}
      <Router>
        <HomeOnlyLanguageSwitcher
          currentLang={currentLang}
          onChange={handleLanguageChange}
        />
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/lobby/:roomCode" element={<LobbyScreen />} />
          <Route path="/game/:roomCode" element={<GameScreen />} />
          <Route path="/room/:roomCode" element={<HomeScreen />} />
        </Routes>
      </Router>
    </div>
  );
}

function HomeOnlyLanguageSwitcher({ currentLang, onChange }) {
  const location = useLocation();
  if (location.pathname !== '/') return null;

  return (
    <div className="language-switcher">
      <select value={currentLang} onChange={onChange}>
        <option value="en">🌐 EN</option>
        <option value="he">🌐 עב</option>
      </select>
    </div>
  );
}

export default App;