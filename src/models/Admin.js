const mongoose = require('mongoose');

// In-app managed admin list. The single isOwner:true document is seeded from
// ADMIN_IDS on first boot (src/seed.js) and can never be removed via the API
// — see src/routes/admin.js's admins routes.
const AdminSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true },
    isOwner: { type: Boolean, default: false },
    addedBy: { type: String, default: null },
    addedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Admin', AdminSchema);
