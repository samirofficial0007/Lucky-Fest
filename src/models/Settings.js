const mongoose = require('mongoose');

// Single-document collection for admin-configurable global settings.
const SettingsSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'main', unique: true },
    giveawayChannelLink: { type: String, default: null }, // shown as "Coming Soon" until an admin sets this
  },
  { timestamps: true }
);

SettingsSchema.statics.get = async function () {
  let doc = await this.findOne({ singleton: 'main' });
  if (!doc) doc = await this.create({ singleton: 'main' });
  return doc;
};

module.exports = mongoose.model('Settings', SettingsSchema);
