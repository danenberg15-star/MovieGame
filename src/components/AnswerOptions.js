// src/components/AnswerOptions.js
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './AnswerOptions.css';

function AnswerOptions({ 
  options, 
  correctAnswer, 
  onAnswerSelected, 
  disabled = false,
  eliminatedAnswers = []
}) {
  const { t } = useTranslation();
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const handleAnswerClick = (answer) => {
    if (disabled || selectedAnswer || eliminatedAnswers.includes(answer)) {
      return;
    }

    setSelectedAnswer(answer);
    setShowResult(true);

    const isCorrect = answer === correctAnswer;

    // Wait for animation then notify parent
    setTimeout(() => {
      if (onAnswerSelected) {
        onAnswerSelected(answer, isCorrect);
      }
    }, 1500);
  };

  const getButtonClass = (answer) => {
    const classes = ['answer-btn'];

    // Eliminated answers
    if (eliminatedAnswers.includes(answer)) {
      classes.push('eliminated');
      return classes.join(' ');
    }

    // Selected answer
    if (selectedAnswer === answer) {
      if (showResult) {
        if (answer === correctAnswer) {
          classes.push('correct');
        } else {
          classes.push('incorrect');
        }
      } else {
        classes.push('selected');
      }
    }

    // Disabled state
    if (disabled) {
      classes.push('disabled');
    }

    return classes.join(' ');
  };

  return (
    <div className="answer-options">
      <div className="answer-header">
        <h3 className="answer-title">{t('choose_answer')}</h3>
        <p className="answer-subtitle">
          {eliminatedAnswers.length > 0
            ? t('options_left_count', { count: 10 - eliminatedAnswers.length })
            : t('options_total_count', { count: 10 })
          }
        </p>
      </div>

      <div className="options-grid">
        {options.map((answer, index) => (
          <button
            key={index}
            className={getButtonClass(answer)}
            onClick={() => handleAnswerClick(answer)}
            disabled={disabled || eliminatedAnswers.includes(answer) || selectedAnswer !== null}
          >
            <span className="option-number">{index + 1}</span>
            <span className="option-text">{answer}</span>
            
            {/* Result Icons */}
            {selectedAnswer === answer && showResult && (
              <span className="result-icon">
                {answer === correctAnswer ? '✅' : '❌'}
              </span>
            )}
            
            {/* Eliminated Mark */}
            {eliminatedAnswers.includes(answer) && (
              <span className="eliminated-mark">✖</span>
            )}
          </button>
        ))}
      </div>

      {/* Result Message */}
      {showResult && selectedAnswer && (
        <div className={`result-message ${selectedAnswer === correctAnswer ? 'correct' : 'incorrect'}`}>
          {selectedAnswer === correctAnswer ? (
            <>
              <span className="result-emoji">🎉</span>
              <span>{t('correct')}</span>
            </>
          ) : (
            <>
              <span className="result-emoji">😔</span>
              <span>{t('incorrect')}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default AnswerOptions;