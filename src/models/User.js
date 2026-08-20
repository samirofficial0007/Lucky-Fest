const mongoose = require('mongoose');

const BOARD_SIZE = 16;

const UserSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: '' },
    firstName: { type: String, default: '' },
    languageCode: { type: String, default: 'en' },

    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },

    // Energy: passively regenerates up to config.energyCap (see src/utils/energy.js),
    // but task/roadmap reward claims can push it ABOVE the cap freely — the cap
    // only throttles passive regen, not earned rewards.
    energy: { type: Number, default: 50 },
    energyUpdatedAt: { type: Date, default: Date.now },

    walletAddress: { type: String, default: null },
    walletConnectedAt: { type: Date, default: null },

    board: { type: [Number], default: () => new Array(BOARD_SIZE).fill(null) },
    claimedLevelRewards: { type: [Number], default: [] },

    actionsToday: { type: Number, default: 0 },
    actionsResetAt: { type: Date, default: Date.now },
    lastActionAt: { type: Date, default: null },

    banned: { type: Boolean, default: false },
    banReason: { type: String, default: '' },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

UserSchema.statics.BOARD_SIZE = BOARD_SIZE;

module.exports = mongoose.model('User', UserSchema);
