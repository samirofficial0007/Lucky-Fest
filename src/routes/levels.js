const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const LevelReward = require('../models/LevelReward');
const User = require('../models/User');

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
// type 'energy'     -> flat energy grant
// type 'lootbox'    -> "Lucky Vault" spin — grants energy (amount from the
//                       reward config), presented client-side as a spin
//                       reveal instead of a plain toast
// type 'giveaway'   -> just marks as seen; actual raffle entry happens via
//                       POST /api/raffles/:id/enter
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
