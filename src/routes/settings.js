const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');

// GET /api/settings — public, read-only. Used by the Mini App to show the
// giveaway channel link (or "Coming Soon" if the admin hasn't set one yet).
router.get('/', async (req, res) => {
  const s = await Settings.get();
  res.json({ giveawayChannelLink: s.giveawayChannelLink || null });
});

module.exports = router;
