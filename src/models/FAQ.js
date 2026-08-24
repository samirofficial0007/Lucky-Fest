const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    question: String,
    answer: String,
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);
module.exports = mongoose.model("FAQ", schema);
