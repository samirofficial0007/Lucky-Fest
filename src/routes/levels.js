const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const LevelReward = require('../models/LevelReward');
const User = require('../models/User');

// GET /api/levels/roadmap
// Returns EVERY level from 1 up through the end of the player's current
// "band" (1-100, then 101-200 once they pass 100, etc — see
// src/utils/gameLogic.js levelBand()), not just the levels an admin
// configured a reward for. Levels without a configured reward come back
// as lightweight { hasReward: false } entries so the frontend can render
// a compact scrollable list of the whole 1..100/200/300... range.
router.get('/roadmap', telegramAuth, async (req, res) => {
  const u = req.dbUser;
  const band = Math.floor(u.level / 100); // 0 for levels 0-99, 1 for 100-199, ...
  const upperBound = (band + 1) * 100;

  const rewards = await LevelReward.find({ level: { $lte: upperBound } });
  const rewardByLevel = new Map(rewards.map((r) => [r.level, r]));

  const levels = [];
  for (let lvl = 1; lvl <= upperBound; lvl++) {
    const r = rewardByLevel.get(lvl);
    if (r) {
      levels.push({
        level: lvl,
        hasReward: true,
        type: r.type,
        amount: r.amount,
        raffleId: r.raffleId,
        titleI18n: Object.fromEntries(r.titleI18n),
        claimed: u.claimedLevelRewards.includes(lvl),
        unlocked: u.level >= lvl,
      });
    } else {
      levels.push({ level: lvl, hasReward: false, unlocked: u.level >= lvl });
    }
  }

  res.json({ levels, currentLevel: u.level, band, upperBound });
});

// POST /api/levels/:level/claim  (only meaningful for hasReward levels)
router.post('/:level/claim', telegramAuth, async (req, res) => {
  const level = Number(req.params.level);
  const reward = await LevelReward.findOne({ level });
  if (!reward) return res.status(404).json({ error: 'not_found' });

  const user = req.dbUser;
  if (user.level < level) return res.status(403).json({ error: 'level_locked' });
  if (user.claimedLevelRewards.includes(level)) return res.status(409).json({ error: 'already_claimed' });

  if (reward.type === 'energy' || reward.type === 'lootbox') {
    user.energy += reward.amount; // uncapped, same as task rewards
  }
  // 'giveaway': nothing to grant here — see raffle enter endpoint.

  user.claimedLevelRewards.push(level);
  await user.save();

  res.json({ ok: true, type: reward.type, amount: reward.amount, raffleId: reward.raffleId, energy: user.energy });
});

module.exports = router;
