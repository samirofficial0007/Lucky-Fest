// Channel-join gate: settings model + bot admin commands + API (popup check)
const express = require("express");
const mongoose = require("mongoose");
const { verifyTelegramInitData } = require("./auth");

/* ---------- Model ---------- */
const schema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "channelGate" },
    enabled: { type: Boolean, default: true },
    channels: [
      {
        chatId: String,
        username: String,
        title: String,
        url: String,
        type: String
      }
    ]
  },
  { timestamps: true }
);
const GateSetting = mongoose.models.ChannelGate || mongoose.model("ChannelGate", schema);

async function getSettings() {
  let doc = await GateSetting.findOne({ key: "channelGate" });
  if (!doc) doc = await GateSetting.create({ key: "channelGate", enabled: true, channels: [] });
  return doc;
}

/* ---------- Membership check ---------- */
const okCache = new Map(); // "userId:chatId" -> expiry ts (only positive results)
const CACHE_MS = 2 * 60 * 1000;

function isMemberStatus(m) {
  if (!m) return false;
  if (["creator", "administrator", "member"].includes(m.status)) return true;
  if (m.status === "restricted" && m.is_member) return true;
  return false;
}

async function isJoined(userId, ch, fresh) {
  const key = userId + ":" + ch.chatId;
  if (!fresh) {
    const exp = okCache.get(key);
    if (exp && exp > Date.now()) return true;
  }
  const bot = global.botInstance;
  if (!bot) return true; // bot not ready yet -> don't lock users
  try {
    const m = await bot.telegram.getChatMember(ch.chatId, Number(userId));
    const ok = isMemberStatus(m);
    if (ok) okCache.set(key, Date.now() + CACHE_MS);
    else okCache.delete(key);
    return ok;
  } catch (e) {
    // Bot lost admin rights / chat inaccessible -> fail open so users are not locked forever
    console.error("[gate] getChatMember failed for", ch.username || ch.chatId, "-", e.message);
    return true;
  }
}

async function getMissing(userId, fresh) {
  const s = await getSettings();
  if (!s.enabled || !s.channels.length) return { enabled: false, missing: [] };
  const results = await Promise.all(
    s.channels.map(async (ch) => ({ ch, ok: await isJoined(userId, ch, fresh) }))
  );
  return {
    enabled: true,
    missing: results.filter((r) => !r.ok).map((r) => r.ch)
  };
}

function publicChannel(ch) {
  return {
    username: ch.username ? "@" + ch.username : "",
    title: ch.title || ch.username || "Channel",
    url: ch.url || (ch.username ? "https://t.me/" + ch.username : "")
  };
}

/* ---------- API ---------- */
const gateRouter = express.Router();

gateRouter.get("/api/channel-gate", async (req, res) => {
  try {
    const initData = req.headers["x-telegram-init-data"];
    const tgUser = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
    if (!tgUser) return res.json({ required: false, channels: [] });
    const fresh = req.query.fresh === "1";
    const { missing } = await getMissing(String(tgUser.id), fresh);
    res.json({ required: missing.length > 0, channels: missing.map(publicChannel) });
  } catch (e) {
    console.error("[gate] api error", e.message);
    res.json({ required: false, channels: [] });
  }
});

// Block money/reward actions until user joined (cannot be bypassed from the browser)
const GUARDED = new Set([
  "/api/claim",
  "/api/withdraw",
  "/api/topup",
  "/api/gift/open",
  "/api/tasks/claim"
]);

async function gateGuard(req, res, next) {
  try {
    if (req.method !== "POST" || !GUARDED.has(req.path)) return next();
    const tgUser = verifyTelegramInitData(req.headers["x-telegram-init-data"], process.env.BOT_TOKEN);
    if (!tgUser) return next(); // normal auth will handle it
    const { missing } = await getMissing(String(tgUser.id), false);
    if (missing.length) {
      return res.status(403).json({ error: "Please join our channel first", gate: true });
    }
    next();
  } catch (e) {
    next();
  }
}

/* ---------- Bot commands ---------- */
function parseChannelInput(raw) {
  let t = String(raw || "").trim();
  if (!t) return null;
  t = t.replace(/^https?:\/\//i, "").replace(/^(www\.)?(t|telegram)\.me\//i, "");
  if (/^(\+|joinchat|c\/)/i.test(t)) return { error: "private" };
  t = t.split(/[/?]/)[0].replace(/^@/, "");
  if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(t)) return null;
  return { username: t };
}

function renderList(s) {
  const head = "Channel join popup: " + (s.enabled ? "ON" : "OFF");
  if (!s.channels.length) return head + "\n\nNo channels added yet.";
  const lines = s.channels.map((c, i) => `${i + 1}. @${c.username}`);
  return head + "\n\n" + lines.join("\n");
}

function registerGateCommands(bot, isAdmin) {
  // /channeljoinpopupshow @username  (or t.me link)
  bot.command("channeljoinpopupshow", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    const arg = ctx.message.text.split(/\s+/)[1];
    if (!arg) {
      return ctx.reply(
        "Usage: /channeljoinpopupshow @channelusername\nor: /channeljoinpopupshow https://t.me/channelusername\n\n" +
          "Bot must be an admin in that channel/group."
      );
    }
    const parsed = parseChannelInput(arg);
    if (!parsed) return ctx.reply("❌ Invalid channel username or link.");
    if (parsed.error === "private") {
      return ctx.reply("❌ Private invite links are not supported. Use a public @username or https://t.me/username link.");
    }

    let chat;
    try {
      chat = await ctx.telegram.getChat("@" + parsed.username);
    } catch (e) {
      return ctx.reply("❌ Channel/group not found. Check the username and make sure it is public.");
    }
    if (!["channel", "supergroup", "group"].includes(chat.type)) {
      return ctx.reply("❌ This is not a channel or group.");
    }

    try {
      const me = await ctx.telegram.getMe();
      const mem = await ctx.telegram.getChatMember(chat.id, me.id);
      if (mem.status !== "administrator" && mem.status !== "creator") {
        return ctx.reply(
          `❌ Bot is not an admin in @${parsed.username}.\nAdd the bot as admin there first, then send the command again.`
        );
      }
    } catch (e) {
      return ctx.reply(
        `❌ Bot cannot access @${parsed.username}.\nAdd the bot as admin there first, then send the command again.`
      );
    }

    const s = await getSettings();
    const exists = s.channels.find((c) => String(c.chatId) === String(chat.id));
    if (exists) {
      s.enabled = true;
      await s.save();
      return ctx.reply("ℹ️ Already in the list.\n\n" + renderList(s));
    }
    s.channels.push({
      chatId: String(chat.id),
      username: chat.username || parsed.username,
      title: chat.title || parsed.username,
      url: "https://t.me/" + (chat.username || parsed.username),
      type: chat.type
    });
    s.enabled = true;
    await s.save();
    await ctx.reply("✅ Added @" + (chat.username || parsed.username) + "\n\n" + renderList(s));
  });

  // /removechannel <number>
  bot.command("removechannel", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    const s = await getSettings();
    const arg = ctx.message.text.split(/\s+/)[1];
    if (!s.channels.length) return ctx.reply("No channels in the list.");
    const n = parseInt(arg, 10);
    if (!arg || !Number.isInteger(n) || n < 1 || n > s.channels.length) {
      return ctx.reply(renderList(s) + "\n\nUsage: /removechannel <number>\nExample: /removechannel 2");
    }
    const [removed] = s.channels.splice(n - 1, 1);
    await s.save();
    await ctx.reply("🗑 Removed @" + removed.username + "\n\n" + renderList(s));
  });

  // /channeljoinlist
  bot.command("channeljoinlist", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    const s = await getSettings();
    await ctx.reply(renderList(s));
  });

  // /noneedchanneljoin  -> popup OFF
  bot.command("noneedchanneljoin", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    const s = await getSettings();
    s.enabled = false;
    await s.save();
    await ctx.reply(
      "✅ Channel join popup: OFF\nUsers can use the bot without joining any channel.\n\n" +
        "Your channel list is saved. Send /channeljoinpopupshow @username to turn it ON again."
    );
  });
}

module.exports = { gateRouter, gateGuard, registerGateCommands };
