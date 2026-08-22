const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const User = require('../models/User');
const { checkAndConsumeAction, addXp } = require('../utils/gameLogic');
const { pickRandomTier, xpForMergeTier, MAX_TIER } = require('../utils/gifts');

// Merging is FREE — only drawing a new gift costs energy, flat, regardless
// of which tier gets drawn.
const NEW_GIFT_ENERGY_COST = 2;
const TOP_TIER_BONUS_MULTIPLIER = 3; // merging two max-tier gifts: big XP burst, both cells clear

router.get('/state', telegramAuth, async (req, res) => {
  const u = req.dbUser;
  res.json({ level: u.level, xp: u.xp, energy: u.energy, board: u.board });
});

router.post('/merge-cell', telegramAuth, async (req, res) => {
  const user = req.dbUser;
  const { fromIndex, toIndex } = req.body;
  const size = User.BOARD_SIZE;

  if (
    typeof fromIndex !== 'number' || typeof toIndex !== 'number' ||
    fromIndex < 0 || fromIndex >= size || toIndex < 0 || toIndex >= size || fromIndex === toIndex
  ) {
    return res.status(400).json({ error: 'invalid_indices' });
  }

  const fromTier = user.board[fromIndex];
  const toTier = user.board[toIndex];

  if (!fromTier || fromTier < 1 || !toTier || toTier < 1 || fromTier !== toTier) {
    return res.status(400).json({ error: 'cannot_merge' });
  }

  const gate = checkAndConsumeAction(user);
  if (!gate.allowed) {
    await user.save();
    return res.status(429).json({ error: gate.reason });
  }

  let xpGained;
  if (fromTier >= MAX_TIER) {
    xpGained = xpForMergeTier(MAX_TIER) * TOP_TIER_BONUS_MULTIPLIER;
    user.board[toIndex] = null;
    user.board[fromIndex] = null;
  } else {
    xpGained = xpForMergeTier(fromTier + 1);
    user.board[toIndex] = fromTier + 1;
    user.board[fromIndex] = null;
  }

  user.markModified('board');
  addXp(user, xpGained);
  await user.save();

  res.json({ ok: true, board: user.board, xp: user.xp, level: user.level, energy: user.energy, xpGained });
});

router.post('/new-gift', telegramAuth, async (req, res) => {
  const user = req.dbUser;

  if (user.energy < NEW_GIFT_ENERGY_COST) {
    return res.status(400).json({ error: 'not_enough_energy' });
  }

  const emptyIndices = user.board.reduce((acc, cell, idx) => { if (cell === null) acc.push(idx); return acc; }, []);
  if (emptyIndices.length === 0) {
    return res.status(400).json({ error: 'board_full' });
  }

  const gate = checkAndConsumeAction(user);
  if (!gate.allowed) {
    await user.save();
    return res.status(429).json({ error: gate.reason });
  }

  const chosen = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
  user.board[chosen] = pickRandomTier();
  user.energy -= NEW_GIFT_ENERGY_COST;
  user.markModified('board');
  await user.save();

  res.json({ ok: true, board: user.board, energy: user.energy });
});

module.exports = router;
