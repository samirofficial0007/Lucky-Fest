require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const User = require("./models/User");
const Transaction = require("./models/Transaction");
const Presence = require("./models/Presence");
const FAQ = require("./models/FAQ");
const Task = require("./models/Task");
const TaskCompletion = require("./models/TaskCompletion");
const { connectDB } = require("./db");
const { verifyTelegramInitData } = require("./auth");
const { startBot } = require("./bot");

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;
const CHANNEL_USERNAME = (process.env.CHANNEL_USERNAME || "Lucky_Fest_Official").replace(/^@/, "");
const CHANNEL_URL = process.env.CHANNEL_URL || "https://t.me/Lucky_Fest_Official";
const TOPUP_WALLET = process.env.TOPUP_WALLET || "UQCzzBp_io5zdMiOCMykYY7HzUFkhRqST-xMWvr_DzSScooi";
const MINING_DAILY_RATE = Number(process.env.MINING_DAILY_RATE || 0.027);
const MINING_MAX_ELAPSED_SECONDS = Number(process.env.MINING_MAX_ELAPSED_SECONDS || 86400 * 365);

function auth(req, res, next) {
  const initData = req.headers["x-telegram-init-data"] || req.body?.initData;
  const tgUser = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!tgUser) return res.status(401).json({ error: "Telegram authorization required" });
  req.tgUser = tgUser;
  next();
}

function miningRateForLevel(level) {
  const rates = { 1: MINING_DAILY_RATE, 2: MINING_DAILY_RATE * 1.15, 3: MINING_DAILY_RATE * 1.3, 4: MINING_DAILY_RATE * 1.5, 5: MINING_DAILY_RATE * 1.75 };
  return rates[Math.min(Math.max(Number(level || 1), 1), 5)] || MINING_DAILY_RATE;
}

async function settleMining(user) {
  if (!user.miningActive || !(user.miningPrincipal > 0)) return 0;
  const now = Date.now();
  const last = user.miningLastAt ? user.miningLastAt.getTime() : now;
  const elapsed = Math.min(Math.max((now - last) / 1000, 0), MINING_MAX_ELAPSED_SECONDS);
  if (elapsed <= 0) return 0;

  const dailyRate = miningRateForLevel(user.level);
  const earned = user.miningPrincipal * dailyRate * (elapsed / 86400);
  if (earned > 0) {
    user.miningAccrued = Number(user.miningAccrued || 0) + earned;
    user.miningLastAt = new Date(now);
    await user.save();
  }
  return earned;
}

async function getOrCreateUser(tg) {
  let user = await User.findOne({ telegramId: String(tg.id) });
  if (!user) {
    user = await User.create({
      telegramId: String(tg.id),
      username: tg.username,
      firstName: tg.first_name,
      lastName: tg.last_name,
      photoUrl: tg.photo_url,
      miningLastAt: new Date()
    });
  } else {
    user.username = tg.username;
    user.firstName = tg.first_name;
    user.lastName = tg.last_name;
    user.photoUrl = tg.photo_url;
    user.lastSeenAt = new Date();
    await settleMining(user);
    await user.save();
  }
  return user;
}

function serializeUser(u) {
  const pendingMining = Number(u.miningAccrued || 0);
  return {
    telegramId: u.telegramId,
    username: u.username || "",
    name: [u.firstName, u.lastName].filter(Boolean).join(" ") || "User",
    photoUrl: u.photoUrl || "/assets/assistant-logo.jpg",
    level: u.level || 1,
    coins: Number(u.coins.toFixed(4)),
    usdt: Number(u.usdt.toFixed(8)),
    totalBalance: Number((u.coins + u.usdt + pendingMining).toFixed(8)),
    miningAccrued: Number(pendingMining.toFixed(8)),
    miningPrincipal: Number((u.miningPrincipal || 0).toFixed(8)),
    miningActive: !!u.miningActive,
    miningRateDaily: miningRateForLevel(u.level),
    incomeHour: Number(((u.miningPrincipal || 0) * miningRateForLevel(u.level) / 24).toFixed(8)),
    incomeDay: Number(((u.miningPrincipal || 0) * miningRateForLevel(u.level)).toFixed(8)),
    incomeMonth: Number(((u.miningPrincipal || 0) * miningRateForLevel(u.level) * 30).toFixed(8)),
    referralIncome: Number((u.referralIncome || 0).toFixed(8)),
    referralCoins: Number((u.referralCoins || 0).toFixed(4)),
    withdrawnUsdt: Number((u.withdrawnUsdt || 0).toFixed(8)),
    referralCount: u.referralCount || 0,
    gifts: u.gifts || 0,
    language: u.language || "English",
    theme: u.theme || "dark",
    walletAddress: u.walletAddress || "",
    walletName: u.walletName || ""
  };
}

async function seedDefaults() {
  const faqCount = await FAQ.countDocuments();
  if (!faqCount) {
    const faqs = [
      ["What is Lucky Fest?", "Lucky Fest is a Telegram Mini App where you can complete tasks, collect coins, use the mining dashboard, invite friends, manage your wallet and request withdrawals."],
      ["How does auto mining work?", "Mining is calculated on the server from your active mining principal and elapsed time. You do not need to keep the Mini App open. When you return, the server settles the accumulated amount."],
      ["When does mining start?", "Mining starts after an administrator confirms a valid top-up. The confirmed amount becomes your mining principal."],
      ["How do I top up?", "Enter your amount in Top Up. The app shows the official receiving wallet and creates a pending payment request. Send USDT only through the configured network and wait for confirmation."],
      ["What tasks can I complete?", "Tasks can include joining the official Telegram channel, starting the configured bot, and visiting websites. Eligible tasks are checked before the reward is credited."],
      ["How is a channel task verified?", "The bot checks your membership status through Telegram. The bot must have the required permission in the configured channel."],
      ["How does a bot-start task work?", "Open the target bot from the task. For a Lucky Fest bot-start task, your Telegram account is verified when the bot has received your /start event."],
      ["How does a website task work?", "Open the task link and keep the page open for the required time. Then return to the Mini App and press Verify."],
      ["How do referrals work?", "Your referral link can reward coins and gifts for successful registrations. The configured multi-level program can also distribute eligible referral income."],
      ["What is the minimum withdrawal?", "The minimum withdrawal is controlled by the MIN_WITHDRAW_USDT setting on the server."],
      ["Can I connect a wallet?", "Yes. Use Wallet Connect in Account. TON Connect opens a secure wallet picker for supported TON wallets without exposing your private keys."],
      ["Can I use Tonkeeper?", "If Tonkeeper is available in the TON Connect wallet picker on your device, you can connect it from Wallet Connect."],
      ["Where can I see transactions?", "Open Account → Operations to see your recent top-ups, mining claims, withdrawals, task rewards and referral activity."],
      ["How do I change language?", "Open Account → Language and choose one of the available languages. The preference is saved to your account."],
      ["How do I change theme?", "Open Account → Theme. Light and Dark are saved to your Telegram account and restored on the next launch."],
      ["How do I contact support?", "Use the Help button. It opens the configured support account in Telegram."],
      ["Can I close the app while mining?", "Yes. Mining is server-side. Closing Telegram or the Mini App does not stop an active mining session."],
      ["Is payment automatically credited?", "Not until a payment is actually verified. The app never pretends a blockchain transfer succeeded without confirmation."],
      ["What happens to a rejected top-up?", "A rejected payment request does not increase your mining principal or balance."],
      ["How do I open the official channel?", `Use the channel task or open ${CHANNEL_URL}.`]
    ];
    await FAQ.insertMany(faqs.map((x, i) => ({ question: x[0], answer: x[1], order: i + 1 })));
  }

  const taskCount = await Task.countDocuments();
  if (!taskCount) {
    await Task.insertMany([
      { title: "Join Lucky Fest Official", description: "Join the official Telegram channel and verify your membership.", type: "channel_join", target: `@${CHANNEL_USERNAME}`, url: CHANNEL_URL, rewardCoins: 25, order: 1 },
      { title: "Start Lucky Fest Bot", description: "Open the bot and press Start. Then return here to verify.", type: "bot_start", target: process.env.BOT_USERNAME || "", url: process.env.WEB_APP_URL ? `https://t.me/${process.env.BOT_USERNAME || ""}` : "", rewardCoins: 20, order: 2 },
      { title: "Visit our website", description: "Open the website and stay for a few seconds, then return to verify.", type: "website_visit", target: "official-site", url: process.env.WEB_APP_URL || "", rewardCoins: 15, minVisitSeconds: 6, order: 3 }
    ]);
  }
}

app.get("/tonconnect-manifest.json", (req, res) => {
  const origin = `${req.protocol}://${req.get("host")}`;
  res.json({ url: origin, name: "Lucky Fest", iconUrl: `${origin}/assets/assistant-logo.jpg` });
});

app.get("/api/config", auth, async (_req, res) => res.json({ topupWallet: TOPUP_WALLET, channelUrl: CHANNEL_URL, channelUsername: CHANNEL_USERNAME, support: "https://t.me/assistant_bd", botUsername: process.env.BOT_USERNAME || "" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "lucky-fest" }));

app.get("/api/me", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    await settleMining(user);
    res.json(serializeUser(user));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load account" });
  }
});

app.post("/api/presence", auth, async (req, res) => {
  await Presence.findOneAndUpdate({ telegramId: String(req.tgUser.id) }, { telegramId: String(req.tgUser.id), lastSeenAt: new Date() }, { upsert: true });
  const online = await Presence.countDocuments({ lastSeenAt: { $gte: new Date(Date.now() - 45000) } });
  res.json({ online });
});

app.get("/api/referrals", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);
  const direct = await User.find({ referrerTelegramId: user.telegramId }).select("telegramId username firstName lastName createdAt").sort({ createdAt: -1 }).limit(100);
  res.json({ referralCount: user.referralCount, direct: direct.map(x => ({ telegramId: x.telegramId, name: [x.firstName, x.lastName].filter(Boolean).join(" ") || x.username || "User", username: x.username || "", joinedAt: x.createdAt })) });
});

app.get("/api/account", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);
  let invitedBy = null;
  if (user.referrerTelegramId) {
    const r = await User.findOne({ telegramId: user.referrerTelegramId });
    if (r) invitedBy = { name: [r.firstName, r.lastName].filter(Boolean).join(" ") || "User", username: r.username || "" };
  }
  const operations = await Transaction.find({ telegramId: user.telegramId }).sort({ createdAt: -1 }).limit(100);
  res.json({ user: serializeUser(user), invitedBy, operations });
});

app.get("/api/faq", auth, async (_req, res) => res.json(await FAQ.find({ active: true }).sort({ order: 1 }).limit(50)));
app.get("/api/transactions", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);
  res.json(await Transaction.find({ telegramId: user.telegramId }).sort({ createdAt: -1 }).limit(100));
});

app.get("/api/tasks", auth, async (req, res) => {
  const tasks = await Task.find({ active: true }).sort({ order: 1, createdAt: 1 });
  const completions = await TaskCompletion.find({ telegramId: String(req.tgUser.id) });
  const map = new Map(completions.map(c => [String(c.taskId), c]));
  res.json(tasks.map(t => ({ ...t.toObject(), completion: map.get(String(t._id)) ? { status: map.get(String(t._id)).status, startedAt: map.get(String(t._id)).startedAt } : null })));
});

app.post("/api/tasks/:id/start", auth, async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, active: true });
  if (!task) return res.status(404).json({ error: "Task not found." });
  const existing = await TaskCompletion.findOne({ telegramId: String(req.tgUser.id), taskId: task._id });
  if (existing?.status === "completed") return res.json({ ok: true, completed: true, message: "Task already completed." });
  const completion = existing || new TaskCompletion({ telegramId: String(req.tgUser.id), taskId: task._id });
  completion.status = "started";
  completion.startedAt = new Date();
  await completion.save();
  res.json({ ok: true, task, verifyAfterSeconds: task.type === "website_visit" ? task.minVisitSeconds : 0 });
});

app.post("/api/tasks/:id/verify", auth, async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, active: true });
  if (!task) return res.status(404).json({ error: "Task not found." });
  const user = await getOrCreateUser(req.tgUser);
  const completion = await TaskCompletion.findOne({ telegramId: user.telegramId, taskId: task._id });
  if (!completion) return res.status(400).json({ error: "Start the task first." });
  if (completion.status === "completed") return res.json({ ok: true, completed: true, user: serializeUser(user) });

  if (task.type === "website_visit") {
    const seconds = (Date.now() - completion.startedAt.getTime()) / 1000;
    if (seconds < task.minVisitSeconds) return res.status(400).json({ error: `Please keep the task open for ${task.minVisitSeconds} seconds.` });
  }

  if (task.type === "channel_join") {
    if (!global.botInstance) return res.status(503).json({ error: "Bot is still starting. Try again shortly." });
    try {
      const member = await global.botInstance.telegram.getChatMember(task.target || `@${CHANNEL_USERNAME}`, Number(user.telegramId));
      if (!["creator", "administrator", "member"].includes(member.status)) return res.status(400).json({ error: "Join the Telegram channel first." });
    } catch (e) {
      console.error("Channel verification failed", e.message);
      return res.status(400).json({ error: "Channel verification failed. Make sure the bot is an administrator in the channel." });
    }
  }

  if (task.type === "bot_start") {
    if (!process.env.BOT_USERNAME || task.target === process.env.BOT_USERNAME) {
      // The current bot-start task is verified by the fact that this Telegram account reached the bot backend.
    } else {
      return res.status(400).json({ error: "This bot-start task requires its target bot to be configured for verification." });
    }
  }

  completion.status = "completed";
  completion.completedAt = new Date();
  await completion.save();
  user.coins += Number(task.rewardCoins || 0);
  if (task.rewardUsdt) user.usdt += Number(task.rewardUsdt);
  await user.save();
  await Transaction.create({ telegramId: user.telegramId, type: "task", coins: Number(task.rewardCoins || 0), amount: Number(task.rewardUsdt || 0), note: task.title, meta: { taskId: String(task._id) } });
  res.json({ ok: true, message: `Task complete! +${task.rewardCoins || 0} coins`, user: serializeUser(user) });
});

app.post("/api/theme", auth, async (req, res) => {
  const theme = req.body.theme === "light" ? "light" : "dark";
  const user = await getOrCreateUser(req.tgUser);
  user.theme = theme;
  await user.save();
  res.json({ ok: true, theme });
});

app.post("/api/language", auth, async (req, res) => {
  const supported = ["English", "বাংলা", "Hindi", "Urdu", "Arabic", "Russian", "Spanish", "Tiếng Việt", "Türkçe", "Bahasa Indonesia", "Português", "Français", "Deutsch", "中文"];
  const language = supported.includes(req.body.language) ? req.body.language : "English";
  const user = await getOrCreateUser(req.tgUser);
  user.language = language;
  await user.save();
  res.json({ ok: true, language });
});

app.post("/api/wallet", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);
  const address = String(req.body.address || "").trim();
  const name = String(req.body.name || "TON Wallet").trim().slice(0, 60);
  if (!address || address.length < 20) return res.status(400).json({ error: "Enter a valid wallet address." });
  user.walletAddress = address;
  user.walletName = name;
  await user.save();
  res.json({ ok: true, user: serializeUser(user) });
});

app.delete("/api/wallet", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);
  user.walletAddress = "";
  user.walletName = "";
  await user.save();
  res.json({ ok: true, user: serializeUser(user) });
});

app.post("/api/claim", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);
  await settleMining(user);
  const amount = Number(user.miningAccrued || 0);
  if (amount <= 0) return res.status(400).json({ error: "No mining profit is ready to claim yet." });
  user.miningAccrued = 0;
  user.usdt += amount;
  user.claimedUsdt += amount;
  user.lastClaimAt = new Date();
  await user.save();
  await Transaction.create({ telegramId: user.telegramId, type: "claim", amount, note: "Auto mining profit claim" });
  res.json({ ok: true, user: serializeUser(user), claimed: amount });
});

app.post("/api/topup", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return res.status(400).json({ error: "Enter a valid top-up amount." });
  const tx = await Transaction.create({ telegramId: user.telegramId, type: "topup", amount, status: "pending", note: "Top-up request" });
  if (process.env.ADMIN_CHAT_ID && global.botInstance) {
    try { await global.botInstance.telegram.sendMessage(process.env.ADMIN_CHAT_ID, `💵 Top-up request\nUser: ${user.telegramId}\nAmount: ${amount} USDT\nRequest: ${tx._id}`); } catch (e) { console.error("Admin notification failed", e.message); }
  }
  res.json({ ok: true, transactionId: String(tx._id), wallet: TOPUP_WALLET, message: `Send exactly ${amount} USDT to the wallet shown, then wait for payment confirmation.` });
});

app.post("/api/withdraw", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);
  await settleMining(user);
  const amount = Number(req.body.amount);
  const wallet = String(req.body.wallet || user.walletAddress || "").trim();
  const min = Number(process.env.MIN_WITHDRAW_USDT || 1);
  if (!Number.isFinite(amount) || amount < min) return res.status(400).json({ error: `Minimum withdrawal is ${min} USDT.` });
  if (!wallet || wallet.length < 20) return res.status(400).json({ error: "Connect or enter a valid wallet address." });
  if (amount > user.usdt) return res.status(400).json({ error: "Insufficient USDT balance." });
  user.usdt -= amount;
  user.withdrawnUsdt += amount;
  user.walletAddress = wallet;
  await user.save();
  const tx = await Transaction.create({ telegramId: user.telegramId, type: "withdraw", amount, status: "pending", note: "Withdrawal request", meta: { wallet } });
  if (process.env.ADMIN_CHAT_ID && global.botInstance) {
    try { await global.botInstance.telegram.sendMessage(process.env.ADMIN_CHAT_ID, `💸 Withdrawal request\nUser: ${user.telegramId}\nAmount: ${amount} USDT\nWallet: ${wallet}\nRequest: ${tx._id}`); } catch (e) { console.error("Admin notification failed", e.message); }
  }
  res.json({ ok: true, user: serializeUser(user), transactionId: String(tx._id) });
});

app.post("/api/subscribe", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);
  const exists = await Transaction.findOne({ telegramId: user.telegramId, type: "subscribe", status: "completed" });
  if (exists) return res.json({ ok: true, message: "Reward already claimed." });
  user.coins += 10;
  await user.save();
  await Transaction.create({ telegramId: user.telegramId, type: "subscribe", coins: 10, note: "Channel subscription reward" });
  res.json({ ok: true, user: serializeUser(user) });
});

// Express 5-compatible SPA fallback.
app.get("/{*splat}", (_req, res) => res.sendFile(path.join(process.cwd(), "public", "index.html")));

async function main() {
  try {
    await connectDB();
    await seedDefaults();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Web app running on port ${PORT}`);
      setInterval(async () => {
        try {
          const users = await User.find({ miningActive: true, miningPrincipal: { $gt: 0 } }).limit(1000);
          for (const user of users) await settleMining(user);
        } catch (err) {
          console.error("Mining heartbeat failed:", err.message);
        }
      }, 60000);
      Promise.resolve().then(() => startBot()).then(bot => { global.botInstance = bot; }).catch(err => console.error("Telegram bot failed to start:", err));
    });
  } catch (err) {
    console.error("Server startup failed:", err);
    process.exit(1);
  }
}

main();
