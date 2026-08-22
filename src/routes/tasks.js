const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const Task = require('../models/Task');
const UserTask = require('../models/UserTask');
const { addXp, todayKey } = require('../utils/gameLogic');

const WATCH_AD_MIN_ENERGY = 5;
const WATCH_AD_MAX_ENERGY = 25;

router.get('/', telegramAuth, async (req, res) => {
  const tasks = await Task.find({ active: true });
  const day = todayKey();
  const completed = await UserTask.find({ telegramId: req.dbUser.telegramId, dayKey: day });
  const completedKeys = new Set(completed.map((c) => c.taskKey));

  res.json(
    tasks.map((t) => ({
      key: t.key,
      titleI18n: Object.fromEntries(t.titleI18n),
      type: t.type,
      actionUrl: t.actionUrl,
      xpReward: t.xpReward,
      energyReward: t.energyReward,
      completed: completedKeys.has(t.key),
    }))
  );
});

router.post('/claim', telegramAuth, async (req, res) => {
  const { key } = req.body;
  const task = await Task.findOne({ key, active: true });
  if (!task) return res.status(404).json({ error: 'task_not_found' });

  const day = todayKey();
  try {
    await UserTask.create({ telegramId: req.dbUser.telegramId, taskKey: key, dayKey: day });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'already_claimed' });
    throw e;
  }

  let energyGained = task.energyReward || 0;
  // 'watch_ad' tasks: no real ad SDK is wired up here (that needs a third-party
  // ad network account — see README) — this simulates the reward step with a
  // random energy grant instead of a fixed one, once per day like other tasks.
  if (task.type === 'watch_ad') {
    energyGained = WATCH_AD_MIN_ENERGY + Math.floor(Math.random() * (WATCH_AD_MAX_ENERGY - WATCH_AD_MIN_ENERGY + 1));
  }

  if (task.xpReward) addXp(req.dbUser, task.xpReward);
  if (energyGained) req.dbUser.energy += energyGained;
  await req.dbUser.save();

  res.json({ ok: true, xp: req.dbUser.xp, level: req.dbUser.level, energy: req.dbUser.energy, energyGained });
});

module.exports = router;
