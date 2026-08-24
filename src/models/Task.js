const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    rewardCoins: { type: Number, default: 10 },
    rewardUsdt: { type: Number, default: 0 },
    link: { type: String, default: "" },
    buttonText: { type: String, default: "Open" },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("Task", schema);
