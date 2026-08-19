const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const config = require('../config');

// POST /api/auth/login
// Called once when the Mini App opens. telegramAuth middleware already
// verified initData and created/loaded the user; we just return the profile.
router.post('/login', telegramAuth, async (req, res) => {
  const u = req.dbUser;
  res.json({
    telegramId: u.telegramId,
    username: u.username,
    firstName: u.firstName,
    languageCode: u.languageCode,
    level: u.level,
    xp: u.xp,
    walletAddress: u.walletAddress,
    isAdmin: config.adminIds.includes(u.telegramId),
  });
});

// POST /api/auth/set-language  { language: "bn" }
router.post('/set-language', telegramAuth, async (req, res) => {
  const { language } = req.body;
  if (!config.supportedLanguages.includes(language)) {
    return res.status(400).json({ error: 'unsupported_language' });
  }
  req.dbUser.languageCode = language;
  await req.dbUser.save();
  res.json({ ok: true, languageCode: language });
});

module.exports = router;
