// src/i18n.js
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      app_title: "CINEMASTER",
      create_game: "Create New Game",
      join_game: "Join Game",
      qa_mode: "QA Mode (Room 99999)",
      how_to_play: "How to Play",
      help: "Help",
      choose_mode: "Choose game mode",
      play_vs_bot: "Play vs Computer",
      play_vs_teams: "Play vs Teams",
      vs_bot_hint: "Play against AI — others can join the same lobby",
      vs_teams_hint: "Create a room or join one with a code",
      welcome: "Welcome to CINEMASTER!",
      enter_your_name: "Enter your name",
      room_code: "Room Code",
      copy_code: "Copy Code",
      share_link: "Share Link",
      copied: "Copied!",
      start_game: "Start Game",
      team_a: "Team A",
      team_b: "Team B",
      join_team: "Join Team",
      choose_team: "Choose your team",
      choose_team_first: "Please choose a team first",
      cards: "Cards",
      tokens: "Tokens",
      your_turn: "Your Turn",
      choose_answer: "Choose the correct movie:",
      connect: "Connect",
      save_token: "Save Token",
      correct: "Correct!",
      incorrect: "Incorrect",
      hint: "Hint",
      both_teams_failed: "Both teams failed - card will return!",
      waiting_for_players: "Waiting for players...",
      ready: "Ready",
      not_ready: "Not Ready",
      all_ready: "All players ready!",
      waiting_for_all: "Waiting for all players...",
      waiting_for_host: "Waiting for host to start...",
      join_room: "Join Room",
      enter_room_code: "Enter Room Code:",
      your_game_ready: "Your Game Room is Ready!",
      connection_types: {
        actor: "Same Actor/Actress",
        director: "Same Director",
        year: "Same Year"
      },
      success_messages: {
        actor: "Correct! {{name}} played in both movies",
        director: "Correct! Both directed by {{name}}",
        year: "Correct! Both released in {{year}}"
      }
    }
  },
  he: {
    translation: {
      app_title: "CINEMASTER",
      create_game: "צור משחק חדש",
      join_game: "הצטרף למשחק",
      qa_mode: "מצב בדיקה (חדר 99999)",
      how_to_play: "איך משחקים",
      help: "עזרה",
      choose_mode: "בחרו את סוג המשחק",
      play_vs_bot: "משחק מול המחשב",
      play_vs_teams: "משחק בין קבוצות",
      vs_bot_hint: "משחק מול AI — שחקנים נוספים יכולים להצטרף לאותו לובי",
      vs_teams_hint: "צרו חדר חדש או הצטרפו באמצעות קוד",
      welcome: "ברוכים הבאים ל-CINEMASTER!",
      enter_your_name: "הזן את שמך",
      room_code: "קוד חדר",
      copy_code: "העתק קוד",
      share_link: "שתף קישור",
      copied: "הועתק!",
      start_game: "התחל משחק",
      team_a: "קבוצה א'",
      team_b: "קבוצה ב'",
      join_team: "הצטרף לקבוצה",
      choose_team: "בחר את הקבוצה שלך",
      choose_team_first: "אנא בחר קבוצה תחילה",
      cards: "כרטיסים",
      tokens: "אסימונים",
      your_turn: "התור שלך",
      choose_answer: "בחרו את הסרט הנכון:",
      connect: "שייך",
      save_token: "שמור אסימון",
      correct: "צדקתם!",
      incorrect: "לא נכון",
      hint: "רמז",
      both_teams_failed: "שתי הקבוצות לא זיהו - הכרטיס יחזור!",
      waiting_for_players: "ממתינים לשחקנים...",
      ready: "מוכן",
      not_ready: "לא מוכן",
      all_ready: "כל השחקנים מוכנים!",
      waiting_for_all: "ממתינים לכל השחקנים...",
      waiting_for_host: "ממתינים למארח להתחיל...",
      join_room: "הצטרף לחדר",
      enter_room_code: "הזן קוד חדר:",
      your_game_ready: "חדר המשחק שלך מוכן!",
      connection_types: {
        actor: "שחקן/ית זהה/ה",
        director: "במאי זהה",
        year: "שנת יציאה זהה"
      },
      success_messages: {
        actor: "צדקתם! {{name}} שיחק/ה בשני הסרטים",
        director: "צדקתם! שניהם בוימו על ידי {{name}}",
        year: "צדקתם! שניהם יצאו ב-{{year}}"
      }
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // Default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;