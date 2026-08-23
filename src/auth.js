const crypto = require("crypto");

function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculated = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  try {
    if (
      calculated.length !== hash.length ||
      !crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) {
    return null;
  }

  let user = {};
  try {
    user = JSON.parse(params.get("user") || "{}");
  } catch (_) {}

  return user;
}

module.exports = { verifyTelegramInitData };
