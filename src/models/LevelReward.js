const mongoose = require('mongoose');

// Admin-configured reward roadmap: "at level N, give the player X".
// Rendered as the vertical timeline in the Mini App's Roadmap tab.
const LevelRewardSchema = new mongoose.Schema(
  {
    level: { type: Number, required: true, unique: true, index: true },
    type: {
      type: String,
      enum: ['energy', 'lootbox', 'giveaway'],
      required: true,
    },
    // energy: amount = how much energy to grant
    // lootbox: amount = how many random items to grant (usually 1)
    // giveaway: raffleId = which Raffle document this level unlocks entry to
    amount: { type: Number, default: 0 },
    raffleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Raffle', default: null },
    titleI18n: { type: Map, of: String, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LevelReward', LevelRewardSchema);
