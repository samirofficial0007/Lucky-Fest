const config = require('../config');

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/**
 * XP curve: simple increasing threshold. Tune freely; keeping it server-side
 * only means the client can never award itself levels directly.
 */
function levelForXp(xp) {
  let level = 1;
  let threshold = 100;
  let remaining = xp;
  while (remaining >= threshold) {
    remaining -= threshold;
    level += 1;
    threshold = Math.round(threshold * 1.25);
  }
  return level;
}

/**
 * Anti-cheat gate every action-that-earns-reward should call BEFORE
 * granting anything. Enforces:
 *  - per-action cooldown (blocks bots hammering the endpoint)
 *  - daily action cap (blocks farming via scripted loops)
 * Returns { allowed: boolean, reason?: string }
 */
function checkAndConsumeAction(user) {
  const now = new Date();

  // Reset the daily counter if we've crossed into a new UTC day.
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

module.exports = { levelForXp, checkAndConsumeAction, addXp, todayKey };
