const { verifyInitData } = require('../utils/verifyTelegram');
const { applyEnergyRegen } = require('../utils/energy');
const User = require('../models/User');

async function telegramAuth(req, res, next) {
  const initData = req.header('X-Telegram-Init-Data');
  const result = verifyInitData(initData);

  if (!result.valid) {
    return res.status(401).json({ error: 'unauthorized', reason: result.reason });
  }

  req.tgUser = result.user;

  let dbUser = await User.findOne({ telegramId: String(result.user.id) });
  if (!dbUser) {
    // Schema default already fills the board with locked cells (12-15 = -1)
    // and empty cells elsewhere — just seed a couple of starter tier-1 gifts.
    dbUser = await User.create({
      telegramId: String(result.user.id),
      username: result.user.username || '',
      firstName: result.user.first_name || '',
      languageCode: result.user.language_code || 'en',
    });
    dbUser.board[0] = 1;
    dbUser.board[1] = 1;
    dbUser.markModified('board');
    await dbUser.save();
  }

  if (dbUser.banned) {
    return res.status(403).json({ error: 'banned', reason: dbUser.banReason });
  }

  const changed = applyEnergyRegen(dbUser);
  if (changed) await dbUser.save();

  req.dbUser = dbUser;
  next();
}

module.exports = telegramAuth;
