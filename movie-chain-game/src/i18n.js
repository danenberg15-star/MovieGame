// src/i18n.js
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      app_title: "MOVIE CHAIN",
      create_game: "Create New Game",
      join_game: "Join Game",
      qa_mode: "QA Mode (Room 99999)",
      how_to_play: "How to Play",
      welcome: "Welcome to Movie Chain!",
      enter_your_name: "Enter your name",
      room_code: "Room Code",
      copy_code: "Copy Code",
      share_link: "Share Link",
      start_game: "Start Game",
      team_a: "Team A",
      team_b: "Team B",
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
      all_ready: "All players ready!",
      join_room: "Join Room",
      enter_room_code: "Enter Room Code:",
      your_game_ready: "Your Game Room is Ready!",
      connection_types: {
        actor: "Same Actor/Actress",
        director: "Same Director",
        producer: "Same Producer",
        year: "Same Year",
        oscar: "Same Oscar Type"
      },
      success_messages: {
        actor: "Correct! {{name}} played in both movies",
        director: "Correct! Both directed by {{name}}",
        producer: "Correct! Both produced by {{name}}",
        year: "Correct! Both released in {{year}}",
        oscar: "Correct! Both won {{oscar_type}}"
      }
    }
  },
  he: {
    translation: {
      app_title: "שרשרת הסרטים",
      create_game: "צור משחק חדש",
      join_game: "הצטרף למשחק",
      qa_mode: "מצב בדיקה (חדר 99999)",
      how_to_play: "איך משחקים",
      welcome: "ברוכים הבאים לשרשרת הסרטים!",
      enter_your_name: "הזן את שמך",
      room_code: "קוד חדר",
      copy_code: "העתק קוד",
      share_link: "שתף קישור",
      start_game: "התחל משחק",
      team_a: "קבוצה א'",
      team_b: "קבוצה ב'",
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
      all_ready: "כל השחקנים מוכנים!",
      join_room: "הצטרף לחדר",
      enter_room_code: "הזן קוד חדר:",
      your_game_ready: "חדר המשחק שלך מוכן!",
      connection_types: {
        actor: "שחקן/ית זהה/ה",
        director: "במאי זהה",
        producer: "מפיק זהה",
        year: "שנת יציאה זהה",
        oscar: "אוסקר מאותו סוג"
      },
      success_messages: {
        actor: "צדקתם! {{name}} שיחק/ה בשני הסרטים",
        director: "צדקתם! שניהם בוימו על ידי {{name}}",
        producer: "צדקתם! שניהם הופקו על ידי {{name}}",
        year: "צדקתם! שניהם יצאו ב-{{year}}",
        oscar: "צדקתם! שניהם זכו ב-{{oscar_type}}"
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