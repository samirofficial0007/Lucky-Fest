require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) console.error(`[config] Missing required env var: ${name}`);
  return v;
}

module.exports = {
  botToken: required('BOT_TOKEN'),
  mongodbUri: required('MONGODB_URI'),
  // ADMIN_IDS now only seeds the initial OWNER on first boot. Further admins
  // are managed in-app (Mini App Admin tab -> Admins) and stored in MongoDB,
  // because Render's free tier env vars can't be edited from inside the app.
  adminIds: (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || 'insecure_dev_secret_change_me',
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  dailyActionLimit: parseInt(process.env.DAILY_ACTION_LIMIT || '200', 10),
  actionCooldownMs: parseInt(process.env.ACTION_COOLDOWN_MS || '300', 10),
  supportedLanguages: ['en', 'zh', 'ru', 'ar', 'fr', 'pt', 'es', 'vi', 'bn'],
  // Energy economy
  energyCap: parseInt(process.env.ENERGY_CAP || '50', 10),
  energyRegenSeconds: parseInt(process.env.ENERGY_REGEN_SECONDS || '30', 10),
  energyRegenAmount: parseInt(process.env.ENERGY_REGEN_AMOUNT || '1', 10),
  // Used by the Telegram bot process to build the Mini App "Play" button.
  miniAppUrl: process.env.MINI_APP_URL || '',
};
