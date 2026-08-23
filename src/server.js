require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const User = require("./models/User");
const Transaction = require("./models/Transaction");
const Presence = require("./models/Presence");
const FAQ = require("./models/FAQ");
const { connectDB } = require("./db");
const { verifyTelegramInitData } = require("./auth");
const { startBot } = require("./bot");

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(process.cwd(), "public")));

const PORT = process.env.PORT || 3000;

// 5-level top-up commission rates
const COMMISSION_RATES = [0.1, 0.03, 0.02, 0.01, 0.01];

function auth(req, res, next) {
  const initData = req.headers["x-telegram-init-data"] || req.body?.initData;
  const tgUser = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!tgUser) {
    return res.status(401).json({ error: "Telegram authorization required" });
  }
  req.tgUser = tgUser;
  next();
}

async function getOrCreateUser(tg) {
  let user = await User.findOne({ telegramId: String(tg.id) });
  if (!user) {
    user = await User.create({
      telegramId: String(tg.id),
      username: tg.username,
      firstName: tg.first_name,
      lastName: tg.last_name,
      photoUrl: tg.photo_url
    });
  } else {
    user.username = tg.username;
    user.firstName = tg.first_name;
    user.lastName = tg.last_name;
    if (tg.photo_url) user.photoUrl = tg.photo_url;
    user.lastSeenAt = new Date();
    await user.save();
  }
  return user;
}

function serializeUser(u) {
  return {
    telegramId: u.telegramId,
    username: u.username || "",
    name: [u.firstName, u.lastName].filter(Boolean).join(" ") || "User",
    photoUrl: u.photoUrl || "/assets/assistant-logo.jpg",
    level: u.level || 1,
    coins: Number((u.coins || 0).toFixed(4)),
    usdt: Number((u.usdt || 0).toFixed(8)),
    claimedUsdt: Number((u.claimedUsdt || 0).toFixed(8)),
    totalBalance: Number(((u.coins || 0) + (u.usdt || 0)).toFixed(8)),
    referralIncome: Number((u.referralIncome || 0).toFixed(8)),
    referralCoins: Number((u.referralCoins || 0).toFixed(4)),
    withdrawnUsdt: Number((u.withdrawnUsdt || 0).toFixed(8)),
    incomeHour: 0.0005,
    incomeDay: 0.01,
    incomeMonth: 0.34,
    referralCount: u.referralCount || 0,
    gifts: u.gifts || 0,
    openedGifts: u.openedGifts || 0,
    language: u.language || "English",
    theme: u.theme || "dark",
    lastClaimAt: u.lastClaimAt
  };
}

// Distribute 5-level top-up commission
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

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "novum-ai-agent" })
);

app.get("/api/config", (_req, res) => {
  res.json({
    botUsername: process.env.BOT_USERNAME || "",
    botName: process.env.BOT_NAME || "NOVUM.AI Agent",
    channelUsername: process.env.CHANNEL_USERNAME || "",
    channelUrl: process.env.CHANNEL_URL || "",
    minWithdraw: Number(process.env.MIN_WITHDRAW_USDT || 1)
  });
});

app.get("/api/me", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    res.json(serializeUser(user));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load account" });
  }
});

app.get("/api/referrals", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const direct = await User.find({ referrerTelegramId: user.telegramId })
      .select("telegramId username firstName lastName createdAt")
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      referralCount: user.referralCount || 0,
      referralCoins: user.referralCoins || 0,
      referralIncome: user.referralIncome || 0,
      direct: direct.map((x) => ({
        telegramId: x.telegramId,
        name:
          [x.firstName, x.lastName].filter(Boolean).join(" ") ||
          x.username ||
          "User",
        username: x.username || "",
        joinedAt: x.createdAt
      }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load referrals" });
  }
});

app.post("/api/presence", auth, async (req, res) => {
  try {
    await Presence.findOneAndUpdate(
      { telegramId: String(req.tgUser.id) },
      { telegramId: String(req.tgUser.id), lastSeenAt: new Date() },
      { upsert: true }
    );
    const online = await Presence.countDocuments({
      lastSeenAt: { $gte: new Date(Date.now() - 45000) }
    });
    res.json({ online });
  } catch (e) {
    console.error(e);
    res.json({ online: 0 });
  }
});

app.get("/api/account", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    let invitedBy = null;
    if (user.referrerTelegramId) {
      const r = await User.findOne({ telegramId: user.referrerTelegramId });
      if (r) {
        invitedBy = {
          name:
            [r.firstName, r.lastName].filter(Boolean).join(" ") || "User",
          username: r.username || ""
        };
      }
    }
    const operations = await Transaction.find({ telegramId: user.telegramId })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ user: serializeUser(user), invitedBy, operations });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load account" });
  }
});

app.get("/api/faq", auth, async (req, res) => {
  try {
    const list = await FAQ.find({ active: true }).sort({ order: 1 }).limit(20);
    res.json(list);
  } catch (e) {
    res.json([]);
  }
});

app.get("/api/transactions", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const tx = await Transaction.find({ telegramId: user.telegramId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(tx);
  } catch (e) {
    res.status(500).json({ error: "Failed to load transactions" });
  }
});

app.post("/api/claim", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const now = Date.now();
    const last = user.lastClaimAt ? user.lastClaimAt.getTime() : 0;
    if (last && now - last < 60 * 60 * 1000) {
      return res
        .status(429)
        .json({ error: "Profit can be claimed once per hour." });
    }

    const amount = 0.0005;
    user.usdt = (user.usdt || 0) + amount;
    user.claimedUsdt = (user.claimedUsdt || 0) + amount;
    user.lastClaimAt = new Date();
    await user.save();

    await Transaction.create({
      telegramId: user.telegramId,
      type: "claim",
      amount,
      note: "Hourly claim"
    });

    res.json({ ok: true, user: serializeUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Claim failed" });
  }
});

app.post("/api/topup", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
      return res.status(400).json({ error: "Enter a valid top-up amount." });
    }

    await Transaction.create({
      telegramId: user.telegramId,
      type: "topup",
      amount,
      status: "pending",
      note: "Top-up request"
    });

    // Note: real credit + commission happens when admin marks completed
    // For demo you can auto-complete later via admin tool

    if (process.env.ADMIN_CHAT_ID && global.botInstance) {
      try {
        await global.botInstance.telegram.sendMessage(
          process.env.ADMIN_CHAT_ID,
          `💵 Top-up request\nUser: ${user.telegramId}\nAmount: ${amount} USDT`
        );
      } catch (e) {
        console.error("Admin notification failed", e.message);
      }
    }

    res.json({
      ok: true,
      message:
        "Top-up request created. Admin will process after payment confirmation."
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Top-up failed" });
  }
});

// Admin-style endpoint to mark top-up completed (protect in production)
app.post("/api/admin/complete-topup", auth, async (req, res) => {
  try {
    // Simple protection: only ADMIN_CHAT_ID owner can call (via telegram id match)
    if (
      process.env.ADMIN_CHAT_ID &&
      String(req.tgUser.id) !== String(process.env.ADMIN_CHAT_ID)
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { transactionId } = req.body;
    const tx = await Transaction.findById(transactionId);
    if (!tx || tx.type !== "topup" || tx.status !== "pending") {
      return res.status(400).json({ error: "Invalid transaction" });
    }

    const user = await User.findOne({ telegramId: tx.telegramId });
    if (!user) return res.status(404).json({ error: "User not found" });

    user.usdt = (user.usdt || 0) + tx.amount;
    await user.save();
    tx.status = "completed";
    await tx.save();

    await distributeCommission(user, tx.amount);

    res.json({ ok: true, user: serializeUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const amount = Number(req.body.amount);
    const wallet = String(req.body.wallet || "").trim();
    const min = Number(process.env.MIN_WITHDRAW_USDT || 1);

    if (!Number.isFinite(amount) || amount < min) {
      return res
        .status(400)
        .json({ error: `Minimum withdrawal is ${min} USDT.` });
    }
    if (!wallet || wallet.length < 8) {
      return res.status(400).json({ error: "Enter a valid wallet address." });
    }
    if (amount > (user.usdt || 0)) {
      return res.status(400).json({ error: "Insufficient USDT balance." });
    }

    user.usdt = (user.usdt || 0) - amount;
    user.withdrawnUsdt = (user.withdrawnUsdt || 0) + amount;
    await user.save();

    await Transaction.create({
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
          `💸 Withdrawal request\nUser: ${user.telegramId}\nAmount: ${amount} USDT\nWallet: ${wallet}`
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

app.post("/api/subscribe", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const exists = await Transaction.findOne({
      telegramId: user.telegramId,
      type: "subscribe",
      status: "completed"
    });
    if (exists) {
      return res.json({ ok: true, message: "Reward already claimed." });
    }

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
    console.error(e);
    res.status(500).json({ error: "Subscribe failed" });
  }
});

app.post("/api/open-gift", auth, async (req, res) => {
  try {
    const user = await getOrCreateUser(req.tgUser);
    const available = (user.gifts || 0) - (user.openedGifts || 0);
    if (available <= 0) {
      return res.status(400).json({ error: "No gifts available to open." });
    }

    // Random coins 5–25
    const reward = Math.floor(Math.random() * 21) + 5;
    user.openedGifts = (user.openedGifts || 0) + 1;
    user.coins = (user.coins || 0) + reward;
    await user.save();

    await Transaction.create({
      telegramId: user.telegramId,
      type: "gift",
      coins: reward,
      note: "Opened gift"
    });

    res.json({
      ok: true,
      reward,
      user: serializeUser(user)
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to open gift" });
  }
});

// Catch-all for SPA (Express 5 compatible)
app.get("/*splat", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

async function main() {
  await connectDB();

  // Listen first so Render detects the port
  app.listen(PORT, () => {
    console.log(`Web app running on port ${PORT}`);
  });

  try {
    global.botInstance = await startBot();
  } catch (err) {
    console.error("Bot failed to start:", err.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
