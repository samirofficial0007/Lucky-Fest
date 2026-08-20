const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const adminAuth = require('../middleware/adminAuth');
const Task = require('../models/Task');
const Raffle = require('../models/Raffle');
const User = require('../models/User');
const LevelReward = require('../models/LevelReward');
const Admin = require('../models/Admin');
const { pickWeightedWinners, generateSeed } = require('../utils/randomWinner');

// Every route below requires: verified Telegram identity AND presence in ADMIN_IDS.
router.use(telegramAuth, adminAuth);

// -------- Dashboard summary --------
router.get('/summary', async (req, res) => {
  const [userCount, taskCount, openRaffles] = await Promise.all([
    User.countDocuments(),
    Task.countDocuments({ active: true }),
    Raffle.countDocuments({ status: 'open' }),
  ]);
  res.json({ userCount, taskCount, openRaffles });
});

// -------- Users --------
router.get('/users', async (req, res) => {
  const { search = '', page = 1, limit = 25 } = req.query;
  const q = search
    ? { $or: [{ telegramId: search }, { username: new RegExp(search, 'i') }] }
    : {};
  const users = await User.find(q)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  res.json(users);
});

router.post('/users/:telegramId/ban', async (req, res) => {
  const { reason = '' } = req.body;
  const u = await User.findOneAndUpdate(
    { telegramId: req.params.telegramId },
    { banned: true, banReason: reason },
    { new: true }
  );
  if (!u) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

router.post('/users/:telegramId/unban', async (req, res) => {
  const u = await User.findOneAndUpdate(
    { telegramId: req.params.telegramId },
    { banned: false, banReason: '' },
    { new: true }
  );
  if (!u) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// Manual level/xp adjustment (e.g. customer support correcting an issue)
router.post('/users/:telegramId/adjust-xp', async (req, res) => {
  const { delta = 0 } = req.body;
  const { levelForXp } = require('../utils/gameLogic');
  const u = await User.findOne({ telegramId: req.params.telegramId });
  if (!u) return res.status(404).json({ error: 'not_found' });
  u.xp = Math.max(0, u.xp + Number(delta));
  u.level = levelForXp(u.xp);
  await u.save();
  res.json({ ok: true, xp: u.xp, level: u.level });
});

// -------- Tasks --------
router.get('/tasks', async (req, res) => {
  res.json(await Task.find().sort({ createdAt: -1 }));
});

router.post('/tasks', async (req, res) => {
  const { key, titleI18n = {}, type = 'link', actionUrl = '', xpReward = 0, energyReward = 10 } = req.body;
  if (!key) return res.status(400).json({ error: 'key_required' });
  const task = await Task.create({ key, titleI18n, type, actionUrl, xpReward, energyReward });
  res.json(task);
});

router.put('/tasks/:id', async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!task) return res.status(404).json({ error: 'not_found' });
  res.json(task);
});

router.delete('/tasks/:id', async (req, res) => {
  await Task.findByIdAndUpdate(req.params.id, { active: false });
  res.json({ ok: true });
});

// -------- Raffles --------
router.get('/raffles', async (req, res) => {
  res.json(await Raffle.find().sort({ createdAt: -1 }));
});

router.post('/raffles', async (req, res) => {
  const { titleI18n = {}, prizeDescriptionI18n = {}, minLevel = 1, endsAt, winnersCount = 1 } = req.body;
  if (!endsAt) return res.status(400).json({ error: 'endsAt_required' });
  const raffle = await Raffle.create({ titleI18n, prizeDescriptionI18n, minLevel, endsAt, winnersCount });
  res.json(raffle);
});

router.post('/raffles/:id/close', async (req, res) => {
  const raffle = await Raffle.findByIdAndUpdate(req.params.id, { status: 'closed' }, { new: true });
  if (!raffle) return res.status(404).json({ error: 'not_found' });
  res.json(raffle);
});

// Draw winners: seeded, logged, one-shot (can't redraw a raffle already drawn).
router.post('/raffles/:id/draw', async (req, res) => {
  const raffle = await Raffle.findById(req.params.id);
  if (!raffle) return res.status(404).json({ error: 'not_found' });
  if (raffle.status === 'drawn') return res.status(409).json({ error: 'already_drawn' });
  if (raffle.entries.length === 0) return res.status(400).json({ error: 'no_entries' });

  const seed = generateSeed();
  const picked = pickWeightedWinners(raffle.entries, raffle.winnersCount, seed);

  raffle.drawSeed = seed;
  raffle.winners = picked.map((p) => ({ telegramId: p.telegramId, prizeLabel: 'TBD' }));
  raffle.status = 'drawn';
  raffle.drawnAt = new Date();
  await raffle.save();

  res.json({ ok: true, seed, winners: raffle.winners });
});

// -------- Level roadmap --------
router.get('/level-rewards', async (req, res) => {
  res.json(await LevelReward.find().sort({ level: 1 }));
});

router.post('/level-rewards', async (req, res) => {
  const { level, type, amount = 0, raffleId = null, titleI18n = {} } = req.body;
  if (!level || !type) return res.status(400).json({ error: 'level_and_type_required' });
  try {
    const reward = await LevelReward.create({ level, type, amount, raffleId: raffleId || null, titleI18n });
    res.json(reward);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'level_already_configured' });
    throw e;
  }
});

router.put('/level-rewards/:id', async (req, res) => {
  const reward = await LevelReward.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!reward) return res.status(404).json({ error: 'not_found' });
  res.json(reward);
});

router.delete('/level-rewards/:id', async (req, res) => {
  await LevelReward.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// -------- Admins (owner-managed, in-app) --------
router.get('/admins', async (req, res) => {
  const admins = await Admin.find().sort({ isOwner: -1, addedAt: 1 });
  res.json(admins.map((a) => ({ telegramId: a.telegramId, isOwner: a.isOwner, addedAt: a.addedAt })));
});

router.post('/admins', async (req, res) => {
  if (!req.isOwner) return res.status(403).json({ error: 'owner_only' });
  const { telegramId } = req.body;
  if (!telegramId) return res.status(400).json({ error: 'telegramId_required' });
  try {
    const admin = await Admin.create({ telegramId: String(telegramId), isOwner: false, addedBy: req.tgUser && String(req.tgUser.id) });
    res.json(admin);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'already_admin' });
    throw e;
  }
});

router.delete('/admins/:telegramId', async (req, res) => {
  if (!req.isOwner) return res.status(403).json({ error: 'owner_only' });
  const target = await Admin.findOne({ telegramId: req.params.telegramId });
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (target.isOwner) return res.status(403).json({ error: 'cannot_remove_owner' });
  await Admin.deleteOne({ telegramId: req.params.telegramId });
  res.json({ ok: true });
});

module.exports = router;
