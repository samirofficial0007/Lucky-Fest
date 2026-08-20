const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const config = require('../config');
const Admin = require('../models/Admin');

// POST /api/auth/login
router.post('/login', telegramAuth, async (req, res) => {
  const u = req.dbUser;
  const admin = await Admin.findOne({ telegramId: u.telegramId });
  res.json({
    telegramId: u.telegramId,
    username: u.username,
    firstName: u.firstName,
    languageCode: u.languageCode,
    level: u.level,
    xp: u.xp,
    energy: u.energy,
    walletAddress: u.walletAddress,
    isAdmin: !!admin,
    isOwner: !!(admin && admin.isOwner),
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
