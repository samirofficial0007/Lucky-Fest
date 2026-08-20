const mongoose = require('mongoose');

const BOARD_SIZE = 16;
// Cells 12-15 (the bottom row) start LOCKED, marked with -1 (distinct from
// null="empty but fillable"). They unlock via friend invites — see
// src/routes/friends.js and FRIEND_UNLOCK_THRESHOLDS in src/utils/gifts.js.
const LOCKED_CELL_INDICES = [12, 13, 14, 15];

const UserSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: '' },
    firstName: { type: String, default: '' },
    languageCode: { type: String, default: 'en' },

    level: { type: Number, default: 0 }, // levels now start at 0
    xp: { type: Number, default: 0 },

    energy: { type: Number, default: 50 },
    energyUpdatedAt: { type: Date, default: Date.now },

    walletAddress: { type: String, default: null },
    walletConnectedAt: { type: Date, default: null },

    // -1 = locked, null = empty/fillable, 1-8 = tier occupying the cell
    board: { type: [Number], default: () => {
      const b = new Array(BOARD_SIZE).fill(null);
      LOCKED_CELL_INDICES.forEach((i) => (b[i] = -1));
      return b;
    } },
    unlockedExtraCells: { type: [Number], default: [] }, // which locked indices have been unlocked already

    claimedLevelRewards: { type: [Number], default: [] },

    // --- Referrals ---
    invitedCount: { type: Number, default: 0 },
    referredBy: { type: String, default: null }, // telegramId of whoever invited this user (set once, never changed)

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
UserSchema.statics.LOCKED_CELL_INDICES = LOCKED_CELL_INDICES;

module.exports = mongoose.model('User', UserSchema);
