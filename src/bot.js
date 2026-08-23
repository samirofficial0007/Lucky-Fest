const { Telegraf, Markup } = require("telegraf");
const User = require("./models/User");
const Transaction = require("./models/Transaction");

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

      user = await User.create({
        telegramId: String(tg.id),
        username: tg.username,
        firstName: tg.first_name,
        lastName: tg.last_name,
        referrerTelegramId,
        coins: 0
      });

      if (referrerTelegramId) {
        const ref = await User.findOne({ telegramId: referrerTelegramId });
        if (ref) {
          ref.coins += 50;
          ref.referralCount += 1;
          ref.gifts += 1;
          await ref.save();
          await Transaction.create({
            telegramId: ref.telegramId,
            type: "referral",
            coins: 50,
            amount: 0,
            note: `New direct referral: ${tg.id}`
          });
          await Transaction.create({
            telegramId: ref.telegramId,
            type: "gift",
            coins: 1,
            amount: 0,
            note: `Referral gift from ${tg.id}`
          });
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
      "🎉 <b>Registration is almost complete!</b> Open the app to launch your personal AI agent 🤖📈",
      "",
      "💵 <b>Top up your USDT balance</b> to level up your agent and boost your daily income 🚀",
      "",
      "👥 <b>Invite partners and friends</b> — earn rewards for their registrations and trading activity! 🎁✨"
    ].join("\n");

    await ctx.replyWithPhoto(
      { source: require("path").join(process.cwd(), "public/assets/welcome.jpg") },
      {
        caption: "<b>What can this bot do?</b>\n\n📲 Next-generation AI agent: instant USDT earnings from the very first second.\n\n🫶 Technology for people — simple, reliable, made with care.",
        parse_mode: "HTML"
      }
    );

    await ctx.reply(welcome, {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.webApp("👉 [ Open Telegram App ] ➡️", appUrl)]
      ])
    });
  });

  bot.command("app", async (ctx) => {
    await ctx.reply("Open your personal AI agent:", Markup.inlineKeyboard([
      [Markup.button.webApp("📲 Open Telegram App", process.env.WEB_APP_URL)]
    ]));
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Use /start to register and open the Mini App.\n\n" +
      "Inside the app you can view your balance, referrals, gifts, trading dashboard and account settings."
    );
  });

  bot.catch((err) => console.error("Bot error:", err));

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
