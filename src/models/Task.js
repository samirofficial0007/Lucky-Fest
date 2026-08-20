const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    titleI18n: { type: Map, of: String, default: {} },
    type: { type: String, enum: ['link', 'daily_checkin', 'manual', 'invite'], default: 'link' },
    actionUrl: { type: String, default: '' },
    xpReward: { type: Number, default: 0 },
    energyReward: { type: Number, default: 10 }, // energy is uncapped on claim — see src/utils/energy.js
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', TaskSchema);
