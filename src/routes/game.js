const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const User = require('../models/User');
const { checkAndConsumeAction, addXp } = require('../utils/gameLogic');

const MERGE_XP_REWARD = 5;
const MAX_TIER = 8;
const NEW_GIFT_ENERGY_COST = 5;
const MERGE_ENERGY_COST = 2;

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

  if (!fromTier || !toTier || fromTier !== toTier) {
    return res.status(400).json({ error: 'cannot_merge' });
  }
  if (fromTier >= MAX_TIER) {
    return res.status(400).json({ error: 'max_tier_reached' });
  }
  if (user.energy < MERGE_ENERGY_COST) {
    return res.status(400).json({ error: 'not_enough_energy' });
  }

  const gate = checkAndConsumeAction(user);
  if (!gate.allowed) {
    await user.save();
    return res.status(429).json({ error: gate.reason });
  }

  user.board[toIndex] = fromTier + 1;
  user.board[fromIndex] = null;
  user.energy -= MERGE_ENERGY_COST;
  user.markModified('board');

  addXp(user, MERGE_XP_REWARD);
  await user.save();

  res.json({ ok: true, board: user.board, xp: user.xp, level: user.level, energy: user.energy, xpGained: MERGE_XP_REWARD });
});

router.post('/new-gift', telegramAuth, async (req, res) => {
  const user = req.dbUser;

  if (user.energy < NEW_GIFT_ENERGY_COST) {
    return res.status(400).json({ error: 'not_enough_energy' });
  }

  const emptyIndices = user.board.reduce((acc, cell, idx) => { if (!cell) acc.push(idx); return acc; }, []);
  if (emptyIndices.length === 0) {
    return res.status(400).json({ error: 'board_full' });
  }

  const gate = checkAndConsumeAction(user);
  if (!gate.allowed) {
    await user.save();
    return res.status(429).json({ error: gate.reason });
  }

  const chosen = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
  user.board[chosen] = 1;
  user.energy -= NEW_GIFT_ENERGY_COST;
  user.markModified('board');
  await user.save();

  res.json({ ok: true, board: user.board, energy: user.energy });
});

module.exports = router;
