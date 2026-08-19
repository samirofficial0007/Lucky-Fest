const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const { checkAndConsumeAction, addXp } = require('../utils/gameLogic');

// Simple merge table: two items of tier N -> one item of tier N+1.
// Extend this freely; keep it server-side so the client cannot invent items.
const MERGE_XP_REWARD = 5;

// POST /api/game/merge  { itemKey, tier }
// The client tells the server "I want to merge two of X at tier N" — the
// server is the one that decides whether that's allowed and what XP it's
// worth. Never trust a client-sent "reward" or "newLevel" value.
router.post('/merge', telegramAuth, async (req, res) => {
  const user = req.dbUser;
  const { itemKey, tier } = req.body;

  if (!itemKey || typeof tier !== 'number') {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  const gate = checkAndConsumeAction(user);
  if (!gate.allowed) {
    return res.status(429).json({ error: gate.reason });
  }

  const slot = user.inventory.find((i) => i.itemKey === itemKey && i.tier === tier);
  if (!slot || slot.qty < 2) {
    await user.save(); // persist cooldown/action counters even on failure
    return res.status(400).json({ error: 'not_enough_items' });
  }

  slot.qty -= 2;
  const nextSlot = user.inventory.find((i) => i.itemKey === itemKey && i.tier === tier + 1);
  if (nextSlot) nextSlot.qty += 1;
  else user.inventory.push({ itemKey, tier: tier + 1, qty: 1 });

  addXp(user, MERGE_XP_REWARD);
  await user.save();

  res.json({
    ok: true,
    inventory: user.inventory,
    xp: user.xp,
    level: user.level,
  });
});

// GET /api/game/state
router.get('/state', telegramAuth, async (req, res) => {
  const u = req.dbUser;
  res.json({
    level: u.level,
    xp: u.xp,
    inventory: u.inventory,
    actionsToday: u.actionsToday,
  });
});

module.exports = router;
