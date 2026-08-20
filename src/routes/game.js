const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const User = require('../models/User');
const { checkAndConsumeAction, addXp } = require('../utils/gameLogic');

const MERGE_XP_REWARD = 5;
const MAX_TIER = 8; // matches public/assets/items/gift_tier1..8.png
const NEW_GIFT_ENERGY_COST = 5;

// GET /api/game/state
router.get('/state', telegramAuth, async (req, res) => {
  const u = req.dbUser;
  res.json({
    level: u.level,
    xp: u.xp,
    energy: u.energy,
    board: u.board,
  });
});

// POST /api/game/merge-cell  { fromIndex, toIndex }
// Drag-and-drop merge: the client tells us which two board cells the player
// dragged one onto the other. The server is the one that decides whether
// they're eligible to merge (same tier, both occupied) and what happens —
// the client never sends "the result", only the intent.
router.post('/merge-cell', telegramAuth, async (req, res) => {
  const user = req.dbUser;
  const { fromIndex, toIndex } = req.body;
  const size = User.BOARD_SIZE;

  if (
    typeof fromIndex !== 'number' ||
    typeof toIndex !== 'number' ||
    fromIndex < 0 ||
    fromIndex >= size ||
    toIndex < 0 ||
    toIndex >= size ||
    fromIndex === toIndex
  ) {
    return res.status(400).json({ error: 'invalid_indices' });
  }

  const gate = checkAndConsumeAction(user);
  if (!gate.allowed) {
    await user.save();
    return res.status(429).json({ error: gate.reason });
  }

  const fromTier = user.board[fromIndex];
  const toTier = user.board[toIndex];

  if (!fromTier || !toTier || fromTier !== toTier) {
    await user.save(); // still persist the cooldown tick even on a failed attempt
    return res.status(400).json({ error: 'cannot_merge' });
  }

  if (fromTier >= MAX_TIER) {
    await user.save();
    return res.status(400).json({ error: 'max_tier_reached' });
  }

  user.board[toIndex] = fromTier + 1;
  user.board[fromIndex] = null;
  user.markModified('board');

  addXp(user, MERGE_XP_REWARD);
  await user.save();

  res.json({ ok: true, board: user.board, xp: user.xp, level: user.level });
});

// POST /api/game/new-gift
// Equivalent of the reference app's "GET GIFT" button: spends energy to drop
// a fresh tier-1 item into a random empty cell. Server picks the cell and
// checks energy server-side — the client can't invent free items.
router.post('/new-gift', telegramAuth, async (req, res) => {
  const user = req.dbUser;

  if (user.energy < NEW_GIFT_ENERGY_COST) {
    return res.status(400).json({ error: 'not_enough_energy' });
  }

  const emptyIndices = user.board.reduce((acc, cell, idx) => {
    if (!cell) acc.push(idx);
    return acc;
  }, []);

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
