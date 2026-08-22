const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const config = require('../config');
const User = require('../models/User');
const { FRIEND_UNLOCK_THRESHOLDS, unlockRewardTier } = require('../utils/gifts');

// GET /api/friends/status
router.get('/status', telegramAuth, async (req, res) => {
  const u = req.dbUser;
  let changed = false;

  for (const [idxStr, threshold] of Object.entries(FRIEND_UNLOCK_THRESHOLDS)) {
    const idx = Number(idxStr);
    if (u.board[idx] === -1 && u.invitedCount >= threshold) {
      u.board[idx] = unlockRewardTier(); // guaranteed high tier, reward for the invites
      u.unlockedExtraCells.push(idx);
      u.markModified('board');
      changed = true;
    }
  }
  if (changed) await u.save();

  // Names of everyone who used this user's invite link — most recent first.
  const invitedUsers = await User.find({ referredBy: u.telegramId })
    .sort({ createdAt: -1 })
    .select('telegramId username firstName createdAt')
    .limit(200);

  res.json({
    inviteLink: config.botUsername ? `https://t.me/${config.botUsername}?start=ref_${u.telegramId}` : null,
    invitedCount: u.invitedCount,
    thresholds: FRIEND_UNLOCK_THRESHOLDS,
    unlockedExtraCells: u.unlockedExtraCells,
    invitedUsers: invitedUsers.map((f) => ({
      telegramId: f.telegramId,
      displayName: f.firstName || f.username || `User ${f.telegramId}`,
      username: f.username || null,
    })),
  });
});

module.exports = router;
