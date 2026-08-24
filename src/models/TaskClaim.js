const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, index: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true, index: true }
  },
  { timestamps: true }
);

schema.index({ telegramId: 1, taskId: 1 }, { unique: true });

module.exports = mongoose.model("TaskClaim", schema);
