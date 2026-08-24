const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: "" },
  type: { type: String, enum: ["channel_join", "bot_start", "website_visit"], required: true },
  target: { type: String, default: "" },
  url: { type: String, default: "" },
  rewardCoins: { type: Number, default: 0 },
  rewardUsdt: { type: Number, default: 0 },
  minVisitSeconds: { type: Number, default: 6 },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("Task", schema);
