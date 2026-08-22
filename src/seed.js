const config = require('./config');
const Admin = require('./models/Admin');
const LevelReward = require('./models/LevelReward');
const Task = require('./models/Task');

async function seedOwner() {
  const ownerId = config.adminIds[0];
  if (!ownerId) {
    console.warn('[seed] No ADMIN_IDS set — no owner seeded. Set ADMIN_IDS and redeploy once to bootstrap an owner.');
    return;
  }
  const existingOwner = await Admin.findOne({ isOwner: true });
  if (existingOwner) return;

  await Admin.findOneAndUpdate(
    { telegramId: ownerId },
    { telegramId: ownerId, isOwner: true, addedBy: 'system' },
    { upsert: true, new: true }
  );
  console.log(`[seed] Owner admin seeded: ${ownerId}`);
}

async function seedDemoRoadmap() {
  const count = await LevelReward.countDocuments();
  if (count > 0) return;

  const demo = [
    { level: 1, type: 'energy', amount: 20, titleI18n: { en: '+20 Energy', bn: '+২০ এনার্জি' } },
    { level: 2, type: 'lootbox', amount: 25, titleI18n: { en: 'Lucky Vault Spin', bn: 'লাকি ভল্ট স্পিন' } },
    { level: 3, type: 'giveaway', amount: 0, titleI18n: { en: '3,000 Telegram Star Giveaway', bn: '৩,০০০ টেলিগ্রাম স্টার গিভঅ্যাওয়ে' } },
    { level: 7, type: 'energy', amount: 50, titleI18n: { en: '+50 Energy', bn: '+৫০ এনার্জি' } },
    { level: 12, type: 'giveaway', amount: 0, titleI18n: { en: 'Gold Bar Giveaway', bn: 'গোল্ড বার গিভঅ্যাওয়ে' } },
  ];

  await LevelReward.insertMany(demo);
  console.log(`[seed] Demo roadmap seeded (${demo.length} levels) — edit/replace from the Admin tab any time.`);
}

async function seedDemoTasks() {
  const count = await Task.countDocuments();
  if (count > 0) return;

  await Task.insertMany([
    {
      key: 'watch_ad',
      titleI18n: { en: '📺 Watch an Ad', bn: '📺 একটা বিজ্ঞাপন দেখো' },
      type: 'watch_ad',
      xpReward: 0,
      energyReward: 0, // ignored for watch_ad — see src/routes/tasks.js (random 5-25)
    },
  ]);
  console.log('[seed] Demo "Watch an Ad" task seeded.');
}

async function runSeed() {
  await seedOwner();
  await seedDemoRoadmap();
  await seedDemoTasks();
}

module.exports = runSeed;
