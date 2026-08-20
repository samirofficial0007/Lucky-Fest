const config = require('./config');
const Admin = require('./models/Admin');
const LevelReward = require('./models/LevelReward');

async function seedOwner() {
  const ownerId = config.adminIds[0];
  if (!ownerId) {
    console.warn('[seed] No ADMIN_IDS set — no owner seeded. Set ADMIN_IDS and redeploy once to bootstrap an owner.');
    return;
  }
  const existingOwner = await Admin.findOne({ isOwner: true });
  if (existingOwner) return; // owner already seeded, never re-seed/overwrite

  await Admin.findOneAndUpdate(
    { telegramId: ownerId },
    { telegramId: ownerId, isOwner: true, addedBy: 'system' },
    { upsert: true, new: true }
  );
  console.log(`[seed] Owner admin seeded: ${ownerId}`);
}

async function seedDemoRoadmap() {
  const count = await LevelReward.countDocuments();
  if (count > 0) return; // don't overwrite anything an admin has already configured

  const demo = [
    { level: 3, type: 'energy', amount: 20, titleI18n: { en: '+20 Energy', bn: '+২০ এনার্জি' } },
    { level: 5, type: 'lootbox', amount: 1, titleI18n: { en: 'Mystery Gift Box', bn: 'রহস্যময় গিফট বক্স' } },
    { level: 10, type: 'energy', amount: 50, titleI18n: { en: '+50 Energy', bn: '+৫০ এনার্জি' } },
    { level: 15, type: 'lootbox', amount: 1, titleI18n: { en: 'Holiday Gift Box', bn: 'হলিডে গিফট বক্স' } },
    { level: 25, type: 'energy', amount: 100, titleI18n: { en: '+100 Energy', bn: '+১০০ এনার্জি' } },
    // 'giveaway' left out of the demo — link it to a real Raffle from the
    // admin panel once you've created one (raffleId is required for it to work).
  ];

  await LevelReward.insertMany(demo);
  console.log(`[seed] Demo roadmap seeded (${demo.length} levels) — edit/replace from the Admin tab any time.`);
}

async function runSeed() {
  await seedOwner();
  await seedDemoRoadmap();
}

module.exports = runSeed;
