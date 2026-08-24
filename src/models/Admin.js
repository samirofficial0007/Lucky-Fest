const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    telegramId: { type: String, unique: true, required: true, index: true },
    role: { type: String, enum: ["owner", "admin"], default: "admin" },
    addedBy: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", schema);
