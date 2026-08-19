const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: '' },
    firstName: { type: String, default: '' },
    languageCode: { type: String, default: 'en' },

    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },

    walletAddress: { type: String, default: null },
    walletConnectedAt: { type: Date, default: null },

    inventory: [
      {
        itemKey: String,
        tier: Number,
        qty: { type: Number, default: 1 },
      },
    ],

    // --- Anti-cheat / rate-limit bookkeeping (server authoritative) ---
    actionsToday: { type: Number, default: 0 },
    actionsResetAt: { type: Date, default: Date.now },
    lastActionAt: { type: Date, default: null },

    banned: { type: Boolean, default: false },
    banReason: { type: String, default: '' },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
