const crypto = require("crypto");

function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");
    const entries = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");
    const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculated = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
    if (calculated !== hash) return null;
    const userRaw = params.get("user");
    if (!userRaw) return null;
    const user = JSON.parse(userRaw);
    // Optional: check auth_date freshness (24h)
    const authDate = Number(params.get("auth_date") || 0);
    if (authDate && Date.now() / 1000 - authDate > 86400) return null;
    return user;
  } catch (e) {
    return null;
  }
}

module.exports = { verifyTelegramInitData };
