const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');
const Task = require('../models/Task');
const UserTask = require('../models/UserTask');
const { addXp, todayKey } = require('../utils/gameLogic');

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

  if (task.xpReward) addXp(req.dbUser, task.xpReward);
  if (task.energyReward) req.dbUser.energy += task.energyReward; // uncapped, same as roadmap rewards
  await req.dbUser.save();

  res.json({ ok: true, xp: req.dbUser.xp, level: req.dbUser.level, energy: req.dbUser.energy, energyGained: task.energyReward });
});

module.exports = router;
