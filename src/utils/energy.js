const config = require('../config');

// Passive energy regen: +energyRegenAmount every energyRegenSeconds, capped
// at energyCap. Leftover partial-tick time is preserved (energyUpdatedAt only
// advances by the number of whole ticks consumed) so short requests don't
// lose accumulated progress. Rewards (tasks/roadmap) add energy separately
// and are allowed to exceed the cap — this function never reduces energy,
// only adds up to the cap.
function applyEnergyRegen(user) {
  const now = Date.now();
  const last = user.energyUpdatedAt ? user.energyUpdatedAt.getTime() : now;
  const elapsedMs = now - last;
  const tickMs = config.energyRegenSeconds * 1000;
  const ticks = Math.floor(elapsedMs / tickMs);

  if (ticks <= 0) return false;

  if (user.energy < config.energyCap) {
    user.energy = Math.min(config.energyCap, user.energy + ticks * config.energyRegenAmount);
  }
  user.energyUpdatedAt = new Date(last + ticks * tickMs);
  return true;
}

module.exports = { applyEnergyRegen };
