const { Telegraf, Markup } = require("telegraf");
const User = require("./models/User");
const Transaction = require("./models/Transaction");

// Invite position rewards (coins)
const INVITE_REWARDS = [50, 30, 20, 10, 10]; // 1st..5th+

function getBot() {
  const bot = new Telegraf(process.env.BOT_TOKEN);
  const appUrl = process.env.WEB_APP_URL || "https://example.com";
  const botName = process.env.BOT_NAME || "NOVUM.AI Agent";

  bot.start(async (ctx) => {
    try {
      const tg = ctx.from;
      const payload = (ctx.startPayload || "").trim();
      let referrerId = null;

      if (payload.startsWith("ref_")) {
        referrerId = payload.replace("ref_", "").trim();
        if (referrerId === String(tg.id)) referrerId = null; // self-ref blocked
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

      // Referral attribution only for brand-new users
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
            note: `Invite reward for position #${position}`,
            meta: { invited: String(tg.id), position }
          });
        }
      }

      const welcome =
        `👋 Welcome to <b>${botName}</b>!\n\n` +
        `Your personal AI agent is ready.\n` +
        `Open the Mini App to view balance, farm, referrals and gifts.`;

      await ctx.reply(welcome, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.webApp("👉 Open Telegram App", appUrl)]
        ])
      });
    } catch (err) {
      console.error("Start error:", err);
      await ctx.reply("Something went wrong. Please try again.");
    }
  });

  bot.command("app", async (ctx) => {
    await ctx.reply(
      "Open your personal AI agent:",
      Markup.inlineKeyboard([
        [Markup.button.webApp("📲 Open Telegram App", process.env.WEB_APP_URL || "https://example.com")]
      ])
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Use /start to register and open the Mini App.\n\n" +
        "Inside the app you can view your balance, referrals, gifts, farm and account settings."
    );
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
