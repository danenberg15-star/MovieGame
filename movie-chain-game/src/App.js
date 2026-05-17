// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './App.css';
import './i18n';

// Import screens
import HomeScreen from './screens/HomeScreen';
import LobbyScreen from './screens/LobbyScreen';
import GameScreen from './screens/GameScreen';

function App() {
  const { i18n } = useTranslation();
  const [currentLang, setCurrentLang] = useState('en');

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

  return (
    <div className="App">
      {/* Language Switcher */}
      <div className="language-switcher">
        <select value={currentLang} onChange={handleLanguageChange}>
          <option value="en">🌐 EN</option>
          <option value="he">🌐 עב</option>
        </select>
      </div>

      {/* Landscape Lock Message */}
      <div className="landscape-lock">
        <div className="rotate-icon">📱</div>
        <h2>Please rotate your device</h2>
        <p>This game is designed for landscape mode only</p>
        <p style={{ marginTop: '10px', fontSize: '16px' }}>
          {currentLang === 'he' ? 'אנא סובב את המכשיר למצב אופקי' : 'Please rotate to landscape mode'}
        </p>
      </div>

      {/* Main Content */}
      <Router>
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

export default App;