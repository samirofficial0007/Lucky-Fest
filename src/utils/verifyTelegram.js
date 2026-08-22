const crypto = require('crypto');
const config = require('../config');

/**
 * Verifies Telegram Mini App initData according to the official algorithm:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * This is the single most important anti-cheat gate in the whole app:
 * every privileged action (claiming XP, claiming a task, entering a raffle,
 * connecting a wallet) must come through a request that carries a FRESH,
 * VALID initData string. Never trust a telegramId sent in a plain JSON body
 * without this check — that is trivially spoofable from the browser console.
 */
function verifyInitData(initData, maxAgeSeconds = 86400) {
  if (!initData || typeof initData !== 'string') {
    return { valid: false, reason: 'missing_init_data' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { valid: false, reason: 'missing_hash' };

  params.delete('hash');

  const dataCheckArr = [];
  for (const [key, value] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(config.botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) {
    return { valid: false, reason: 'bad_hash' };
  }

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > maxAgeSeconds || ageSeconds < -60) {
    return { valid: false, reason: 'stale_init_data' };
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch (e) {
    return { valid: false, reason: 'bad_user_json' };
  }
  if (!user || !user.id) return { valid: false, reason: 'missing_user' };

  return { valid: true, user };
}

module.exports = { verifyInitData };
