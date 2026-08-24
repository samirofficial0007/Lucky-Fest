const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    telegramId: { type: String, unique: true, index: true, required: true },
    username: String,
    firstName: String,
    lastName: String,
    photoUrl: String,
    level: { type: Number, default: 1 },
    coins: { type: Number, default: 50 },
    usdt: { type: Number, default: 0 },
    claimedUsdt: { type: Number, default: 0 },
    referralIncome: { type: Number, default: 0 },
    referralCoins: { type: Number, default: 0 },
    withdrawnUsdt: { type: Number, default: 0 },
    referrerTelegramId: { type: String, default: null, index: true },
    referralCount: { type: Number, default: 0 },
    gifts: { type: Number, default: 1 },
    openedGifts: { type: Number, default: 0 },
    language: { type: String, default: "English" },
    theme: { type: String, enum: ["dark", "light"], default: "dark" },
    lastClaimAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: Date.now },
    lastCheckInAt: { type: Date, default: null },
    invitePosition: { type: Number, default: 0 },
    miningStartedAt: { type: Date, default: Date.now },
    isBlocked: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", schema);
