// 12-tier gift chain (tier 1 = most common, tier 12 = legendary). Weighted
// heavily toward low tiers so pulling a high one feels special. Tune these
// numbers directly, or wire up an admin % editor later (kept out of scope
// for this pass — see README).
const GET_GIFT_WEIGHTS = [
  { tier: 1, weight: 32 },
  { tier: 2, weight: 22 },
  { tier: 3, weight: 15 },
  { tier: 4, weight: 11 },
  { tier: 5, weight: 8 },
  { tier: 6, weight: 5 },
  { tier: 7, weight: 3 },
  { tier: 8, weight: 2 },
  { tier: 9, weight: 1.2 },
  { tier: 10, weight: 0.5 },
  { tier: 11, weight: 0.2 },
  { tier: 12, weight: 0.1 },
];

const MAX_TIER = 12;

function pickRandomTier() {
  const total = GET_GIFT_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let roll = Math.random() * total;
  for (const w of GET_GIFT_WEIGHTS) {
    if (roll < w.weight) return w.tier;
    roll -= w.weight;
  }
  return 1;
}

// XP for merging into the given resulting tier — bigger merges are worth more.
function xpForMergeTier(resultTier) {
  return resultTier * 5;
}

// Friend-invite thresholds to unlock each of the 4 locked bottom-row cells.
// Keyed by board index (12-15, matching User.LOCKED_CELL_INDICES).
const FRIEND_UNLOCK_THRESHOLDS = { 12: 1, 13: 3, 14: 5, 15: 10 };

// Guaranteed-minimum tier when a locked cell unlocks via friend invites —
// meant to feel like a real reward, not another common pull.
function unlockRewardTier() {
  return Math.max(pickRandomTier(), 8);
}

module.exports = { GET_GIFT_WEIGHTS, MAX_TIER, pickRandomTier, xpForMergeTier, FRIEND_UNLOCK_THRESHOLDS, unlockRewardTier };
