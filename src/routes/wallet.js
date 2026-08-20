const express = require('express');
const router = express.Router();
const telegramAuth = require('../middleware/telegramAuth');

// A minimal TON address sanity check (not a full checksum validator).
// Good enough to reject obvious garbage before saving.
function looksLikeTonAddress(addr) {
  if (typeof addr !== 'string') return false;
  // raw form 0:hex... or user-friendly base64url form, roughly 48 chars
  return /^(0:[0-9a-fA-F]{64}|[A-Za-z0-9_-]{48})$/.test(addr.trim());
}

// POST /api/wallet/connect  { address }
// The actual "connect" handshake (signature, proof) happens client-side via
// the TON Connect SDK against the user's wallet app. This endpoint just
// records the resulting address against the verified Telegram user —
// it never asks for or touches private keys/seed phrases.
router.post('/connect', telegramAuth, async (req, res) => {
  const { address } = req.body;
  if (!looksLikeTonAddress(address)) {
    return res.status(400).json({ error: 'invalid_address' });
  }
  req.dbUser.walletAddress = address.trim();
  req.dbUser.walletConnectedAt = new Date();
  await req.dbUser.save();
  res.json({ ok: true, walletAddress: req.dbUser.walletAddress });
});

router.post('/disconnect', telegramAuth, async (req, res) => {
  req.dbUser.walletAddress = null;
  req.dbUser.walletConnectedAt = null;
  await req.dbUser.save();
  res.json({ ok: true });
});

module.exports = router;
