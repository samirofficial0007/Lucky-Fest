const { Telegraf, Markup } = require("telegraf");
const User = require("./models/User");
const Transaction = require("./models/Transaction");

const INVITE_REWARDS = [50, 30, 20, 10, 10];

// Simple in-memory admin set; also allow ADMIN_CHAT_ID from env as owner
const adminIds = new Set();

function isOwner(id) {
  return String(id) === String(process.env.ADMIN_CHAT_ID || "");
}

function isAdmin(id) {
  return isOwner(id) || adminIds.has(String(id));
}

function getBot() {
  const bot = new Telegraf(process.env.BOT_TOKEN);
  const appUrl = process.env.WEB_APP_URL || "https://example.com";
  const botName = process.env.BOT_NAME || "NOVUM.AI Agent";

  if (process.env.ADMIN_CHAT_ID) {
    adminIds.add(String(process.env.ADMIN_CHAT_ID));
  }

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
          photoUrl: tg.photo_url || null
        });
      } else {
        user.username = tg.username;
        user.firstName = tg.first_name;
        user.lastName = tg.last_name;
        if (tg.photo_url) user.photoUrl = tg.photo_url;
        user.lastSeenAt = new Date();
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

  bot.command("help", async (ctx) => {
    if (isAdmin(ctx.from.id)) {
      await ctx.reply(
        `🛠 Owner Command List\n\n` +
          `/start — Start the bot\n` +
          `/help — This command list\n` +
          `/announcement — Broadcast text to all users\n` +
          `/announcementimage — Broadcast image + text\n` +
          `/addadmin <telegramid> — Add admin (owner only)\n` +
          `/removeadmin <telegramid> — Remove admin (owner only)\n` +
          `/stats — User/admin statistics\n` +
          `/totalusers — Total users\n` +
          `/withdrawals — Pending withdrawals\n` +
          `/approvewithdraw <id> — Mark withdrawal sent\n` +
          `/rejectwithdraw <id> — Reject & refund\n\n` +
          `ℹ️ Tasks are managed from the Mini App.`
      );
    } else {
      await ctx.reply(
        "Use /start to open the Mini App.\nInside the app: balance, farm, referrals, gifts."
      );
    }
  });

  bot.command("app", async (ctx) => {
    await ctx.reply(
      "Open your personal AI agent:",
      Markup.inlineKeyboard([[Markup.button.webApp("📲 Open Telegram App", appUrl)]])
    );
  });

  bot.command("totalusers", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const n = await User.countDocuments();
    await ctx.reply(`👥 Total users: ${n}`);
  });

  bot.command("stats", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const users = await User.countDocuments();
    const pending = await Transaction.countDocuments({ type: "withdraw", status: "pending" });
    const topups = await Transaction.countDocuments({ type: "topup", status: "pending" });
    await ctx.reply(
      `📊 Stats\nUsers: ${users}\nPending withdrawals: ${pending}\nPending top-ups: ${topups}\nAdmins: ${adminIds.size}`
    );
  });

  bot.command("withdrawals", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const list = await Transaction.find({ type: "withdraw", status: "pending" })
      .sort({ createdAt: -1 })
      .limit(20);
    if (!list.length) return ctx.reply("No pending withdrawals.");
    const lines = list.map(
      (t) =>
        `ID: ${t._id}\nUser: ${t.telegramId}\nAmount: ${t.amount} USDT\nWallet: ${(t.meta && t.meta.wallet) || "—"}\n---`
    );
    await ctx.reply(lines.join("\n"));
  });

  bot.command("approvewithdraw", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const id = (ctx.message.text.split(" ")[1] || "").trim();
    if (!id) return ctx.reply("Usage: /approvewithdraw <id>");
    const tx = await Transaction.findById(id);
    if (!tx || tx.type !== "withdraw" || tx.status !== "pending") {
      return ctx.reply("Invalid or already processed.");
    }
    tx.status = "completed";
    await tx.save();
    await ctx.reply(`✅ Withdrawal ${id} marked as sent.`);
  });

  bot.command("rejectwithdraw", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const id = (ctx.message.text.split(" ")[1] || "").trim();
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
    await ctx.reply(`❌ Withdrawal ${id} rejected. Balance refunded.`);
  });

  bot.command("addadmin", async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply("Owner only.");
    const id = (ctx.message.text.split(" ")[1] || "").trim();
    if (!id) return ctx.reply("Usage: /addadmin <telegramid>");
    adminIds.add(String(id));
    await ctx.reply(`Admin added: ${id}`);
  });

  bot.command("removeadmin", async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply("Owner only.");
    const id = (ctx.message.text.split(" ")[1] || "").trim();
    if (!id) return ctx.reply("Usage: /removeadmin <telegramid>");
    adminIds.delete(String(id));
    await ctx.reply(`Admin removed: ${id}`);
  });

  // /announcement <text>
  bot.command("announcement", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const text = ctx.message.text.replace(/^\/announcement(@\w+)?\s*/, "").trim();
    if (!text) return ctx.reply("Usage: /announcement Your message");
    const users = await User.find({}).select("telegramId").limit(5000);
    let ok = 0;
    for (const u of users) {
      try {
        await bot.telegram.sendMessage(u.telegramId, text);
        ok++;
      } catch (e) {}
    }
    await ctx.reply(`Broadcast done. Sent: ${ok}/${users.length}`);
  });

  // Reply to a photo with /announcementimage caption...
  bot.command("announcementimage", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const caption = ctx.message.text.replace(/^\/announcementimage(@\w+)?\s*/, "").trim();
    const reply = ctx.message.reply_to_message;
    const photo = reply && reply.photo && reply.photo[reply.photo.length - 1];
    if (!photo) {
      return ctx.reply("Reply to an image with: /announcementimage Optional caption");
    }
    const users = await User.find({}).select("telegramId").limit(5000);
    let ok = 0;
    for (const u of users) {
      try {
        await bot.telegram.sendPhoto(u.telegramId, photo.file_id, {
          caption: caption || undefined
        });
        ok++;
      } catch (e) {}
    }
    await ctx.reply(`Image broadcast done. Sent: ${ok}/${users.length}`);
  });

  bot.catch((err) => console.error("Bot error:", err));
  return bot;
}

async function startBot() {
  if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN is missing");
  const bot = getBot();
  await bot.launch({ dropPendingUpdates: true });
  console.log("Telegram bot started");
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
  return bot;
}

module.exports = { startBot };
