const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    rewardCoins: { type: Number, default: 10 },
    rewardUsdt: { type: Number, default: 0 },
    link: { type: String, default: "" },
    buttonText: { type: String, default: "Open" },
    // bot | channel | partner_channel | partner_bot | official_channel | official_bot | unique
    taskType: {
      type: String,
      enum: [
        "bot",
        "channel",
        "partner_channel",
        "partner_bot",
        "official_channel",
        "official_bot",
        "unique"
      ],
      default: "channel"
    },
    // telegram | star | gift | link
    icon: { type: String, default: "telegram" },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("Task", schema);
