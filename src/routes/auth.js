const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const config = require('../config');
const Admin = require('../models/Admin');

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
    tutorialCompleted: u.tutorialCompleted,
  });
});

router.post('/set-language', telegramAuth, async (req, res) => {
  const { language } = req.body;
  if (!config.supportedLanguages.includes(language)) {
    return res.status(400).json({ error: 'unsupported_language' });
  }
  req.dbUser.languageCode = language;
  await req.dbUser.save();
  res.json({ ok: true, languageCode: language });
});

// POST /api/auth/complete-tutorial
router.post('/complete-tutorial', telegramAuth, async (req, res) => {
  req.dbUser.tutorialCompleted = true;
  await req.dbUser.save();
  res.json({ ok: true });
});

module.exports = router;
