const config = require('../config');

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// Levels start at 0. Same increasing-threshold curve as before, just offset
// so a brand new player (0 XP) shows Level 0 instead of Level 1.
function levelForXp(xp) {
  let level = 0;
  let threshold = 100;
  let remaining = xp;
  while (remaining >= threshold) {
    remaining -= threshold;
    level += 1;
    threshold = Math.round(threshold * 1.25);
  }
  return level;
}

// Cosmetic-only "premium tier" band: 1-100 Classic, 101-200 Premium, 201-300
// Elite, then generic "Tier N" beyond. Purely visual — see public/app.js
// getLevelBadge(). No feature is ever gated behind this.
function levelBand(level) {
  if (level <= 100) return { name: 'Classic', tier: 1 };
  if (level <= 200) return { name: 'Premium', tier: 2 };
  if (level <= 300) return { name: 'Elite', tier: 3 };
  return { name: `Tier ${Math.floor((level - 1) / 100) + 1}`, tier: Math.floor((level - 1) / 100) + 1 };
}

function checkAndConsumeAction(user) {
  const now = new Date();
  const lastReset = user.actionsResetAt ? todayKey(user.actionsResetAt) : null;
  if (lastReset !== todayKey(now)) {
    user.actionsToday = 0;
    user.actionsResetAt = now;
  }
  if (user.actionsToday >= config.dailyActionLimit) {
    return { allowed: false, reason: 'daily_limit_reached' };
  }
  if (user.lastActionAt) {
    const elapsed = now.getTime() - user.lastActionAt.getTime();
    if (elapsed < config.actionCooldownMs) {
      return { allowed: false, reason: 'cooldown' };
    }
  }
  user.actionsToday += 1;
  user.lastActionAt = now;
  return { allowed: true };
}

function addXp(user, amount) {
  user.xp += Math.max(0, Math.floor(amount));
  user.level = levelForXp(user.xp);
}

module.exports = { levelForXp, levelBand, checkAndConsumeAction, addXp, todayKey };
