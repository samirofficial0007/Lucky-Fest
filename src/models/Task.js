const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // e.g. "join_channel"
    titleI18n: { type: Map, of: String, default: {} }, // { en: "Join our channel", bn: "..." }
    type: { type: String, enum: ['link', 'daily_checkin', 'manual', 'invite'], default: 'link' },
    actionUrl: { type: String, default: '' },
    xpReward: { type: Number, default: 10 },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', TaskSchema);
