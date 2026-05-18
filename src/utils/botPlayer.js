// src/utils/botPlayer.js

/**
 * Bot Player Logic for QA Mode (Room 99999)
 * - 80% success rate in identifying movies
 * - 50% success rate in connecting cards
 * - Waits random time (3-8 seconds) before answering to appear human
 */

import { findConnection } from './gameLogic';

class BotPlayer {
  constructor() {
    this.successRateIdentify = 0.8;  // 80% success in identification
    this.successRateConnect = 0.5;   // 50% success in connection
    this.thinkingTimeMin = 3000;     // Minimum 3 seconds
    this.thinkingTimeMax = 8000;     // Maximum 8 seconds
    this.connectionTimeMin = 5000;   // Minimum 5 seconds for connection decision
    this.connectionTimeMax = 15000;  // Maximum 15 seconds for connection decision
  }

  // Sleep function to simulate human delay
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Random delay between min and max
  randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return this.sleep(delay);
  }

  /**
   * Bot chooses an answer from the options
   * @param {string} correctAnswer - The correct movie title
   * @param {Array} options - All 10 answer options
   * @param {Function} callback - Callback function (selectedAnswer, isCorrect)
   */
  async chooseAnswer(correctAnswer, options, callback) {
    console.log('🤖 Bot choosing answer...');
    console.log('🤖 Correct answer:', correctAnswer);
    console.log('🤖 Options:', options);

    // Wait random time (appears human)
    await this.randomDelay(this.thinkingTimeMin, this.thinkingTimeMax);

    // 80% chance to choose correct answer
    let selectedAnswer;
    if (Math.random() < this.successRateIdentify) {
      selectedAnswer = correctAnswer;
      console.log('🤖 Bot chose CORRECT answer:', selectedAnswer);
      callback(selectedAnswer, true);
    } else {
      // Choose wrong answer
      const wrongAnswers = options.filter(option => option !== correctAnswer);
      const randomIndex = Math.floor(Math.random() * wrongAnswers.length);
      selectedAnswer = wrongAnswers[randomIndex];
      console.log('🤖 Bot chose WRONG answer:', selectedAnswer);
      callback(selectedAnswer, false);
    }
  }

  /**
   * Bot makes a decision after winning a card
   * @param {Object} wonCard - The card the bot just won
   * @param {Array} teamCards - Bot's current team cards
   * @param {Function} callback - Callback function (decision)
   */
  async makeDecision(wonCard, teamCards, callback) {
    console.log('🤖 Bot making decision...');
    console.log('🤖 Won card:', wonCard?.title?.en);
    console.log('🤖 Team cards:', teamCards?.length);

    // Wait random time (thinking...)
    await this.randomDelay(this.connectionTimeMin, this.connectionTimeMax);

    // Check if we have cards to connect with
    if (!teamCards || teamCards.length === 0) {
      console.log('🤖 No cards to connect - saving token');
      callback({
        action: 'save_token'
      });
      return;
    }

    // Validate wonCard
    if (!wonCard || !wonCard.id) {
      console.log('🤖 Invalid wonCard - saving token');
      callback({
        action: 'save_token'
      });
      return;
    }

    // 50% chance to attempt connection
    if (Math.random() < this.successRateConnect) {
      // Try to find a real connection
      const connection = this.findBestConnection(wonCard, teamCards);
      
      if (connection) {
        console.log('🤖 Bot found connection:', connection.type);
        callback({
          action: 'connect',
          targetCard: connection.targetCard,
          connectionType: connection.type
        });
        return;
      } else {
        console.log('🤖 No valid connection found - saving token');
      }
    } else {
      console.log('🤖 Bot decided not to connect (50% chance) - saving token');
    }

    // No connection found or decided not to connect
    callback({
      action: 'save_token'
    });
  }

  /**
   * Bot decides whether to connect a card or save token (old method)
   * @param {Object} wonCard - The card the bot just won
   * @param {Array} teamCards - Bot's current team cards
   * @returns {Promise<Object>} - Decision object {action: 'connect'|'save_token', targetCard, connectionType}
   */
  async tryConnect(wonCard, teamCards) {
    console.log('🤖 Bot tryConnect - wonCard:', wonCard);
    console.log('🤖 Bot tryConnect - teamCards:', teamCards);

    // Wait random time (thinking...)
    await this.randomDelay(this.connectionTimeMin, this.connectionTimeMax);

    // Check if we have cards to connect with
    if (!teamCards || teamCards.length === 0) {
      console.log('🤖 No cards to connect - saving token');
      return {
        action: 'save_token'
      };
    }

    // Validate wonCard
    if (!wonCard || !wonCard.id) {
      console.log('🤖 Invalid wonCard - saving token');
      return {
        action: 'save_token'
      };
    }

    // 50% chance to attempt connection
    if (Math.random() < this.successRateConnect) {
      // Try to find a real connection
      const connection = this.findBestConnection(wonCard, teamCards);
      
      if (connection) {
        console.log('🤖 Bot found connection:', connection);
        return {
          action: 'connect',
          targetCard: connection.targetCard,
          connectionType: connection.type
        };
      } else {
        console.log('🤖 No valid connection found - saving token');
      }
    } else {
      console.log('🤖 Bot decided not to connect (50% chance) - saving token');
    }

    // No connection found or decided not to connect
    return {
      action: 'save_token'
    };
  }

  /**
   * Find the best connection between the won card and existing team cards
   * @param {Object} wonCard - The new card
   * @param {Array} teamCards - Existing team cards
   * @returns {Object|null} - Best connection or null
   */
  findBestConnection(wonCard, teamCards) {
    // Validate inputs
    if (!wonCard || !teamCards || teamCards.length === 0) {
      console.log('🤖 Invalid inputs for findBestConnection');
      return null;
    }

    let bestConnection = null;

    for (const teamCard of teamCards) {
      // Skip invalid cards
      if (!teamCard || !teamCard.id) {
        console.log('🤖 Skipping invalid teamCard');
        continue;
      }

      try {
        const connections = findConnection(wonCard, teamCard);
        
        if (connections && connections.length > 0) {
          console.log(`🤖 Found ${connections.length} connections between ${wonCard.title?.en} and ${teamCard.title?.en}`);
          
          // Prefer actor connections, then director, then year
          const priorityOrder = ['actor', 'director', 'year', 'producer', 'oscar'];
          
          for (const priorityType of priorityOrder) {
            const connection = connections.find(c => c.type === priorityType);
            if (connection) {
              return {
                targetCard: teamCard,
                type: connection.type,
                value: connection.value
              };
            }
          }
          
          // If no priority match, use first connection
          if (!bestConnection) {
            bestConnection = {
              targetCard: teamCard,
              type: connections[0].type,
              value: connections[0].value
            };
          }
        }
      } catch (error) {
        console.error('🤖 Error finding connection:', error);
        continue;
      }
    }

    return bestConnection;
  }

  /**
   * Check if this is a bot player
   * @param {string} playerId - Player ID to check
   * @returns {boolean}
   */
  static isBot(playerId) {
    return playerId === 'bot_player';
  }

  /**
   * Get bot display name based on language
   * @param {string} language - 'en' or 'he'
   * @returns {string}
   */
  static getBotName(language = 'en') {
    return language === 'he' ? '🤖 בוט AI' : '🤖 AI Bot';
  }
}

// Singleton instance
const botPlayer = new BotPlayer();

export default botPlayer;

// Export the class as well for potential multiple instances
export { BotPlayer };