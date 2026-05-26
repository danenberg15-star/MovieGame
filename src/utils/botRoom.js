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
    const label = `BOT${i + 1}`;
    roster[id] = {
      id,
      name: `${emoji} ${label}`,
      team: 'B',
      seat: i,
      ready: true,
      isHost: false,
      isBot: true,
      botEmoji: emoji,
      botLabel: label,
    };
  }
  return roster;
};

export const isBotModeRoom = (roomOrGame) =>
  Boolean(roomOrGame?.isBotMode || roomOrGame?.isQAMode);
