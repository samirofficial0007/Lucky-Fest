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

function auth(req, res, next) {
  const initData = req.headers["x-telegram-init-data"] || req.body?.initData;
  const tgUser = verifyTelegramInitData(initData, process.env.BOT_TOKEN);

  // Demo/browser fallback is intentionally disabled in production.
  if (!tgUser) return res.status(401).json({ error: "Telegram authorization required" });

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
    user.photoUrl = tg.photo_url;
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
    coins: Number(u.coins.toFixed(4)),
    usdt: Number(u.usdt.toFixed(8)),
    totalBalance: Number((u.coins + u.usdt).toFixed(8)),
    referralIncome: Number((u.referralIncome || 0).toFixed(8)),
    referralCoins: Number((u.referralCoins || 0).toFixed(4)),
    withdrawnUsdt: Number((u.withdrawnUsdt || 0).toFixed(8)),
    incomeHour: 0.0005,
    incomeDay: 0.01,
    incomeMonth: 0.34,
    referralCount: u.referralCount,
    gifts: u.gifts,
    language: u.language || "English",
    theme: u.theme || "dark"
  };
}

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "novum-ai-agent" })
);

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
  const user = await getOrCreateUser(req.tgUser);

  const direct = await User.find({
    referrerTelegramId: user.telegramId
  })
    .select("telegramId username firstName lastName createdAt")
    .sort({ createdAt: -1 })
    .limit(100);

  res.json({
    referralCount: user.referralCount,
    direct: direct.map(x => ({
      telegramId: x.telegramId,
      name:
        [x.firstName, x.lastName].filter(Boolean).join(" ") ||
        x.username ||
        "User",
      username: x.username || "",
      joinedAt: x.createdAt
    }))
  });
});

app.post("/api/presence", auth, async (req, res) => {
  await Presence.findOneAndUpdate(
    { telegramId: String(req.tgUser.id) },
    {
      telegramId: String(req.tgUser.id),
      lastSeenAt: new Date()
    },
    { upsert: true }
  );

  const online = await Presence.countDocuments({
    lastSeenAt: {
      $gte: new Date(Date.now() - 45000)
    }
  });

  res.json({ online });
});

app.get("/api/account", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);
  let invitedBy = null;

  if (user.referrerTelegramId) {
    const r = await User.findOne({
      telegramId: user.referrerTelegramId
    });

    if (r) {
      invitedBy = {
        name:
          [r.firstName, r.lastName].filter(Boolean).join(" ") || "User",
        username: r.username || ""
      };
    }
  }

  const operations = await Transaction.find({
    telegramId: user.telegramId
  })
    .sort({ createdAt: -1 })
    .limit(100);

  res.json({
    user: serializeUser(user),
    invitedBy,
    operations
  });
});

app.get("/api/faq", auth, async (req, res) =>
  res.json(
    await FAQ.find({ active: true })
      .sort({ order: 1 })
      .limit(18)
  )
);

app.get("/api/transactions", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);

  const tx = await Transaction.find({
    telegramId: user.telegramId
  })
    .sort({ createdAt: -1 })
    .limit(50);

  res.json(tx);
});

app.post("/api/claim", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);

  const now = Date.now();
  const last = user.lastClaimAt
    ? user.lastClaimAt.getTime()
    : 0;

  if (last && now - last < 60 * 60 * 1000) {
    return res
      .status(429)
      .json({ error: "Profit can be claimed once per hour." });
  }

  const amount = 0.0005;

  user.usdt += amount;
  user.claimedUsdt += amount;
  user.lastClaimAt = new Date();

  await user.save();

  await Transaction.create({
    telegramId: user.telegramId,
    type: "claim",
    amount,
    note: "Hourly claim"
  });

  res.json({
    ok: true,
    user: serializeUser(user)
  });
});

app.post("/api/topup", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);
  const amount = Number(req.body.amount);

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 100000
  ) {
    return res
      .status(400)
      .json({ error: "Enter a valid top-up amount." });
  }

  await Transaction.create({
    telegramId: user.telegramId,
    type: "topup",
    amount,
    status: "pending",
    note: "Top-up request"
  });

  if (process.env.ADMIN_CHAT_ID && global.botInstance) {
    try {
      await global.botInstance.telegram.sendMessage(
        process.env.ADMIN_CHAT_ID,
        `💵 Top-up request\nUser: ${user.telegramId}\nAmount: ${amount} USDT`
      );
    } catch (e) {
      console.error(
        "Admin notification failed",
        e.message
      );
    }
  }

  res.json({
    ok: true,
    message:
      "Top-up request created. Connect your real payment provider before marking it completed."
  });
});

app.post("/api/withdraw", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);

  const amount = Number(req.body.amount);
  const wallet = String(req.body.wallet || "").trim();
  const min = Number(
    process.env.MIN_WITHDRAW_USDT || 1
  );

  if (!Number.isFinite(amount) || amount < min) {
    return res
      .status(400)
      .json({
        error: `Minimum withdrawal is ${min} USDT.`
      });
  }

  if (!wallet || wallet.length < 8) {
    return res
      .status(400)
      .json({
        error: "Enter a valid wallet address."
      });
  }

  if (amount > user.usdt) {
    return res
      .status(400)
      .json({
        error: "Insufficient USDT balance."
      });
  }

  user.usdt -= amount;
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
      console.error(
        "Admin notification failed",
        e.message
      );
    }
  }

  res.json({
    ok: true,
    user: serializeUser(user)
  });
});

app.post("/api/subscribe", auth, async (req, res) => {
  const user = await getOrCreateUser(req.tgUser);

  const exists = await Transaction.findOne({
    telegramId: user.telegramId,
    type: "subscribe",
    status: "completed"
  });

  if (exists) {
    return res.json({
      ok: true,
      message: "Reward already claimed."
    });
  }

  user.coins += 10;
  await user.save();

  await Transaction.create({
    telegramId: user.telegramId,
    type: "subscribe",
    coins: 10,
    note: "Channel subscription reward"
  });

  res.json({
    ok: true,
    user: serializeUser(user)
  });
});

/*
 * Express 5 compatibility fix:
 *
 * Old:
 * app.get("*", ...)
 *
 * Express 5 / path-to-regexp no longer accepts a bare "*".
 * "{*splat}" matches both "/" and other unmatched paths.
 */
app.get("/{*splat}", (_req, res) => {
  res.sendFile(
    path.join(process.cwd(), "public", "index.html")
  );
});

async function main() {
  await connectDB();

  global.botInstance = await startBot();

  app.listen(PORT, () =>
    console.log(`Web app running on port ${PORT}`)
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
