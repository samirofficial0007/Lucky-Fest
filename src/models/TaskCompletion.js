const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  telegramId: { type: String, required: true, index: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  status: { type: String, enum: ["started", "completed"], default: "started" },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null }
}, { timestamps: true });

schema.index({ telegramId: 1, taskId: 1 }, { unique: true });
module.exports = mongoose.model("TaskCompletion", schema);
