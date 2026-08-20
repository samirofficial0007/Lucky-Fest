const crypto = require('crypto');

/**
 * Deterministic-from-seed weighted random pick, without replacement.
 * The seed is generated once at draw time and stored on the Raffle document
 * so admins/users could, in principle, recompute the draw and verify it
 * wasn't tampered with after the fact (a lightweight fairness measure —
 * not a cryptographic commit-reveal scheme, but far better than an
 * un-auditable Math.random() pick with no record).
 */
function seededRandom(seed) {
  let h = crypto.createHash('sha256').update(seed).digest();
  let i = 0;
  return function next() {
    if (i >= h.length - 4) {
      h = crypto.createHash('sha256').update(h).digest();
      i = 0;
    }
    const val = h.readUInt32BE(i) / 0xffffffff;
    i += 4;
    return val;
  };
}

function pickWeightedWinners(entries, count, seed) {
  const rand = seededRandom(seed);
  const pool = entries.map((e) => ({ ...e, ticket: rand() * (e.weight || 1) }));
  pool.sort((a, b) => b.ticket - a.ticket);
  return pool.slice(0, count);
}

function generateSeed() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = { pickWeightedWinners, generateSeed };
