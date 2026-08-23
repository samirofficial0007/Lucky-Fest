const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    telegramId: { type: String, unique: true, index: true, required: true },
    lastSeenAt: { type: Date, index: true, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Presence", schema);
