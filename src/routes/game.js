const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const User = require('../models/User');
const { checkAndConsumeAction, addXp } = require('../utils/gameLogic');
const { pickRandomTier, xpForMergeTier } = require('../utils/gifts');

const MAX_TIER = 8;
const NEW_GIFT_ENERGY_COST = 5;
const MERGE_ENERGY_COST = 2;
const TOP_TIER_BONUS_MULTIPLIER = 3; // merging two max-tier gifts: big XP burst, both cells clear
const LUCKY_VAULT_ENERGY_COST = 10;
const LUCKY_VAULT_MIN_REWARD = 5;
const LUCKY_VAULT_MAX_REWARD = 30;

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

  // -1 = locked cell, null = empty — neither can participate in a merge.
  if (!fromTier || fromTier < 1 || !toTier || toTier < 1 || fromTier !== toTier) {
    return res.status(400).json({ error: 'cannot_merge' });
  }
  if (user.energy < MERGE_ENERGY_COST) {
    return res.status(400).json({ error: 'not_enough_energy' });
  }

  const gate = checkAndConsumeAction(user);
  if (!gate.allowed) {
    await user.save();
    return res.status(429).json({ error: gate.reason });
  }

  let xpGained;
  if (fromTier >= MAX_TIER) {
    // Two max-tier gifts merged together: big bonus, both cells clear
    // instead of leveling up further (there's no tier 9 art).
    xpGained = xpForMergeTier(MAX_TIER) * TOP_TIER_BONUS_MULTIPLIER;
    user.board[toIndex] = null;
    user.board[fromIndex] = null;
  } else {
    xpGained = xpForMergeTier(fromTier + 1);
    user.board[toIndex] = fromTier + 1;
    user.board[fromIndex] = null;
  }

  user.energy -= MERGE_ENERGY_COST;
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

  // Only null (empty/fillable) cells qualify — locked (-1) cells are skipped.
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

// POST /api/game/lucky-vault
// The spin-the-wheel feature. Visually shows many prize categories on the
// frontend, but the actual grant is always energy — see README for why.
router.post('/lucky-vault', telegramAuth, async (req, res) => {
  const user = req.dbUser;
  if (user.energy < LUCKY_VAULT_ENERGY_COST) {
    return res.status(400).json({ error: 'not_enough_energy' });
  }
  const gate = checkAndConsumeAction(user);
  if (!gate.allowed) {
    await user.save();
    return res.status(429).json({ error: gate.reason });
  }

  const reward = LUCKY_VAULT_MIN_REWARD + Math.floor(Math.random() * (LUCKY_VAULT_MAX_REWARD - LUCKY_VAULT_MIN_REWARD + 1));
  user.energy = user.energy - LUCKY_VAULT_ENERGY_COST + reward;
  await user.save();

  res.json({ ok: true, energy: user.energy, reward });
});

module.exports = router;
