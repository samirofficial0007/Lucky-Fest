// Weighted probability table for "Get Gift" spawns — mostly low tiers, rare
// high tiers. Tune these numbers directly, or wire up an admin UI for it
// later (kept out of this pass to stay in scope — see README).
const GET_GIFT_WEIGHTS = [
  { tier: 1, weight: 60 },
  { tier: 2, weight: 25 },
  { tier: 3, weight: 10 },
  { tier: 4, weight: 4 },
  { tier: 5, weight: 1 },
];

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

module.exports = { GET_GIFT_WEIGHTS, pickRandomTier, xpForMergeTier, FRIEND_UNLOCK_THRESHOLDS };
