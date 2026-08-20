const mongoose = require('mongoose');

const BOARD_SIZE = 16; // 4x4 grid, matches public/app.js board rendering

const UserSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: '' },
    firstName: { type: String, default: '' },
    languageCode: { type: String, default: 'en' },

    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    energy: { type: Number, default: 100 }, // claimable "currency" used by roadmap/tasks rewards

    walletAddress: { type: String, default: null },
    walletConnectedAt: { type: Date, default: null },

    // Merge board: fixed-size array of cells. Each cell is either null (empty)
    // or a tier number 1-8 (see public/assets/items/gift_tierN.png).
    // Single item chain ("gift") for now — see README for extending to
    // multiple item types.
    board: { type: [Number], default: () => new Array(BOARD_SIZE).fill(null) },

    claimedLevelRewards: { type: [Number], default: [] }, // level numbers already claimed on the roadmap

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

UserSchema.statics.BOARD_SIZE = BOARD_SIZE;

module.exports = mongoose.model('User', UserSchema);
