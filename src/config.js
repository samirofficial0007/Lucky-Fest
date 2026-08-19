require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[config] Missing required env var: ${name}`);
  }
  return v;
}

module.exports = {
  botToken: required('BOT_TOKEN'),
  mongodbUri: required('MONGODB_URI'),
  adminIds: (process.env.ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || 'insecure_dev_secret_change_me',
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  dailyActionLimit: parseInt(process.env.DAILY_ACTION_LIMIT || '50', 10),
  actionCooldownMs: parseInt(process.env.ACTION_COOLDOWN_MS || '800', 10),
  supportedLanguages: ['en', 'zh', 'ru', 'ar', 'fr', 'pt', 'es', 'vi', 'bn'],
};
