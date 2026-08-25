const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    telegramId: { type: String, index: true, required: true },
    type: {
      type: String,
      enum: [
        "claim",
        "topup",
        "withdraw",
        "referral",
        "gift",
        "subscribe",
        "commission",
        "task",
        "checkin",
        "coins"
      ],
      required: true
    },
    amount: { type: Number, default: 0 },
    coins: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "completed", "rejected"],
      default: "completed"
    },
    note: String,
    meta: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);
