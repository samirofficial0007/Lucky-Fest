const { verifyInitData } = require('../utils/verifyTelegram');
const User = require('../models/User');

/**
 * Expects the frontend to send the raw Telegram WebApp initData string
 * in the "X-Telegram-Init-Data" header on every API call.
 * On success, attaches req.tgUser (verified Telegram payload) and
 * req.dbUser (the Mongo user document, created on first sight).
 */
async function telegramAuth(req, res, next) {
  const initData = req.header('X-Telegram-Init-Data');
  const result = verifyInitData(initData);

  if (!result.valid) {
    return res.status(401).json({ error: 'unauthorized', reason: result.reason });
  }

  req.tgUser = result.user;

  let dbUser = await User.findOne({ telegramId: String(result.user.id) });
  if (!dbUser) {
    // Starter board so the merge grid isn't empty on first open:
    // a few tier-1 gifts scattered across the 16 cells.
    const board = new Array(User.BOARD_SIZE).fill(null);
    [0, 1, 5, 8].forEach((i) => (board[i] = 1));

    dbUser = await User.create({
      telegramId: String(result.user.id),
      username: result.user.username || '',
      firstName: result.user.first_name || '',
      languageCode: result.user.language_code || 'en',
      board,
    });
  }

  if (dbUser.banned) {
    return res.status(403).json({ error: 'banned', reason: dbUser.banReason });
  }

  req.dbUser = dbUser;
  next();
}

module.exports = telegramAuth;
