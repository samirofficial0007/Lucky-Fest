const config = require('../config');

/**
 * Must run AFTER telegramAuth. Rejects anyone whose verified Telegram ID
 * is not in the ADMIN_IDS allowlist (set in Render environment variables).
 * This is intentionally simple and server-side only — the admin panel UI
 * hides buttons for non-admins too, but the real gate is always here,
 * never in the frontend JS.
 */
function adminAuth(req, res, next) {
  const id = req.tgUser && String(req.tgUser.id);
  if (!id || !config.adminIds.includes(id)) {
    return res.status(403).json({ error: 'admin_only' });
  }
  next();
}

module.exports = adminAuth;
