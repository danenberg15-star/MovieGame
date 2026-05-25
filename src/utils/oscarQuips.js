// src/utils/oscarQuips.js
//
// Pool of witty "Oscar-ceremony" style headlines used by the OscarPopup
// component. The popup picks one randomly each time so the feedback
// feels fresh.
//
// `value` is the actor / director / year of the connection (if any).
// We replace {{value}} in the line at render-time.

const SUCCESS_HE = [
  'זכית באוסקר! הבמאי {{value}} ביים את שני הסרטים.',
  'הקדם אקדמי כבר מכין את הנאום שלך! {{value}} ידע משהו.',
  'הזיהוי הזה שווה כפיים — {{value}} כיכב/ה בשני הסרטים.',
  'הוליווד מתעוררת — שני הסרטים יצאו ב-{{value}}.',
  'הביוגרפיה שלך נכתבת בלאס וגאס: {{value}} מאחד את הסרטים.',
  'גילית את החוט: {{value}} — המבקרים ימחאו כף.',
  'אסכולת קולנוע נולדה כאן — {{value}} הוא המקשר.',
  'מסכת אוסקר זהוב בדרך אליך! מצאת את {{value}}.',
  'הצפייה הזו השתלמה: {{value}} חיבר/ה את הסרטים.',
  'אריק איינשטיין היה מנידד בראש מאישור — {{value}} זה הצדק.',
  'נטפליקס כבר מציעה לך תפקיד — חשפת את {{value}}.',
  'הקרדיט הראשי שלך הוא {{value}} — הקרן צ\'יקאגו רוטטת.',
  'אקדמיית הקולנוע מודיעה: אזרח כבוד {{value}}.',
  'אפילו טרנטינו היה משתחווה — {{value}} כאן.',
  'הצליל המוכר נשמע: {{value}} — והכרטיס שלך.',
  'אתה מבקר קולנוע מולד — זיהית את {{value}}.',
  'מצוטט בעיתון "וראייטי": "מצא את {{value}}".',
  'התקרבת אל ההיכל — {{value}} מאחד את הסרטים.',
  'הסטודיו פיצח שאמפניה — תודה ל-{{value}}.',
  'גנבת את ההצגה: {{value}} — וקלף שלך.',
];

const FAILURE_HE = [
  'אין לך שום ידע קולנועי, הקשר בין הסרטים שבחרת הוא {{value}}.',
  'הניצחון לא היה בכיוון שלך — היה אפשר דרך {{value}}.',
  'המבקרים מאוכזבים. הקשר שפספסת: {{value}}.',
  'אקדמיית הקולנוע מצרה — הקישור היה {{value}}.',
  'גזרי המוניטור עפים — לא ראית את {{value}}.',
  'הוליווד גירסה לכשלון. הקשר היה דרך {{value}}.',
  'גם בריאן דה פאלמה היה בוכה — פספסת את {{value}}.',
  'יוצרי הסרטון מנידדים בראש: הקשר היה {{value}}.',
  'נטפליקס מבטלת לך מנוי — היה דרך {{value}}.',
  'הסטודיו דורש החזר — הקשר היה {{value}}.',
  'הפפראצי הולך הביתה — פספסת את {{value}}.',
  'ביקורת קשה: {{value}} — שם היה הקשר.',
  'הקלף לא יהיה שלך הפעם, היה אפשר דרך {{value}}.',
  'גם וודי אלן היה מצמרר — פספסת את {{value}}.',
  'תזכור: {{value}} — שם נמצא הקשר.',
  'הפרס הולך לאחר. הקשר היה {{value}}.',
  'התסריט שלך נדחה — הקשר היה דרך {{value}}.',
  'דקפריו עוד מחפש פסל — אבל גם הוא ידע על {{value}}.',
  'הוא היה גאון: {{value}} — אבל לא הפעם.',
  'בילט בלאם של פרסים — פספסת את {{value}}.',
];

const SUCCESS_EN = [
  'You won an Oscar! Director {{value}} made both films.',
  'The Academy is drafting your speech — {{value}} was the link.',
  'A standing ovation: {{value}} starred in both movies.',
  'Hollywood is wide awake — both films released in {{value}}.',
  'Your biography starts in Vegas: {{value}} connects them.',
  'You spotted the thread: {{value}} — the critics are clapping.',
  'A cinema school is born here — {{value}} is the link.',
  'A golden Oscar is on its way — you found {{value}}.',
  'That viewing paid off: {{value}} ties them together.',
  'The director would nod approvingly — {{value}} it is.',
  'Netflix is already offering you a part — you uncovered {{value}}.',
  'Your top credit reads "{{value}}" — the spotlight beams down.',
  'The Academy declares: honorary citizen of {{value}}.',
  'Even Tarantino would bow — {{value}} is the answer.',
  'That familiar chord plays: {{value}} — card is yours.',
  'You\'re a born film critic — you spotted {{value}}.',
  'Variety quotes you: "It was {{value}} all along".',
  'You\'re one step closer to the Hall — {{value}} unites them.',
  'The studio pops champagne — thanks to {{value}}.',
  'You stole the show: {{value}} — and the card is yours.',
];

const FAILURE_EN = [
  'You have zero cinema sense — the link was {{value}}.',
  'Victory was not in your direction — it ran through {{value}}.',
  'The critics are disappointed. The link you missed: {{value}}.',
  'The Academy sighs — the connection was {{value}}.',
  'Editing monitors flicker — you missed {{value}}.',
  'Hollywood\'s version of a flop. The connection: {{value}}.',
  'Even De Palma would cry — you missed {{value}}.',
  'The filmmakers shake their heads: the link was {{value}}.',
  'Netflix cancels your subscription — it was {{value}}.',
  'The studio demands a refund — the link was {{value}}.',
  'The paparazzi pack up — you missed {{value}}.',
  'Harsh review: {{value}} — that was the connection.',
  'No card for you this round — the link was {{value}}.',
  'Even Woody Allen would wince — you missed {{value}}.',
  'Remember: {{value}} — that\'s where the link lived.',
  'The award goes to someone else. The link: {{value}}.',
  'Your script is rejected — the connection was {{value}}.',
  'DiCaprio is still chasing a statue — but he knew about {{value}}.',
  'Brilliant clue: {{value}} — but not this time.',
  'A billet doux of awards — you missed {{value}}.',
];

// Generic celebratory lines used when we don't have a connection value
// (e.g. right after correctly guessing a movie from its trailer).
const SUCCESS_GENERIC_HE = [
  'זכית באוסקר! זיהוי מושלם.',
  'הקדם אקדמי מתחיל לחפש מקום עבורך.',
  'אקדמיה? אתה כבר חבר/ה.',
  'הוליווד מתעוררת לכבודך!',
  'הזיהוי הזה שווה כפיים בעמידה.',
  'יוצרי הסרט שלחו לך תודה.',
  'הסטודיו דורש שתכתוב לו סרט.',
  'נטפליקס שלחה לך הצעה.',
  'גלגלי הקרן מתעוררים לחיים.',
  'מומחה קולנוע — והכוכבים בצד שלך.',
];

const SUCCESS_GENERIC_EN = [
  'You won an Oscar! Flawless recognition.',
  'The Academy is already saving you a seat.',
  'Hollywood wakes up to applaud!',
  'A standing ovation for the perfect ID.',
  'The filmmakers send their thanks.',
  'The studio wants you to write their next script.',
  'Netflix just sent you an offer.',
  'The projector roars to life.',
  'A born film critic — stars on your side.',
  'A perfect identification — the credits roll for you.',
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Returns a randomly chosen Oscar-style quip.
 *
 * @param {object}   opts
 * @param {boolean}  opts.success      true = celebrate, false = roast
 * @param {string}   [opts.language]   'he' (default) | 'en'
 * @param {string}   [opts.value]      The actor/director/year string to splice in.
 *                                     If missing, falls back to generic lines.
 */
export function pickOscarQuip({ success, language = 'he', value } = {}) {
  const isHe = language === 'he';

  if (success) {
    if (value) {
      const line = pick(isHe ? SUCCESS_HE : SUCCESS_EN);
      return line.replace('{{value}}', value);
    }
    return pick(isHe ? SUCCESS_GENERIC_HE : SUCCESS_GENERIC_EN);
  }

  // Failure line — always needs a value to mention; if absent we still
  // produce a graceful line by inserting a generic placeholder.
  const line = pick(isHe ? FAILURE_HE : FAILURE_EN);
  return line.replace(
    '{{value}}',
    value || (isHe ? 'הקשר שמצאנו' : 'the right link')
  );
}
