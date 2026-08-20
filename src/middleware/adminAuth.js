const Admin = require('../models/Admin');

// DB-backed admin check (replaces the old static ADMIN_IDS-only check) so
// the owner can add/remove admins from inside the Mini App without a
// redeploy. Attaches req.isOwner for routes that need owner-only guards
// (adding/removing admins).
async function adminAuth(req, res, next) {
  const id = req.tgUser && String(req.tgUser.id);
  if (!id) return res.status(403).json({ error: 'admin_only' });

  const admin = await Admin.findOne({ telegramId: id });
  if (!admin) return res.status(403).json({ error: 'admin_only' });

  req.isOwner = admin.isOwner;
  next();
}

module.exports = adminAuth;
