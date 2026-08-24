const { Telegraf, Markup } = require("telegraf");
const path = require("path");
const User = require("./models/User");
const Transaction = require("./models/Transaction");
const Task = require("./models/Task");

function adminOnly(ctx) {
  return process.env.ADMIN_CHAT_ID && String(ctx.from.id) === String(process.env.ADMIN_CHAT_ID);
}

function getBot() {
  const bot = new Telegraf(process.env.BOT_TOKEN);

  bot.start(async (ctx) => {
    const tg = ctx.from;
    const payload = ctx.startPayload || "";
    let user = await User.findOne({ telegramId: String(tg.id) });

    if (!user) {
      let referrerTelegramId = null;
      if (payload.startsWith("ref_")) {
        const candidate = payload.slice(4);
        if (candidate && candidate !== String(tg.id)) referrerTelegramId = candidate;
      }
      user = await User.create({ telegramId: String(tg.id), username: tg.username, firstName: tg.first_name, lastName: tg.last_name, referrerTelegramId, coins: 0, miningLastAt: new Date() });

      if (referrerTelegramId) {
        const ref = await User.findOne({ telegramId: referrerTelegramId });
        if (ref) {
          ref.coins += 50;
          ref.referralCount += 1;
          ref.gifts += 1;
          await ref.save();
          await Transaction.create({ telegramId: ref.telegramId, type: "referral", coins: 50, note: `New direct referral: ${tg.id}` });
          await Transaction.create({ telegramId: ref.telegramId, type: "gift", coins: 1, note: `Referral gift from ${tg.id}` });
        }
      }
    } else {
      user.username = tg.username;
      user.firstName = tg.first_name;
      user.lastName = tg.last_name;
      user.lastSeenAt = new Date();
      await user.save();
    }

    const appUrl = process.env.WEB_APP_URL;
    const welcome = [
      "🎉 <b>Welcome to Lucky Fest!</b>",
      "",
      "⛏️ Complete tasks, use server-side auto mining, invite friends and manage your wallet from the Mini App.",
      "",
      "📌 Mining keeps running on the server even when the Mini App is closed.",
      "",
      "🛠 Use /help to see all commands."
    ].join("\n");

    try {
      await ctx.replyWithPhoto({ source: path.join(process.cwd(), "public/assets/welcome.jpg") }, { caption: "<b>Lucky Fest</b>\n\nYour mobile earning dashboard for tasks, mining, referrals and wallet management.", parse_mode: "HTML" });
    } catch (_) {}

    await ctx.reply(welcome, { parse_mode: "HTML", ...Markup.inlineKeyboard([[Markup.button.webApp("🚀 Open Lucky Fest", appUrl)]]) });
  });

  bot.command("app", async ctx => {
    await ctx.reply("Open your Lucky Fest Mini App:", Markup.inlineKeyboard([[Markup.button.webApp("🚀 Open App", process.env.WEB_APP_URL)]]));
  });

  bot.command("tasks", async ctx => {
    const tasks = await Task.find({ active: true }).sort({ order: 1 });
    const lines = tasks.map((t, i) => `${i + 1}. ${t.title} — +${t.rewardCoins} coins`);
    await ctx.reply(`📋 <b>Available Tasks</b>\n\n${lines.join("\n") || "No tasks available right now."}\n\nOpen the Mini App to complete and verify tasks.`, { parse_mode: "HTML", ...Markup.inlineKeyboard([[Markup.button.webApp("📋 Open Tasks", process.env.WEB_APP_URL)]]) });
  });

  bot.command("faq", async ctx => {
    await ctx.reply("Open the Mini App → Account → FAQ to read the full Lucky Fest guide.", Markup.inlineKeyboard([[Markup.button.webApp("❓ Open FAQ", process.env.WEB_APP_URL)]]));
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "🛠 <b>Lucky Fest Commands</b>\n\n" +
      "/start — Register/open the app\n" +
      "/app — Open Mini App\n" +
      "/tasks — View available tasks\n" +
      "/faq — Open full FAQ\n" +
      "/help — Show this help\n\n" +
      "Inside the app: Auto Mining, Tasks, Referrals, Gifts, Top Up, Withdraw, Wallet Connect, Language, Theme, FAQ and Operations.\n\n" +
      "Need support? Tap Help in Account.",
      { parse_mode: "HTML" }
    );
  });

  bot.command("approve_topup", async ctx => {
    if (!adminOnly(ctx)) return ctx.reply("Admin only.");
    const id = (ctx.message.text.split(/\s+/)[1] || "").trim();
    if (!id) return ctx.reply("Usage: /approve_topup <transactionId>");
    const tx = await Transaction.findOne({ _id: id, type: "topup", status: "pending" });
    if (!tx) return ctx.reply("Pending top-up not found.");
    const user = await User.findOne({ telegramId: tx.telegramId });
    if (!user) return ctx.reply("User not found.");
    tx.status = "completed";
    tx.note = "Top-up verified by admin";
    await tx.save();
    user.miningPrincipal = Number(user.miningPrincipal || 0) + Number(tx.amount || 0);
    user.miningActive = user.miningPrincipal > 0;
    user.miningStartedAt = user.miningStartedAt || new Date();
    user.miningLastAt = new Date();
    await user.save();
    await ctx.reply(`✅ Top-up approved. ${tx.amount} USDT added to mining principal for ${tx.telegramId}.`);
  });

  bot.command("reject_topup", async ctx => {
    if (!adminOnly(ctx)) return ctx.reply("Admin only.");
    const id = (ctx.message.text.split(/\s+/)[1] || "").trim();
    const tx = await Transaction.findOne({ _id: id, type: "topup", status: "pending" });
    if (!tx) return ctx.reply("Pending top-up not found.");
    tx.status = "rejected";
    tx.note = "Top-up rejected by admin";
    await tx.save();
    await ctx.reply("❌ Top-up rejected.");
  });

  bot.command("pending", async ctx => {
    if (!adminOnly(ctx)) return ctx.reply("Admin only.");
    const txs = await Transaction.find({ status: "pending" }).sort({ createdAt: -1 }).limit(20);
    if (!txs.length) return ctx.reply("No pending requests.");
    await ctx.reply(txs.map(t => `${t.type.toUpperCase()}\nID: ${t._id}\nUser: ${t.telegramId}\nAmount: ${t.amount || 0}`).join("\n\n"));
  });

  bot.catch(err => console.error("Bot error:", err));
  return bot;
}

async function startBot() {
  if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN is missing");
  const bot = getBot();
  await bot.launch();
  console.log("Telegram bot started");
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
  return bot;
}

module.exports = { startBot };
