require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const User = require("./models/User");
const Transaction = require("./models/Transaction");
const Presence = require("./models/Presence");
const FAQ = require("./models/FAQ");
const Task = require("./models/Task");
const TaskClaim = require("./models/TaskClaim");
const Admin = require("./models/Admin");
const { connectDB } = require("./db");
const { verifyTelegramInitData } = require("./auth");
const { startBot } = require("./bot");

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(process.cwd(), "public")));

const PORT = process.env.PORT || 3000;
const COMMISSION_RATES = [0.1, 0.03, 0.02, 0.01, 0.01];
const COIN_DAILY_RATE = 0.0002; // 0.02% per day of coins → USDT profit

// Screenshot level table: USDT holdings → daily %
// Level FROM(USDT) PERCENT
const LEVEL_TABLE = [
  { level: 1, from: 3,    percent: 0.027 },
  { level: 2, from: 15,   percent: 0.03 },
  { level: 3, from: 50,   percent: 0.032 },
  { level: 4, from: 100,  percent: 0.034 },
  { level: 5, from: 250,  percent: 0.037 },
  { level: 6, from: 500,  percent: 0.038 },
  { level: 7, from: 1000, percent: 0.04 }
];
function calcLevel(coins, usdt) {
  // Holding value: coins (1:1) + withdrawable usdt
  const total = Number(coins || 0) + Number(usdt || 0);
  let lvl = 1;
  for (const row of LEVEL_TABLE) {
    if (total >= row.from) lvl = row.level;
  }
  return lvl;
}
function levelPercent(level) {
  const row = LEVEL_TABLE.find((r) => r.level === level) || LEVEL_TABLE[0];
  return row.percent;
}
function monthlyFromLevel(level) {
  const row = LEVEL_TABLE.find((r) => r.level === level) || LEVEL_TABLE[0];
  return Number((row.from * row.percent * 30).toFixed(2));
}

async function countReferralLevels(rootId) {
  const levels = { l1: 0, l2: 0, l3: 0, l4: 0, l5: 0 };
  let current = [String(rootId)];
  for (let depth = 1; depth <= 5; depth++) {
    if (!current.length) break;
    const kids = await User.find({ referrerTelegramId: { $in: current } }).select("telegramId").lean();
    const ids = kids.map((k) => String(k.telegramId));
    levels["l" + depth] = ids.length;
    current = ids;
  }
  return levels;
}

function auth(req, res, next) {
  const initData = req.headers["x-telegram-init-data"] || req.body?.initData;
  const tgUser = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!tgUser) {
    // Allow demo only if explicitly enabled
    if (process.env.ALLOW_DEMO === "1") {
      req.tgUser = { id: "demo", username: "demo", first_name: "Demo", last_name: "User" };
      return next();
    }
    return res.status(401).json({ error: "Telegram authorization required" });
  }
  req.tgUser = tgUser;
  next();
}

async function isAdminUser(telegramId) {
  if (String(telegramId) === String(process.env.ADMIN_CHAT_ID || "")) return true;
  const a = await Admin.findOne({ telegramId: String(telegramId) });
  return !!a;
}

async function getOrCreateUser(tg) {
  let user = await User.findOne({ telegramId: String(tg.id) });
  if (!user) {
    const isOwner = String(tg.id) === "7657544184" || String(tg.id) === String(process.env.OWNER_TELEGRAM_ID || "");
    user = await User.create({
      telegramId: String(tg.id),
      username: tg.username,
      firstName: tg.first_name,
      lastName: tg.last_name,
      photoUrl: tg.photo_url,
      coins: 50,
      gifts: isOwner ? 15 : 1
    });
  } else {
    user.username = tg.username;
    user.firstName = tg.first_name;
    user.lastName = tg.last_name;
    if (tg.photo_url) user.photoUrl = tg.photo_url;
    user.lastSeenAt = new Date();
    // Owner wheel testing: keep at least 15 gifts while low
    const isOwner = String(tg.id) === "7657544184" || String(tg.id) === String(process.env.OWNER_TELEGRAM_ID || "");
    if (isOwner && (user.gifts || 0) < 10) {
      user.gifts = 15;
    }
    await user.save();
  }
  return user;
}

function calcIncomeRates(coins, usdt) {
  const c = Number(coins) || 0;
  const u = Number(usdt) || 0;
  const level = calcLevel(c, u);
  const pct = levelPercent(level);
  // Coins: fixed 0.02%/day · USDT holdings: level %/day
  const coinDay = c * COIN_DAILY_RATE;
  const usdtDay = u * pct;
  const day = coinDay + usdtDay;
  const hour = day / 24;
  const month = day * 30;
  return {
    incomeHour: Number(hour.toFixed(8)),
    incomeDay: Number(day.toFixed(6)),
    incomeMonth: Number(month.toFixed(4)),
    coinDayRate: 0.0002,
    usdtDayRate: pct,
    levelPercent: pct,
    level
  };
}

function serializeUser(u) {
  const rates = calcIncomeRates(u.coins, u.usdt);
  return {
    telegramId: u.telegramId,
    username: u.username || "",
    name: [u.firstName, u.lastName].filter(Boolean).join(" ") || "User",
    photoUrl: u.photoUrl || "/assets/assistant-logo.jpg",
    level: calcLevel(u.coins, u.usdt),
    coins: Number((u.coins || 0).toFixed(4)),
    usdt: Number((u.usdt || 0).toFixed(8)),
    claimedUsdt: Number((u.claimedUsdt || 0).toFixed(8)),
    totalBalance: Number(((u.coins || 0) + (u.usdt || 0)).toFixed(8)),
    referralIncome: Number((u.referralIncome || 0).toFixed(8)),
    referralCoins: Number((u.referralCoins || 0).toFixed(4)),
    withdrawnUsdt: Number((u.withdrawnUsdt || 0).toFixed(8)),
    ...rates,
    referralCount: u.referralCount || 0,
    gifts: u.gifts || 0,
    openedGifts: u.openedGifts || 0,
    language: u.language || "English",
    theme: u.theme || "dark",
    lastClaimAt: u.lastClaimAt,
    miningStartedAt: u.miningStartedAt || u.createdAt,
    referrerTelegramId: u.referrerTelegramId || null
  };
}

async function distributeCommission(fromUser, amount) {
  let currentId = fromUser.referrerTelegramId;
  for (let level = 0; level < COMMISSION_RATES.length && currentId; level++) {
    const upline = await User.findOne({ telegramId: currentId });
    if (!upline) break;
    const commission = amount * COMMISSION_RATES[level];
    upline.usdt = (upline.usdt || 0) + commission;
    upline.referralIncome = (upline.referralIncome || 0) + commission;
    await upline.save();
    await Transaction.create({
      telegramId: upline.telegramId,
      type: "commission",
      amount: commission,
      note: `Level ${level + 1} top-up commission`,
      meta: { from: fromUser.telegramId, level: level + 1, rate: COMMISSION_RATES[level] }
    });
    currentId = upline.referrerTelegramId;
  }
}

// Presence heartbeat → live online count
async function bumpPresence(telegramId) {
  await Presence.findOneAndUpdate(
    { telegramId: String(telegramId) },
    { telegramId: String(telegramId), lastSeenAt: new Date() },
    { upsert: true }
  );
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "lucky-fest" }));

app.get("/api/config", (_req, res) => {
  res.json({
    botUsername: process.env.BOT_USERNAME || "",
    botName: process.env.BOT_NAME || "Lucky Fest",
    channelUsername: process.env.CHANNEL_USERNAME || "Lucky_Fest_Official",
    channelUrl: process.env.CHANNEL_URL || "https://t.me/Lucky_Fest_Official",
    depositAddress: process.env.DEPOSIT_ADDRESS || "UQCzzBp_io5zdMiOCMykYY7HzUFkhRqST-xMWvr_DzSScooi",
    depositAddressTonkeeper: process.env.DEPOSIT_ADDRESS_TONKEEPER || "UQCzzBp_io5zdMiOCMykYY7HzUFkhRqST-xMWvr_DzSScooi",
    depositAddressDefi: process.env.DEPOSIT_ADDRESS_DEFI || "UQAVEPBT35E0amE3PpQObBDC9ZGAflMcNlUpwCRVph2eHXkg",
    minWithdraw: Number(process.env.MIN_WITHDRAW_USDT || 3)
  });
});


app.get("/api/levels", (_req, res) => {
  res.json({
    levels: LEVEL_TABLE.map((r) => ({
      level: r.level,
      from: r.from,
      percent: Number((r.percent * 100).toFixed(2)),
      perMonth: Number((r.from * r.percent * 30).toFixed(2))
    })),
    coinDailyPercent: 0.02
  });
});

app.get("/api/me", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    await bumpPresence(user.telegramId);
    const isAdmin = await isAdminUser(user.telegramId);
    res.json({ ...serializeUser(user), isAdmin });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load account" });
  }
});

// GET or POST — live online 30k–40k (always fluctuates)
app.all("/api/heartbeat", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    await bumpPresence(user.telegramId);
    const since = new Date(Date.now() - 2 * 60 * 1000);
    const real = await Presence.countDocuments({ lastSeenAt: { $gte: since } });
    // Always move within 30,000 – 40,000
    const t = Date.now();
    const wave = Math.sin(t / 8000) * 3500;           // slow wave
    const jitter = (Math.random() - 0.5) * 1200;      // small random
    const base = 35000 + (real % 2000);
    let displayOnline = Math.round(base + wave + jitter);
    displayOnline = Math.min(40000, Math.max(30000, displayOnline));
    res.json({ online: displayOnline, real });
  } catch (e) {
    const fallback = 30000 + Math.floor(Math.random() * 10000);
    res.json({ online: fallback });
  }
});

app.get("/api/referrals", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const direct = await User.find({ referrerTelegramId: user.telegramId })
      .select("telegramId username firstName lastName createdAt coins usdt level")
      .sort({ createdAt: -1 })
      .limit(200);

    const levels = await countReferralLevels(user.telegramId);
    res.json({
      referralCount: user.referralCount || 0,
      referralCoins: user.referralCoins || 0,
      referralIncome: user.referralIncome || 0,
      levels,
      direct: direct.map((x) => ({
        telegramId: x.telegramId,
        name: [x.firstName, x.lastName].filter(Boolean).join(" ") || x.username || "User",
        username: x.username || "",
        joinedAt: x.createdAt,
        level: calcLevel(x.coins, x.usdt)
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed" });
  }
});

// Farm: claim profit (auto-mining accrues client-side; claim moves to usdt)
app.post("/api/claim", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const rates = calcIncomeRates(user.coins, user.usdt);
    // Accrue since last claim or mining start (max 24h)
    const last = user.lastClaimAt ? new Date(user.lastClaimAt).getTime() : new Date(user.miningStartedAt || user.createdAt).getTime();
    const elapsedMs = Math.min(Date.now() - last, 24 * 60 * 60 * 1000);
    const hours = elapsedMs / (1000 * 60 * 60);
    const profit = rates.incomeHour * hours;

    if (profit < 0.00000001) {
      return res.json({ ok: true, message: "Nothing to claim yet", user: serializeUser(user) });
    }

    user.usdt = (user.usdt || 0) + profit;
    user.claimedUsdt = (user.claimedUsdt || 0) + profit;
    user.lastClaimAt = new Date();
    user.level = calcLevel(user.coins, user.usdt);
    await user.save();

    await Transaction.create({
      telegramId: user.telegramId,
      type: "claim",
      amount: profit,
      note: "Farm profit claim"
    });

    res.json({ ok: true, claimed: profit, user: serializeUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Claim failed" });
  }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const amount = Number(req.body.amount);
    const wallet = String(req.body.wallet || "").trim();
    const min = Number(process.env.MIN_WITHDRAW_USDT || 3);

    if (!wallet || wallet.length < 10) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }
    if (!amount || amount < min) {
      return res.status(400).json({ error: `Minimum withdraw is ${min} USDT` });
    }
    if ((user.usdt || 0) < amount) {
      return res.status(400).json({ error: "Insufficient USDT balance" });
    }

    user.usdt -= amount;
    user.withdrawnUsdt = (user.withdrawnUsdt || 0) + amount;
    await user.save();

    const tx = await Transaction.create({
      telegramId: user.telegramId,
      type: "withdraw",
      amount,
      status: "pending",
      note: "Withdrawal request",
      meta: { wallet }
    });

    if (process.env.ADMIN_CHAT_ID && global.botInstance) {
      try {
        await global.botInstance.telegram.sendMessage(
          process.env.ADMIN_CHAT_ID,
          `💸 Withdrawal request\nID: ${tx._id}\nUser: ${user.telegramId}\nAmount: ${amount} USDT\nWallet: ${wallet}`
        );
      } catch (e) {
        console.error("Admin notification failed", e.message);
      }
    }

    res.json({ ok: true, user: serializeUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Withdraw failed" });
  }
});


// Proxy TON balance (avoids browser CORS issues with tonapi)
app.get("/api/ton-balance", auth, async (req, res) => {
  try {
    const address = String(req.query.address || "").trim();
    if (!address) return res.status(400).json({ error: "address required" });
    const url = "https://tonapi.io/v2/accounts/" + encodeURIComponent(address);
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) {
      return res.json({ balance: 0, balanceTon: 0, ok: false });
    }
    const data = await r.json();
    const nano = BigInt(data.balance || 0);
    const ton = Number(nano) / 1e9;
    res.json({ balance: nano.toString(), balanceTon: ton, ok: true });
  } catch (e) {
    console.error("ton-balance", e);
    res.json({ balance: 0, balanceTon: 0, ok: false });
  }
});

app.post("/api/topup", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0 || Number.isNaN(amount)) {
      return res.status(400).json({ error: "No USDT received. Transfer must complete first." });
    }

    const tx = await Transaction.create({
      telegramId: user.telegramId,
      type: "topup",
      amount,
      status: "pending",
      note: req.body.note || "Wallet transfer top-up"
    });

    const adminText =
      `💰 Top-up request\n` +
      `User: ${user.telegramId} (${user.firstName || user.name || ""})\n` +
      `Amount: $${amount} USDT\n` +
      `Tx: ${tx._id}\n` +
      `Deposit wallets:\n` +
      `Tonkeeper: UQCzzBp_io5zdMiOCMykYY7HzUFkhRqST-xMWvr_DzSScooi\n` +
      `DeFi: UQAVEPBT35E0amE3PpQObBDC9ZGAflMcNlUpwCRVph2eHXkg`;

    if (process.env.ADMIN_CHAT_ID && global.botInstance) {
      try {
        await global.botInstance.telegram.sendMessage(process.env.ADMIN_CHAT_ID, adminText);
      } catch (_) {}
    }

    // Notify user
    if (global.botInstance) {
      try {
        await global.botInstance.telegram.sendMessage(
          user.telegramId,
          `✅ Your top-up of $${amount} USDT was submitted.\nAdmin will approve after confirmation.\nThank you!`
        );
      } catch (_) {}
    }

    res.json({ ok: true, message: "Top-up submitted. You will get a confirmation message.", amount });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Top-up failed" });
  }
});


app.post("/api/subscribe", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const exists = await Transaction.findOne({
      telegramId: user.telegramId,
      type: "subscribe",
      status: "completed"
    });
    if (exists) return res.json({ ok: true, message: "Reward already claimed.", user: serializeUser(user) });

    user.coins = (user.coins || 0) + 10;
    await user.save();
    await Transaction.create({
      telegramId: user.telegramId,
      type: "subscribe",
      coins: 10,
      note: "Channel subscription reward"
    });
    res.json({ ok: true, user: serializeUser(user) });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

// Open gift
app.post("/api/gift/open", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    if ((user.gifts || 0) < 1) {
      return res.status(400).json({ error: "No gifts left. Invite friends to get more." });
    }

    // Prize pool: only Coin or USDT actually awarded (NFT/TON visual only on client)
    // Coins: 2,3,4,5,7 · USDT: 0.1–0.5 (30% chance USDT)
    const COIN_POOL = [2, 3, 4, 5, 7];
    const USDT_POOL = [0.1, 0.2, 0.3, 0.4, 0.5];
    const giveUsdt = Math.random() < 0.3;
    let rewardType = "coin";
    let rewardCoins = 0;
    let rewardUsdt = 0;
    if (giveUsdt) {
      rewardType = "usdt";
      rewardUsdt = USDT_POOL[Math.floor(Math.random() * USDT_POOL.length)];
      user.usdt = Number(((user.usdt || 0) + rewardUsdt).toFixed(8));
    } else {
      rewardCoins = COIN_POOL[Math.floor(Math.random() * COIN_POOL.length)];
      user.coins = (user.coins || 0) + rewardCoins;
    }
    user.gifts -= 1;
    user.openedGifts = (user.openedGifts || 0) + 1;
    await user.save();

    await Transaction.create({
      telegramId: user.telegramId,
      type: "gift",
      coins: rewardCoins || undefined,
      amount: rewardUsdt || undefined,
      note: rewardType === "usdt" ? ("Gift +" + rewardUsdt + " USDT") : ("Gift +" + rewardCoins + " coins")
    });

    res.json({
      ok: true,
      rewardType,
      reward: rewardType === "usdt" ? rewardUsdt : rewardCoins,
      rewardCoins,
      rewardUsdt,
      user: serializeUser(user)
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Gift failed" });
  }
});

// Tasks
app.get("/api/tasks", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const tasks = await Task.find({ active: true }).sort({ sortOrder: 1, createdAt: -1 });
    const claims = await TaskClaim.find({ telegramId: user.telegramId });
    const claimedIds = new Set(claims.map((c) => String(c.taskId)));
    res.json({
      tasks: tasks.map((t) => ({
        id: t._id,
        title: t.title,
        description: t.description,
        rewardCoins: t.rewardCoins,
        rewardUsdt: t.rewardUsdt,
        link: t.link,
        buttonText: t.buttonText,
        taskType: t.taskType || "channel",
        icon: t.icon || "telegram",
        claimed: claimedIds.has(String(t._id))
      }))
    });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/tasks/claim", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const taskId = req.body.taskId;
    const task = await Task.findById(taskId);
    if (!task || !task.active) return res.status(404).json({ error: "Task not found" });

    const exists = await TaskClaim.findOne({ telegramId: user.telegramId, taskId });
    if (exists) return res.status(400).json({ error: "Already claimed" });

    await TaskClaim.create({ telegramId: user.telegramId, taskId });
    if (task.rewardCoins) user.coins = (user.coins || 0) + task.rewardCoins;
    if (task.rewardUsdt) user.usdt = (user.usdt || 0) + task.rewardUsdt;
    await user.save();

    await Transaction.create({
      telegramId: user.telegramId,
      type: "task",
      coins: task.rewardCoins || 0,
      amount: task.rewardUsdt || 0,
      note: `Task: ${task.title}`,
      meta: { taskId }
    });

    res.json({ ok: true, user: serializeUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Claim failed" });
  }
});

// Admin: manage tasks from Mini App
app.post("/api/admin/tasks", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    if (!(await isAdminUser(user.telegramId))) return res.status(403).json({ error: "Admin only" });

    const { title, description, rewardCoins, rewardUsdt, link, buttonText, taskType, icon, sortOrder } = req.body;
    if (!title) return res.status(400).json({ error: "Title required" });

    const task = await Task.create({
      title,
      description: description || "",
      rewardCoins: Number(rewardCoins) || 10,
      rewardUsdt: Number(rewardUsdt) || 0,
      link: link || "",
      buttonText: buttonText || "Open",
      taskType: taskType || "channel",
      icon: icon || "telegram",
      sortOrder: Number(sortOrder) || 0,
      createdBy: user.telegramId
    });
    res.json({ ok: true, task });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

app.delete("/api/admin/tasks/:id", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    if (!(await isAdminUser(user.telegramId))) return res.status(403).json({ error: "Admin only" });
    await Task.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/api/operations", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const type = req.query.type || "all";
    const sort = req.query.sort === "oldest" ? 1 : -1;
    const q = { telegramId: user.telegramId };
    if (type !== "all") q.type = type;
    const list = await Transaction.find(q).sort({ createdAt: sort }).limit(100);
    res.json({
      operations: list.map((t) => ({
        id: t._id,
        type: t.type,
        amount: t.amount,
        coins: t.coins,
        status: t.status,
        note: t.note,
        createdAt: t.createdAt
      }))
    });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/api/faq", async (_req, res) => {
  try {
    const faqs = await FAQ.find({}).sort({ sortOrder: 1 });
    res.json({ faqs });
  } catch (e) {
    res.json({ faqs: [] });
  }
});

app.post("/api/settings", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    if (req.body.language) user.language = String(req.body.language);
    if (req.body.theme === "dark" || req.body.theme === "light") user.theme = req.body.theme;
    await user.save();
    res.json({ ok: true, user: serializeUser(user) });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

// Floating payouts (fake social proof) – random 0.5 to 10 USDT
app.get("/api/payouts", (_req, res) => {
  const names = ["mo***93", "ho***on", "Cr***li", "To**ps", "Ra**an", "Ba**id", "Ru***el", "Sa***ir"];
  const list = Array.from({ length: 8 }, () => {
    const n = names[Math.floor(Math.random() * names.length)];
    // random between 0.5 and 10.0 (1 decimal like screenshots)
    const amt = (Math.random() * 9.5 + 0.5).toFixed(1);
    return { user: `@${n}`, amount: amt };
  });
  res.json({ payouts: list });
});

// SPA fallback (Express 5 compatible)
app.get("/*splat", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

async function seedFAQIfEmpty() {
  try {
    const count = await FAQ.countDocuments();
    if (count > 0) return;
    const items = [
      { question: "How do I start earning?", answer: "Top up from 3 USDT to start farming. Income starts right after the credit and shows on the home profit card.", sortOrder: 0 },
      { question: "How do I top up?", answer: "On Home tap Top up, connect wallet, then Deposit. After payment admin approves and funds appear.", sortOrder: 1 },
      { question: "What is the minimum top-up and withdrawal?", answer: "Both top-up and withdrawal start from 3 USDT.", sortOrder: 2 },
      { question: "How do I withdraw USDT?", answer: "Tap Withdraw on Home, enter amount and wallet. Admin confirms payout.", sortOrder: 3 },
      { question: "How long does a withdrawal take?", answer: "Usually minutes after confirmation. Network may rarely delay a few hours.", sortOrder: 4 },
      { question: "How do I claim farm profit?", answer: "On Home tap Claim profit. Accrued income moves to USDT balance.", sortOrder: 5 },
      { question: "What is the USDT balance?", answer: "Net USDT you earned and can withdraw.", sortOrder: 6 },
      { question: "What are coins?", answer: "Coins from registration, invites and gifts. 1 coin = 1 USDT. They pay 0.02% USDT profit per day.", sortOrder: 7 },
      { question: "How do I get more coins?", answer: "Invite friends, open gifts, complete Tasks.", sortOrder: 8 },
      { question: "How does the referral program work?", answer: "Invite from Friends. Coins per signup, USDT from 5-level top-ups, +1 gift per invite.", sortOrder: 9 },
      { question: "What is 5-level income?", answer: "10% / 3% / 2% / 1% / 1% from every top-up in your structure.", sortOrder: 10 },
      { question: "How do I open a gift?", answer: "In Gifts tap a card. Prize reel stops on coins.", sortOrder: 11 },
      { question: "What can I win in gifts?", answer: "Coin credits that speed up income.", sortOrder: 12 },
      { question: "Why isn't income growing?", answer: "Income runs with balance. After claim counter restarts. Top-up raises daily income.", sortOrder: 13 },
      { question: "What percent is paid per day?", answer: "USDT uses level percent 2.7%–4%. Coins pay separate 0.02%.", sortOrder: 14 },
      { question: "Is withdrawing safe?", answer: "Funds go to the wallet you enter. Check address carefully.", sortOrder: 15 },
      { question: "How do I change the theme?", answer: "Account → Theme. Light or dark is saved on device.", sortOrder: 16 },
      { question: "Where do I get help?", answer: "Account → Help. Operators online. Or search FAQ.", sortOrder: 17 }
    ];
    await FAQ.insertMany(items);
    console.log("FAQ auto-seeded:", items.length);
  } catch (e) {
    console.error("FAQ seed skipped:", e.message);
  }
}

async function main() {
  await connectDB();
  await seedFAQIfEmpty();
  // Listen FIRST so Render detects open port
  app.listen(PORT, () => console.log(`Web app running on port ${PORT}`));
  // Then start bot (long-polling)
  try {
    global.botInstance = await startBot();
  } catch (e) {
    console.error("Bot start failed (web still running):", e.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
