const mongoose = require('mongoose');

const UserTaskSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, index: true },
    taskKey: { type: String, required: true },
    completedAt: { type: Date, default: Date.now },
    // for daily_checkin tasks we store the calendar day string (YYYY-MM-DD)
    // so a user can only claim once per day, server-side enforced.
    dayKey: { type: String, default: null },
  },
  { timestamps: true }
);

UserTaskSchema.index({ telegramId: 1, taskKey: 1, dayKey: 1 }, { unique: true });

module.exports = mongoose.model('UserTask', UserTaskSchema);
