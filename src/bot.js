const { Telegraf, Markup } = require("telegraf");
const User = require("./models/User");
const Transaction = require("./models/Transaction");
const Admin = require("./models/Admin");
const Task = require("./models/Task");

const INVITE_REWARDS = [50, 30, 20, 10, 10];

// Conversational state for multi-step commands (no timeout issues)
const sessions = new Map();

function getSession(id) {
  const key = String(id);
  if (!sessions.has(key)) sessions.set(key, {});
  return sessions.get(key);
}

function clearSession(id) {
  sessions.delete(String(id));
}

async function loadAdmins() {
  const set = new Set();
  if (process.env.ADMIN_CHAT_ID) set.add(String(process.env.ADMIN_CHAT_ID));
  try {
    const rows = await Admin.find({});
    rows.forEach((a) => set.add(String(a.telegramId)));
  } catch (_) {}
  return set;
}

function isOwner(id) {
  return String(id) === String(process.env.ADMIN_CHAT_ID || "");
}

async function isAdmin(id) {
  if (isOwner(id)) return true;
  const found = await Admin.findOne({ telegramId: String(id) });
  return !!found;
}

async function broadcastText(bot, text, extra = {}) {
  const users = await User.find({ isBlocked: { $ne: true } }).select("telegramId").lean();
  let ok = 0;
  let fail = 0;
  for (const u of users) {
    try {
      await bot.telegram.sendMessage(u.telegramId, text, extra);
      ok++;
    } catch (e) {
      fail++;
      if (e && (e.code === 403 || (e.response && e.response.error_code === 403))) {
        try {
          await User.updateOne({ telegramId: u.telegramId }, { isBlocked: true });
        } catch (_) {}
      }
    }
    // small delay to avoid flood limits
    if ((ok + fail) % 25 === 0) await new Promise((r) => setTimeout(r, 40));
  }
  return { ok, fail, total: users.length };
}

async function broadcastPhoto(bot, fileId, caption, extra = {}) {
  const users = await User.find({ isBlocked: { $ne: true } }).select("telegramId").lean();
  let ok = 0;
  let fail = 0;
  for (const u of users) {
    try {
      await bot.telegram.sendPhoto(u.telegramId, fileId, { caption, ...extra });
      ok++;
    } catch (e) {
      fail++;
      if (e && (e.code === 403 || (e.response && e.response.error_code === 403))) {
        try {
          await User.updateOne({ telegramId: u.telegramId }, { isBlocked: true });
        } catch (_) {}
      }
    }
    if ((ok + fail) % 25 === 0) await new Promise((r) => setTimeout(r, 40));
  }
  return { ok, fail, total: users.length };
}

function getBot() {
  const bot = new Telegraf(process.env.BOT_TOKEN);
  const appUrl = process.env.WEB_APP_URL || "https://example.com";
  const botName = process.env.BOT_NAME || "Assistant Bangladesh";

  // ---------- /start ----------
  bot.start(async (ctx) => {
    try {
      const tg = ctx.from;
      const payload = (ctx.startPayload || "").trim();
      let referrerId = null;
      if (payload.startsWith("ref_")) {
        referrerId = payload.replace("ref_", "").trim();
        if (referrerId === String(tg.id)) referrerId = null;
      }

      let user = await User.findOne({ telegramId: String(tg.id) });
      const isNew = !user;

      if (!user) {
        user = await User.create({
          telegramId: String(tg.id),
          username: tg.username,
          firstName: tg.first_name,
          lastName: tg.last_name,
          photoUrl: tg.photo_url || null,
          coins: 50,
          gifts: 1
        });
      } else {
        user.username = tg.username;
        user.firstName = tg.first_name;
        user.lastName = tg.last_name;
        if (tg.photo_url) user.photoUrl = tg.photo_url;
        user.lastSeenAt = new Date();
        user.isBlocked = false;
        await user.save();
      }

      if (isNew && referrerId) {
        const referrer = await User.findOne({ telegramId: referrerId });
        if (referrer) {
          const position = (referrer.referralCount || 0) + 1;
          const rewardCoins =
            INVITE_REWARDS[Math.min(position - 1, INVITE_REWARDS.length - 1)] || 10;

          user.referrerTelegramId = referrerId;
          user.invitePosition = position;
          await user.save();

          referrer.referralCount = position;
          referrer.gifts = (referrer.gifts || 0) + 1;
          referrer.referralCoins = (referrer.referralCoins || 0) + rewardCoins;
          referrer.coins = (referrer.coins || 0) + rewardCoins;
          await referrer.save();

          await Transaction.create({
            telegramId: referrer.telegramId,
            type: "referral",
            coins: rewardCoins,
            note: `Invite reward #${position}`,
            meta: { invited: String(tg.id), position }
          });
        }
      }

      const welcome =
        `🎉 Registration is almost complete! Open the app to launch your personal AI agent 🤖📈\n\n` +
        `💵 Top up your USDT balance to level up your agent and boost your daily income 🚀\n\n` +
        `👥 Invite partners and friends — earn generous rewards for their registrations and trading activity! 🎁✨`;

      await ctx.reply(welcome, {
        ...Markup.inlineKeyboard([
          [Markup.button.webApp("👉 [ Open Telegram App ] ➡️", appUrl)]
        ])
      });
    } catch (err) {
      console.error("Start error:", err);
      await ctx.reply("Something went wrong. Please try again.");
    }
  });

  // ---------- /help ----------
  bot.command("help", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) {
      return ctx.reply(
        "Use /start to open the Mini App.\nInside the app: Trade, Farm, Friends, Gifts, Tasks, Account."
      );
    }
    await ctx.reply(
      `🛠 Owner Command List\n\n` +
        `/start — Start the bot & welcome message\n` +
        `/help — This command list\n` +
        `/announcement — Broadcast a text message to all users\n` +
        `/announcementimage — Broadcast an image + text message to all users\n` +
        `/addadmin <telegramid> — Add a new admin (owner only)\n` +
        `/removeadmin <telegramid> — Remove an admin (owner only)\n` +
        `/stats — Bot user/admin statistics\n` +
        `/totalusers — Total users who have started the bot\n` +
        `/withdrawals — List pending withdrawal requests\n` +
        `/approvewithdraw <id> — Mark a withdrawal as sent\n` +
        `/rejectwithdraw <id> — Reject a withdrawal and refund the balance\n\n` +
        `ℹ️ Tasks are added/edited from the Mini App Tasks section.`
    );
  });

  bot.command("app", async (ctx) => {
    await ctx.reply(
      "Open your personal AI agent:",
      Markup.inlineKeyboard([[Markup.button.webApp("📲 Open Telegram App", appUrl)]])
    );
  });

  // ---------- /totalusers ----------
  bot.command("totalusers", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    const total = await User.countDocuments();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = await User.countDocuments({ createdAt: { $gte: startOfToday } });
    const last7 = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });
    await ctx.reply(
      `👥 Total users: ${total}\n` +
        `📅 Last 7 days: ${last7}\n` +
        `🟢 Today: ${today}`
    );
  });

  // ---------- /stats ----------
  bot.command("stats", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    const users = await User.countDocuments();
    const blocked = await User.countDocuments({ isBlocked: true });
    const pendingW = await Transaction.countDocuments({ type: "withdraw", status: "pending" });
    const pendingT = await Transaction.countDocuments({ type: "topup", status: "pending" });
    const completedW = await Transaction.countDocuments({ type: "withdraw", status: "completed" });
    const admins = await Admin.countDocuments();
    const tasks = await Task.countDocuments({ active: true });
    const giftsOpened = await Transaction.countDocuments({ type: "gift" });
    await ctx.reply(
      `📊 Bot Statistics\n\n` +
        `👥 Users: ${users} (blocked: ${blocked})\n` +
        `🛡 Admins: ${admins + (process.env.ADMIN_CHAT_ID ? 1 : 0)}\n` +
        `💸 Pending withdrawals: ${pendingW}\n` +
        `💰 Pending top-ups: ${pendingT}\n` +
        `✅ Completed withdrawals: ${completedW}\n` +
        `📋 Active tasks: ${tasks}\n` +
        `🎁 Gifts opened: ${giftsOpened}`
    );
  });

  // ---------- withdrawals ----------
  bot.command("withdrawals", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    const list = await Transaction.find({ type: "withdraw", status: "pending" })
      .sort({ createdAt: -1 })
      .limit(20);
    if (!list.length) return ctx.reply("No pending withdrawals.");
    const lines = list.map(
      (t) =>
        `ID: \`${t._id}\`\nUser: ${t.telegramId}\nAmount: ${t.amount} USDT\nWallet: ${(t.meta && t.meta.wallet) || "—"}\n---`
    );
    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  });

  bot.command("approvewithdraw", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    const id = (ctx.message.text.split(/\s+/)[1] || "").trim();
    if (!id) return ctx.reply("Usage: /approvewithdraw <id>");
    const tx = await Transaction.findById(id);
    if (!tx || tx.type !== "withdraw" || tx.status !== "pending") {
      return ctx.reply("Invalid or already processed.");
    }
    tx.status = "completed";
    await tx.save();
    try {
      await bot.telegram.sendMessage(
        tx.telegramId,
        `✅ Your withdrawal of ${tx.amount} USDT has been sent.`
      );
    } catch (_) {}
    await ctx.reply(`✅ Withdrawal ${id} marked as sent.`);
  });

  bot.command("rejectwithdraw", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    const id = (ctx.message.text.split(/\s+/)[1] || "").trim();
    if (!id) return ctx.reply("Usage: /rejectwithdraw <id>");
    const tx = await Transaction.findById(id);
    if (!tx || tx.type !== "withdraw" || tx.status !== "pending") {
      return ctx.reply("Invalid or already processed.");
    }
    const user = await User.findOne({ telegramId: tx.telegramId });
    if (user) {
      user.usdt = (user.usdt || 0) + tx.amount;
      user.withdrawnUsdt = Math.max(0, (user.withdrawnUsdt || 0) - tx.amount);
      await user.save();
    }
    tx.status = "rejected";
    await tx.save();
    try {
      await bot.telegram.sendMessage(
        tx.telegramId,
        `❌ Your withdrawal of ${tx.amount} USDT was rejected. Balance refunded.`
      );
    } catch (_) {}
    await ctx.reply(`❌ Withdrawal ${id} rejected. Balance refunded.`);
  });

  // ---------- admin manage ----------
  bot.command("addadmin", async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply("Owner only.");
    const id = (ctx.message.text.split(/\s+/)[1] || "").trim();
    if (!id) return ctx.reply("Usage: /addadmin <telegramid>");
    await Admin.findOneAndUpdate(
      { telegramId: String(id) },
      { telegramId: String(id), role: "admin", addedBy: String(ctx.from.id) },
      { upsert: true }
    );
    await ctx.reply(`✅ Admin added: ${id}`);
  });

  bot.command("removeadmin", async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply("Owner only.");
    const id = (ctx.message.text.split(/\s+/)[1] || "").trim();
    if (!id) return ctx.reply("Usage: /removeadmin <telegramid>");
    if (String(id) === String(process.env.ADMIN_CHAT_ID)) {
      return ctx.reply("Cannot remove the owner.");
    }
    await Admin.deleteOne({ telegramId: String(id) });
    await ctx.reply(`✅ Admin removed: ${id}`);
  });

  // ---------- /announcement (multi-step, no timeout) ----------
  bot.command("announcement", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    const session = getSession(ctx.from.id);
    session.mode = "announce_text";
    session.step = 1;
    session.data = {};
    await ctx.reply(
      "📢 Announcement mode\n\n" +
        "Step 1/3: Send the text message you want to broadcast.\n\n" +
        "Or type /cancel to abort."
    );
  });

  bot.command("announcementimage", async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    const session = getSession(ctx.from.id);
    session.mode = "announce_image";
    session.step = 1;
    session.data = {};
    await ctx.reply(
      "🖼 Image announcement mode\n\n" +
        "Step 1/4: Send the image (photo) you want to broadcast.\n\n" +
        "Or type /cancel to abort."
    );
  });

  bot.command("cancel", async (ctx) => {
    clearSession(ctx.from.id);
    await ctx.reply("Cancelled.");
  });

  // Handle multi-step replies
  bot.on("message", async (ctx, next) => {
    const session = getSession(ctx.from.id);
    if (!session.mode) return next();

    // ---- TEXT ANNOUNCEMENT FLOW ----
    if (session.mode === "announce_text") {
      if (!(await isAdmin(ctx.from.id))) {
        clearSession(ctx.from.id);
        return;
      }

      if (session.step === 1) {
        const text = (ctx.message.text || "").trim();
        if (!text || text.startsWith("/")) {
          return ctx.reply("Please send the announcement text (not a command).");
        }
        session.data.text = text;
        session.step = 2;
        return ctx.reply(
          "✅ Text saved.\n\n" +
            "Step 2/3: Do you want to add a button?\n\n" +
            "Send button name (e.g. Open App)\n" +
            "Or send: skip"
        );
      }

      if (session.step === 2) {
        const t = (ctx.message.text || "").trim();
        if (t.toLowerCase() === "skip") {
          session.data.btnName = null;
          session.step = 4; // skip url
        } else {
          session.data.btnName = t;
          session.step = 3;
          return ctx.reply(
            `✅ Button name: ${t}\n\n` +
              "Step 3/3: Send the button URL (https://...)\n" +
              "Or send: skip"
          );
        }
      }

      if (session.step === 3) {
        const t = (ctx.message.text || "").trim();
        if (t.toLowerCase() !== "skip" && /^https?:\/\//i.test(t)) {
          session.data.btnUrl = t;
        } else {
          session.data.btnName = null;
          session.data.btnUrl = null;
        }
        session.step = 4;
      }

      if (session.step === 4) {
        const { text, btnName, btnUrl } = session.data;
        clearSession(ctx.from.id);
        await ctx.reply("⏳ Broadcasting... please wait. Status will appear when done.");

        let extra = {};
        if (btnName && btnUrl) {
          extra = Markup.inlineKeyboard([[Markup.button.url(btnName, btnUrl)]]);
        }

        const result = await broadcastText(bot, text, extra);
        return ctx.reply(
          `✅ Broadcast complete\nSent: ${result.ok}\nFailed: ${result.fail}\nTotal: ${result.total}`
        );
      }
      return;
    }

    // ---- IMAGE ANNOUNCEMENT FLOW ----
    if (session.mode === "announce_image") {
      if (!(await isAdmin(ctx.from.id))) {
        clearSession(ctx.from.id);
        return;
      }

      if (session.step === 1) {
        const photo = ctx.message.photo;
        if (!photo || !photo.length) {
          return ctx.reply("Please send a photo.");
        }
        session.data.fileId = photo[photo.length - 1].file_id;
        session.step = 2;
        return ctx.reply(
          "✅ Image saved.\n\n" +
            "Step 2/4: Send the caption / message text.\n" +
            "Or send: skip"
        );
      }

      if (session.step === 2) {
        const t = (ctx.message.text || "").trim();
        session.data.caption = t.toLowerCase() === "skip" ? "" : t;
        session.step = 3;
        return ctx.reply(
          "✅ Caption saved.\n\n" +
            "Step 3/4: Button name? (e.g. Open App)\n" +
            "Or send: skip"
        );
      }

      if (session.step === 3) {
        const t = (ctx.message.text || "").trim();
        if (t.toLowerCase() === "skip") {
          session.data.btnName = null;
          session.step = 5;
        } else {
          session.data.btnName = t;
          session.step = 4;
          return ctx.reply(
            `✅ Button name: ${t}\n\n` +
              "Step 4/4: Send button URL (https://...)\n" +
              "Or send: skip"
          );
        }
      }

      if (session.step === 4) {
        const t = (ctx.message.text || "").trim();
        if (t.toLowerCase() !== "skip" && /^https?:\/\//i.test(t)) {
          session.data.btnUrl = t;
        } else {
          session.data.btnName = null;
          session.data.btnUrl = null;
        }
        session.step = 5;
      }

      if (session.step === 5) {
        const { fileId, caption, btnName, btnUrl } = session.data;
        clearSession(ctx.from.id);
        await ctx.reply("⏳ Broadcasting image... please wait.");

        let extra = {};
        if (btnName && btnUrl) {
          extra = Markup.inlineKeyboard([[Markup.button.url(btnName, btnUrl)]]);
        }

        const result = await broadcastPhoto(bot, fileId, caption || undefined, extra);
        return ctx.reply(
          `✅ Image broadcast complete\nSent: ${result.ok}\nFailed: ${result.fail}\nTotal: ${result.total}`
        );
      }
      return;
    }

    return next();
  });

  bot.catch((err) => console.error("Bot error:", err));
  return bot;
}

async function startBot() {
  if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN is missing");
  const bot = getBot();
  global.botInstance = bot;
  await bot.launch({ dropPendingUpdates: true });
  console.log("Telegram bot started");

  // Daily check-in broadcast at ~09:00 UTC (simple interval check every hour)
  setInterval(async () => {
    try {
      const now = new Date();
      if (now.getUTCHours() !== 9 || now.getUTCMinutes() > 5) return;
      // prevent double-send same day
      if (global._lastCheckInDay === now.toISOString().slice(0, 10)) return;
      global._lastCheckInDay = now.toISOString().slice(0, 10);

      const appUrl = process.env.WEB_APP_URL || "";
      const text =
        `☀️ Daily Check-in\n\n` +
        `Open the Mini App and claim your farm profit today!\n` +
        `Invite friends & open gifts to grow faster. 🚀`;

      const extra = appUrl
        ? Markup.inlineKeyboard([[Markup.button.webApp("📲 Open App", appUrl)]])
        : {};

      const users = await User.find({ isBlocked: { $ne: true } }).select("telegramId").lean();
      let ok = 0;
      for (const u of users) {
        try {
          await bot.telegram.sendMessage(u.telegramId, text, extra);
          ok++;
        } catch (_) {}
        if (ok % 25 === 0) await new Promise((r) => setTimeout(r, 40));
      }
      console.log(`Daily check-in sent to ${ok} users`);
    } catch (e) {
      console.error("Daily check-in error", e.message);
    }
  }, 60 * 1000);

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
  return bot;
}

module.exports = { startBot, isOwner, isAdmin };
