const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const config = require('../config');
const User = require('../models/User');
const { FRIEND_UNLOCK_THRESHOLDS, pickRandomTier } = require('../utils/gifts');

// GET /api/friends/status
router.get('/status', telegramAuth, async (req, res) => {
  const u = req.dbUser;
  let changed = false;

  // Check every locked cell: if the friend-invite threshold is now met and
  // it hasn't been unlocked yet, unlock it and drop a random high-tier gift
  // in (weighted toward higher tiers than a normal "Get Gift" spawn, as a
  // reward for the invites).
  for (const [idxStr, threshold] of Object.entries(FRIEND_UNLOCK_THRESHOLDS)) {
    const idx = Number(idxStr);
    if (u.board[idx] === -1 && u.invitedCount >= threshold) {
      u.board[idx] = Math.max(pickRandomTier(), 3); // guaranteed at least tier 3
      u.unlockedExtraCells.push(idx);
      u.markModified('board');
      changed = true;
    }
  }
  if (changed) await u.save();

  res.json({
    inviteLink: config.botUsername ? `https://t.me/${config.botUsername}?start=ref_${u.telegramId}` : null,
    invitedCount: u.invitedCount,
    thresholds: FRIEND_UNLOCK_THRESHOLDS,
    unlockedExtraCells: u.unlockedExtraCells,
  });
});

module.exports = router;
