const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    telegramId: { type: String, unique: true, required: true },
    lastSeenAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);
module.exports = mongoose.model("Presence", schema);
