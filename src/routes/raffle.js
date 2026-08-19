const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const Raffle = require('../models/Raffle');

// GET /api/raffles - open raffles, with the user's own eligibility/entry status
router.get('/', telegramAuth, async (req, res) => {
  const raffles = await Raffle.find({ status: 'open' }).sort({ endsAt: 1 });
  const uid = req.dbUser.telegramId;

  res.json(
    raffles.map((r) => ({
      id: r._id,
      titleI18n: Object.fromEntries(r.titleI18n),
      prizeDescriptionI18n: Object.fromEntries(r.prizeDescriptionI18n),
      minLevel: r.minLevel,
      endsAt: r.endsAt,
      winnersCount: r.winnersCount,
      entryCount: r.entries.length,
      eligible: req.dbUser.level >= r.minLevel,
      alreadyEntered: r.entries.some((e) => e.telegramId === uid),
    }))
  );
});

// POST /api/raffles/:id/enter
// Entry requires: wallet connected (so prizes can be paid out) + level gate.
// One entry per user, enforced server-side.
router.post('/:id/enter', telegramAuth, async (req, res) => {
  const raffle = await Raffle.findById(req.params.id);
  if (!raffle || raffle.status !== 'open') return res.status(404).json({ error: 'raffle_not_open' });

  if (req.dbUser.level < raffle.minLevel) {
    return res.status(403).json({ error: 'level_too_low' });
  }
  if (!req.dbUser.walletAddress) {
    return res.status(400).json({ error: 'wallet_required' });
  }
  if (raffle.entries.some((e) => e.telegramId === req.dbUser.telegramId)) {
    return res.status(409).json({ error: 'already_entered' });
  }

  raffle.entries.push({ telegramId: req.dbUser.telegramId, weight: 1 });
  await raffle.save();
  res.json({ ok: true, entryCount: raffle.entries.length });
});

module.exports = router;
