// Shared helpers for vs-computer (bot) game rooms.
// Each bot game gets its own Firebase room code — no shared room 99999.

export const BOT_SEATS_ROWS = 3;
export const BOT_SEATS_COLS = 4;
export const SEATS_PER_TEAM = BOT_SEATS_ROWS * BOT_SEATS_COLS;

const BOT_EMOJIS = [
  '🤖', '👾', '🛸', '🦾', '🦿', '⚙️',
  '🪐', '🛰️', '🎬', '🎯', '🎮', '🕹️',
];

/** Decorative bot seats for Team B (first seat is the playable bot). */
export const buildBotRoster = (lang = 'en') => {
  const roster = {};
  for (let i = 0; i < SEATS_PER_TEAM; i++) {
    const id = i === 0 ? 'bot_player' : `bot_${i + 1}`;
    const emoji = BOT_EMOJIS[i % BOT_EMOJIS.length];
    // Persist both an English and a Hebrew label so the lobby/game can
    // render the right one regardless of which language the player is
    // currently using.
    const labelEn = `BOT${i + 1}`;
    const labelHe = `בוט ${i + 1}`;
    const activeLabel = lang === 'he' ? labelHe : labelEn;
    roster[id] = {
      id,
      name: `${emoji} ${activeLabel}`,
      team: 'B',
      seat: i,
      ready: true,
      isHost: false,
      isBot: true,
      botEmoji: emoji,
      botLabel: activeLabel,
      botLabels: { en: labelEn, he: labelHe },
    };
  }
  return roster;
};

/** Pick the right localized bot label for an occupant record. */
export const botLabelFor = (occupant, lang = 'en') => {
  if (!occupant) return '';
  if (occupant.botLabels && occupant.botLabels[lang]) {
    return occupant.botLabels[lang];
  }
  return occupant.botLabel || '';
};

export const isBotModeRoom = (roomOrGame) =>
  Boolean(roomOrGame?.isBotMode || roomOrGame?.isQAMode);
