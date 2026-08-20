const mongoose = require('mongoose');

const RaffleSchema = new mongoose.Schema(
  {
    titleI18n: { type: Map, of: String, default: {} },
    prizeDescriptionI18n: { type: Map, of: String, default: {} },
    minLevel: { type: Number, default: 1 }, // eligibility gate
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true },
    winnersCount: { type: Number, default: 1 },
    status: { type: String, enum: ['open', 'closed', 'drawn'], default: 'open' },

    // entries: one per eligible user, weight can scale with level if desired
    entries: [
      {
        telegramId: String,
        weight: { type: Number, default: 1 },
        enteredAt: { type: Date, default: Date.now },
      },
    ],

    // server-generated, verifiable-ish randomness seed logged for transparency
    drawSeed: { type: String, default: null },
    winners: [
      {
        telegramId: String,
        prizeLabel: String,
      },
    ],
    drawnAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Raffle', RaffleSchema);
