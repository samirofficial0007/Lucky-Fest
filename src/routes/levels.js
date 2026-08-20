const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const LevelReward = require('../models/LevelReward');
const User = require('../models/User');
const Raffle = require('../models/Raffle');

// GET /api/levels/roadmap
router.get('/roadmap', telegramAuth, async (req, res) => {
  const rewards = await LevelReward.find().sort({ level: 1 });
  const u = req.dbUser;
  res.json(
    rewards.map((r) => ({
      id: r._id,
      level: r.level,
      type: r.type,
      amount: r.amount,
      raffleId: r.raffleId,
      titleI18n: Object.fromEntries(r.titleI18n),
      claimed: u.claimedLevelRewards.includes(r.level),
      unlocked: u.level >= r.level,
    }))
  );
});

// POST /api/levels/:level/claim
router.post('/:level/claim', telegramAuth, async (req, res) => {
  const level = Number(req.params.level);
  const reward = await LevelReward.findOne({ level });
  if (!reward) return res.status(404).json({ error: 'not_found' });

  const user = req.dbUser;
  if (user.level < level) return res.status(403).json({ error: 'level_locked' });
  if (user.claimedLevelRewards.includes(level)) return res.status(409).json({ error: 'already_claimed' });

  let lootedTier = null;
  if (reward.type === 'energy') {
    user.energy += reward.amount;
  } else if (reward.type === 'lootbox') {
    const emptyIndices = user.board.reduce((acc, c, i) => (!c ? [...acc, i] : acc), []);
    if (emptyIndices.length > 0) {
      const idx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
      lootedTier = 1 + Math.floor(Math.random() * 3); // random tier 1-3
      user.board[idx] = lootedTier;
      user.markModified('board');
    }
  }
  // 'giveaway' type: claiming just marks it seen; actual raffle entry
  // happens via POST /api/raffles/:id/enter using reward.raffleId.

  user.claimedLevelRewards.push(level);
  await user.save();

  res.json({ ok: true, type: reward.type, amount: reward.amount, lootedTier, raffleId: reward.raffleId, energy: user.energy, board: user.board });
});

module.exports = router;
