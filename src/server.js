require("dotenv").config();

const path = require("path");
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

/* =========================================================
   BASIC CONFIG
========================================================= */

const PORT = Number(process.env.PORT || 3000);

const PUBLIC_DIR = path.join(process.cwd(), "public");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");

/*
 * Normal mining:
 * Every registered user earns this amount based on time.
 *
 * Example:
 * 0.00001 = normal daily earning.
 *
 * Change from .env if needed:
 * NORMAL_MINING_DAILY_RATE=0.00001
 */
const NORMAL_MINING_DAILY_RATE = Number(
  process.env.NORMAL_MINING_DAILY_RATE || 0.00001
);

/*
 * Top-up mining:
 *
 * If user has a miningPrincipal, this rate is applied
 * to the top-up principal.
 *
 * Example:
 * 1 USDT principal × 0.027/day
 * = 0.027 USDT/day
 */
const TOPUP_MINING_DAILY_RATE = Number(
  process.env.MINING_DAILY_RATE || 0.027
);

const MINING_MAX_ELAPSED_SECONDS = Number(
  process.env.MINING_MAX_ELAPSED_SECONDS || 86400 * 365
);

const MINING_HEARTBEAT_MS = 10000;

const CHANNEL_USERNAME = (
  process.env.CHANNEL_USERNAME || "Lucky_Fest_Official"
).replace(/^@/, "");

const CHANNEL_URL =
  process.env.CHANNEL_URL ||
  "https://t.me/Lucky_Fest_Official";

const TOPUP_WALLET =
  process.env.TOPUP_WALLET ||
  "UQCzzBp_io5zdMiOCMykYY7HzUFkhRqST-xMWvr_DzSScooi";

const SUPPORT_USERNAME =
  process.env.SUPPORT_USERNAME || "assistant_bd";

/* =========================================================
   EXPRESS
========================================================= */

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: false
  })
);

/*
 * IMPORTANT:
 * Static files MUST be registered before SPA fallback.
 *
 * This prevents:
 *
 * /styles.css
 * /app.js
 * /assets/...
 * /favicon.ico
 *
 * from receiving index.html.
 */
app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    extensions: false,
    fallthrough: true,
    maxAge: process.env.NODE_ENV === "production"
      ? "1h"
      : 0
  })
);

/* =========================================================
   TELEGRAM AUTH
========================================================= */

function auth(req, res, next) {
  try {
    const initData =
      req.headers["x-telegram-init-data"] ||
      req.body?.initData ||
      req.query?.initData;

    if (!initData) {
      return res.status(401).json({
        error: "Telegram authorization required"
      });
    }

    const tgUser = verifyTelegramInitData(
      initData,
      process.env.BOT_TOKEN
    );

    if (!tgUser) {
      return res.status(401).json({
        error: "Invalid Telegram authorization"
      });
    }

    req.tgUser = tgUser;

    next();
  } catch (error) {
    console.error("Telegram auth error:", error);

    return res.status(401).json({
      error: "Telegram authorization failed"
    });
  }
}

/* =========================================================
   MINING HELPERS
========================================================= */

/*
 * Level multiplier for TOP-UP mining.
 *
 * Normal mining is NOT multiplied here.
 */
function miningLevelMultiplier(level) {
  const multipliers = {
    1: 1,
    2: 1.15,
    3: 1.30,
    4: 1.50,
    5: 1.75
  };

  const safeLevel = Math.min(
    Math.max(Number(level || 1), 1),
    5
  );

  return multipliers[safeLevel] || 1;
}

/*
 * Get the top-up mining daily rate according to level.
 */
function miningRateForLevel(level) {
  return (
    TOPUP_MINING_DAILY_RATE *
    miningLevelMultiplier(level)
  );
}

/*
 * Calculate current mining speed.
 *
 * NORMAL:
 * Every user gets NORMAL_MINING_DAILY_RATE.
 *
 * BOOSTED:
 * If miningPrincipal > 0,
 * principal × top-up rate is added.
 */
function getMiningInfo(user) {
  const normalDaily = Math.max(
    NORMAL_MINING_DAILY_RATE,
    0
  );

  const boostedRate = Math.max(
    Number(user.miningPrincipal || 0),
    0
  ) * miningRateForLevel(user.level);

  const totalDaily = normalDaily + boostedRate;

  const totalHour = totalDaily / 24;

  const totalMinute = totalHour / 60;

  const totalSecond = totalMinute / 60;

  return {
    normalDaily,
    boostedDaily: boostedRate,
    totalDaily,
    totalHour,
    totalMinute,
    totalSecond
  };
}

/*
 * Settle mining according to elapsed time.
 *
 * This function NEVER depends on the Mini App being open.
 *
 * Database:
 * miningAccrued
 *
 * gets:
 *
 * normal mining
 * +
 * top-up boosted mining
 */
async function settleMining(user) {
  const now = Date.now();

  /*
   * First time:
   * Set timestamp only.
   */
  if (!user.miningLastAt) {
    user.miningLastAt = new Date(now);

    if (user.miningStartedAt == null) {
      user.miningStartedAt = new Date(now);
    }

    await user.save();

    return 0;
  }

  const last = user.miningLastAt.getTime();

  let elapsedSeconds =
    (now - last) / 1000;

  /*
   * Protect against:
   *
   * negative clock
   * huge elapsed time
   */
  elapsedSeconds = Math.min(
    Math.max(elapsedSeconds, 0),
    MINING_MAX_ELAPSED_SECONDS
  );

  if (elapsedSeconds <= 0) {
    return 0;
  }

  const info = getMiningInfo(user);

  const earned =
    info.totalDaily *
    (elapsedSeconds / 86400);

  if (earned > 0) {
    user.miningAccrued =
      Number(user.miningAccrued || 0) +
      earned;
  }

  user.miningLastAt = new Date(now);

  /*
   * Mark mining as started.
   *
   * This does NOT require a top-up.
   */
  if (!user.miningStartedAt) {
    user.miningStartedAt = new Date(last);
  }

  await user.save();

  return earned;
}

/* =========================================================
   USER
========================================================= */

async function getOrCreateUser(tg) {
  const telegramId = String(tg.id);

  let user = await User.findOne({
    telegramId
  });

  if (!user) {
    user = await User.create({
      telegramId,
      username: tg.username || "",
      firstName: tg.first_name || "",
      lastName: tg.last_name || "",
      photoUrl: tg.photo_url || "",
      level: 1,
      coins: 0,
      usdt: 0,
      claimedUsdt: 0,
      referralIncome: 0,
      referralCoins: 0,
      withdrawnUsdt: 0,
      referralCount: 0,
      gifts: 0,
      language: "English",
      theme: "dark",
      walletAddress: "",
      walletName: "",
      miningActive: false,
      miningPrincipal: 0,
      miningAccrued: 0,
      miningLastAt: new Date(),
      miningStartedAt: new Date(),
      lastSeenAt: new Date()
    });

    return user;
  }

  user.username = tg.username || "";
  user.firstName = tg.first_name || "";
  user.lastName = tg.last_name || "";

  if (tg.photo_url) {
    user.photoUrl = tg.photo_url;
  }

  user.lastSeenAt = new Date();

  /*
   * Settle old mining before returning user.
   */
  await settleMining(user);

  return user;
}

/* =========================================================
   SERIALIZE USER
========================================================= */

function roundNumber(value, decimals = 8) {
  const n = Number(value || 0);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return Number(n.toFixed(decimals));
}

function serializeUser(user) {
  const mining = getMiningInfo(user);

  const miningAccrued =
    Number(user.miningAccrued || 0);

  const coins =
    Number(user.coins || 0);

  const usdt =
    Number(user.usdt || 0);

  /*
   * NOTE:
   *
   * miningAccrued is included so UI can immediately
   * display the current pending mining amount.
   */
  const totalBalance =
    coins +
    usdt +
    miningAccrued;

  return {
    telegramId: user.telegramId,

    username: user.username || "",

    name:
      [
        user.firstName,
        user.lastName
      ]
        .filter(Boolean)
        .join(" ") ||
      "User",

    photoUrl:
      user.photoUrl ||
      "/assets/assistant-logo.jpg",

    level: Number(user.level || 1),

    coins: roundNumber(coins, 4),

    usdt: roundNumber(usdt, 8),

    totalBalance:
      roundNumber(totalBalance, 8),

    /* =========================================
       MINING
    ========================================= */

    miningAccrued:
      roundNumber(miningAccrued, 8),

    miningPrincipal:
      roundNumber(
        user.miningPrincipal || 0,
        8
      ),

    miningActive:
      !!user.miningActive,

    miningStartedAt:
      user.miningStartedAt || null,

    miningLastAt:
      user.miningLastAt || null,

    /*
     * Normal mining.
     */
    normalMiningDaily:
      roundNumber(
        mining.normalDaily,
        8
      ),

    /*
     * Top-up boosted mining.
     */
    boostedMiningDaily:
      roundNumber(
        mining.boostedDaily,
        8
      ),

    /*
     * Total.
     */
    miningRateDaily:
      roundNumber(
        mining.totalDaily,
        8
      ),

    incomeHour:
      roundNumber(
        mining.totalHour,
        8
      ),

    incomeMinute:
      roundNumber(
        mining.totalMinute,
        8
      ),

    incomeSecond:
      roundNumber(
        mining.totalSecond,
        12
      ),

    /*
     * These aliases can be useful if existing
     * frontend code expects them.
     */
    normalIncomeDay:
      roundNumber(
        mining.normalDaily,
        8
      ),

    boostedIncomeDay:
      roundNumber(
        mining.boostedDaily,
        8
      ),

    totalIncomeDay:
      roundNumber(
        mining.totalDaily,
        8
      ),

    incomeDay:
      roundNumber(
        mining.totalDaily,
        8
      ),

    incomeMonth:
      roundNumber(
        mining.totalDaily * 30,
        8
      ),

    /* =========================================
       REFERRAL
    ========================================= */

    referralIncome:
      roundNumber(
        user.referralIncome,
        8
      ),

    referralCoins:
      roundNumber(
        user.referralCoins,
        4
      ),

    referralCount:
      Number(user.referralCount || 0),

    gifts:
      Number(user.gifts || 0),

    /* =========================================
       WITHDRAW
    ========================================= */

    withdrawnUsdt:
      roundNumber(
        user.withdrawnUsdt,
        8
      ),

    claimedUsdt:
      roundNumber(
        user.claimedUsdt,
        8
      ),

    /* =========================================
       SETTINGS
    ========================================= */

    language:
      user.language || "English",

    theme:
      user.theme || "dark",

    walletAddress:
      user.walletAddress || "",

    walletName:
      user.walletName || ""
  };
}

/* =========================================================
   DEFAULT FAQ + TASKS
========================================================= */

async function seedDefaults() {
  try {
    const faqCount =
      await FAQ.countDocuments();

    if (!faqCount) {
      const faqs = [
        [
          "What is Lucky Fest?",
          "Lucky Fest is a Telegram Mini App where you can complete tasks, collect coins, use the mining dashboard, invite friends, manage your wallet and request withdrawals."
        ],

        [
          "How does normal mining work?",
          "Every registered account can accumulate normal mining income automatically based on elapsed server time."
        ],

        [
          "How does boosted mining work?",
          "After a valid top-up is confirmed, the confirmed amount becomes your mining principal and generates additional mining income."
        ],

        [
          "Does mining work when the app is closed?",
          "Yes. Mining is calculated on the server using elapsed time, so the Mini App does not need to remain open."
        ],

        [
          "When does boosted mining start?",
          "Boosted mining starts after the top-up amount is confirmed and assigned to your mining principal."
        ],

        [
          "How do I top up?",
          "Enter your amount in Top Up. The app shows the configured receiving wallet and creates a pending payment request."
        ],

        [
          "What tasks can I complete?",
          "Tasks can include joining the official Telegram channel, starting the configured bot, and visiting websites."
        ],

        [
          "How do referrals work?",
          "Your referral link can reward coins and gifts for successful registrations."
        ],

        [
          "Can I connect a wallet?",
          "Yes. Use Wallet Connect in Account for supported TON wallets."
        ],

        [
          "Where can I see transactions?",
          "Open Account → Operations to see recent top-ups, mining claims, withdrawals and task rewards."
        ],

        [
          "How do I change language?",
          "Open Account → Language and choose an available language."
        ],

        [
          "How do I change theme?",
          "Open Account → Theme and choose Light or Dark."
        ],

        [
          "How do I contact support?",
          `Use the Help button to contact @${SUPPORT_USERNAME}.`
        ],

        [
          "Can I close the app while mining?",
          "Yes. Mining is server-side."
        ],

        [
          "How do I open the official channel?",
          `Use the channel task or open ${CHANNEL_URL}.`
        ]
      ];

      await FAQ.insertMany(
        faqs.map((item, index) => ({
          question: item[0],
          answer: item[1],
          order: index + 1
        }))
      );
    }

    const taskCount =
      await Task.countDocuments();

    if (!taskCount) {
      const botUsername =
        process.env.BOT_USERNAME || "";

      await Task.insertMany([
        {
          title: "Join Lucky Fest Official",

          description:
            "Join the official Telegram channel and verify your membership.",

          type: "channel_join",

          target:
            `@${CHANNEL_USERNAME}`,

          url:
            CHANNEL_URL,

          rewardCoins: 25,

          order: 1
        },

        {
          title: "Start Lucky Fest Bot",

          description:
            "Open the bot and press Start. Then return here to verify.",

          type: "bot_start",

          target:
            botUsername,

          url:
            botUsername
              ? `https://t.me/${botUsername}`
              : "",

          rewardCoins: 20,

          order: 2
        },

        {
          title: "Visit our website",

          description:
            "Open the website and stay for a few seconds, then return to verify.",

          type: "website_visit",

          target:
            "official-site",

          url:
            process.env.WEB_APP_URL || "",

          rewardCoins: 15,

          minVisitSeconds: 6,

          order: 3
        }
      ]);
    }
  } catch (error) {
    console.error(
      "Default seed error:",
      error
    );
  }
}

/* =========================================================
   TON CONNECT MANIFEST
========================================================= */

app.get(
  "/tonconnect-manifest.json",
  (req, res) => {
    const origin =
      `${req.protocol}://${req.get("host")}`;

    res.json({
      url: origin,

      name: "Lucky Fest",

      iconUrl:
        `${origin}/assets/assistant-logo.jpg`
    });
  }
);

/* =========================================================
   HEALTH
========================================================= */

app.get(
  "/health",
  (_req, res) => {
    res.json({
      ok: true,
      service: "lucky-fest",
      mining: true,
      normalMining: true,
      boostedMining: true
    });
  }
);

/* =========================================================
   CONFIG
========================================================= */

app.get(
  "/api/config",
  auth,
  async (_req, res) => {
    res.json({
      topupWallet:
        TOPUP_WALLET,

      channelUrl:
        CHANNEL_URL,

      channelUsername:
        CHANNEL_USERNAME,

      support:
        `https://t.me/${SUPPORT_USERNAME}`,

      supportUsername:
        SUPPORT_USERNAME,

      botUsername:
        process.env.BOT_USERNAME || "",

      mining: {
        normalDailyRate:
          NORMAL_MINING_DAILY_RATE,

        topupDailyRate:
          TOPUP_MINING_DAILY_RATE
      }
    });
  }
);

/* =========================================================
   ME
========================================================= */

app.get(
  "/api/me",
  auth,
  async (req, res) => {
    try {
      const user =
        await getOrCreateUser(
          req.tgUser
        );

      /*
       * Extra settle to make response fresh.
       */
      await settleMining(user);

      res.json(
        serializeUser(user)
      );
    } catch (error) {
      console.error(
        "/api/me error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load account"
      });
    }
  }
);

/* =========================================================
   LIVE MINING ENDPOINT
========================================================= */

app.get(
  "/api/mining",
  auth,
  async (req, res) => {
    try {
      const user =
        await getOrCreateUser(
          req.tgUser
        );

      await settleMining(user);

      const data =
        serializeUser(user);

      res.json({
        ok: true,

        miningAccrued:
          data.miningAccrued,

        normalMiningDaily:
          data.normalMiningDaily,

        boostedMiningDaily:
          data.boostedMiningDaily,

        miningRateDaily:
          data.miningRateDaily,

        incomeHour:
          data.incomeHour,

        incomeMinute:
          data.incomeMinute,

        incomeSecond:
          data.incomeSecond,

        miningPrincipal:
          data.miningPrincipal,

        miningActive:
          data.miningActive
      });
    } catch (error) {
      console.error(
        "/api/mining error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load mining"
      });
    }
  }
);

/* =========================================================
   PRESENCE
========================================================= */

app.post(
  "/api/presence",
  auth,
  async (req, res) => {
    try {
      const telegramId =
        String(req.tgUser.id);

      await Presence.findOneAndUpdate(
        { telegramId },

        {
          telegramId,
          lastSeenAt:
            new Date()
        },

        {
          upsert: true,
          setDefaultsOnInsert: true
        }
      );

      const online =
        await Presence.countDocuments({
          lastSeenAt: {
            $gte:
              new Date(
                Date.now() - 45000
              )
          }
        });

      res.json({
        online
      });
    } catch (error) {
      console.error(
        "Presence error:",
        error
      );

      res.status(500).json({
        error:
          "Presence update failed"
      });
    }
  }
);

/* =========================================================
   REFERRALS
========================================================= */

app.get(
  "/api/referrals",
  auth,
  async (req, res) => {
    try {
      const user =
        await getOrCreateUser(
          req.tgUser
        );

      const direct =
        await User.find({
          referrerTelegramId:
            user.telegramId
        })
          .select(
            "telegramId username firstName lastName createdAt"
          )
          .sort({
            createdAt: -1
          })
          .limit(100);

      res.json({
        referralCount:
          Number(
            user.referralCount || 0
          ),

        direct:
          direct.map(item => ({
            telegramId:
              item.telegramId,

            name:
              [
                item.firstName,
                item.lastName
              ]
                .filter(Boolean)
                .join(" ") ||
              item.username ||
              "User",

            username:
              item.username || "",

            joinedAt:
              item.createdAt
          }))
      });
    } catch (error) {
      console.error(
        "Referral error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load referrals"
      });
    }
  }
);

/* =========================================================
   ACCOUNT
========================================================= */

app.get(
  "/api/account",
  auth,
  async (req, res) => {
    try {
      const user =
        await getOrCreateUser(
          req.tgUser
        );

      let invitedBy = null;

      if (user.referrerTelegramId) {
        const referrer =
          await User.findOne({
            telegramId:
              user.referrerTelegramId
          });

        if (referrer) {
          invitedBy = {
            name:
              [
                referrer.firstName,
                referrer.lastName
              ]
                .filter(Boolean)
                .join(" ") ||
              "User",

            username:
              referrer.username || ""
          };
        }
      }

      const operations =
        await Transaction.find({
          telegramId:
            user.telegramId
        })
          .sort({
            createdAt: -1
          })
          .limit(100);

      res.json({
        user:
          serializeUser(user),

        invitedBy,

        operations
      });
    } catch (error) {
      console.error(
        "Account error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load account"
      });
    }
  }
);

/* =========================================================
   FAQ
========================================================= */

app.get(
  "/api/faq",
  auth,
  async (_req, res) => {
    try {
      const faq =
        await FAQ.find({
          active: true
        })
          .sort({
            order: 1
          })
          .limit(50);

      res.json(faq);
    } catch (error) {
      console.error(
        "FAQ error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load FAQ"
      });
    }
  }
);

/* =========================================================
   TRANSACTIONS
========================================================= */

app.get(
  "/api/transactions",
  auth,
  async (req, res) => {
    try {
      const user =
        await getOrCreateUser(
          req.tgUser
        );

      const transactions =
        await Transaction.find({
          telegramId:
            user.telegramId
        })
          .sort({
            createdAt: -1
          })
          .limit(100);

      res.json(
        transactions
      );
    } catch (error) {
      console.error(
        "Transactions error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load transactions"
      });
    }
  }
);

/* =========================================================
   TASKS
========================================================= */

app.get(
  "/api/tasks",
  auth,
  async (req, res) => {
    try {
      const telegramId =
        String(req.tgUser.id);

      const tasks =
        await Task.find({
          active: true
        }).sort({
          order: 1,
          createdAt: 1
        });

      const completions =
        await TaskCompletion.find({
          telegramId
        });

      const completionMap =
        new Map(
          completions.map(item => [
            String(item.taskId),
            item
          ])
        );

      res.json(
        tasks.map(task => {
          const completion =
            completionMap.get(
              String(task._id)
            );

          return {
            ...task.toObject(),

            completion:
              completion
                ? {
                    status:
                      completion.status,

                    startedAt:
                      completion.startedAt
                  }
                : null
          };
        })
      );
    } catch (error) {
      console.error(
        "Tasks error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load tasks"
      });
    }
  }
);

/* =========================================================
   TASK START
========================================================= */

app.post(
  "/api/tasks/:id/start",
  auth,
  async (req, res) => {
    try {
      const task =
        await Task.findOne({
          _id: req.params.id,
          active: true
        });

      if (!task) {
        return res.status(404).json({
          error:
            "Task not found."
        });
      }

      const telegramId =
        String(req.tgUser.id);

      const existing =
        await TaskCompletion.findOne({
          telegramId,
          taskId: task._id
        });

      if (
        existing?.status ===
        "completed"
      ) {
        return res.json({
          ok: true,
          completed: true,
          message:
            "Task already completed."
        });
      }

      const completion =
        existing ||
        new TaskCompletion({
          telegramId,
          taskId:
            task._id
        });

      completion.status =
        "started";

      completion.startedAt =
        new Date();

      await completion.save();

      res.json({
        ok: true,

        task,

        verifyAfterSeconds:
          task.type ===
          "website_visit"
            ? Number(
                task.minVisitSeconds || 0
              )
            : 0
      });
    } catch (error) {
      console.error(
        "Task start error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to start task."
      });
    }
  }
);

/* =========================================================
   TASK VERIFY
========================================================= */

app.post(
  "/api/tasks/:id/verify",
  auth,
  async (req, res) => {
    try {
      const task =
        await Task.findOne({
          _id: req.params.id,
          active: true
        });

      if (!task) {
        return res.status(404).json({
          error:
            "Task not found."
        });
      }

      const user =
        await getOrCreateUser(
          req.tgUser
        );

      const completion =
        await TaskCompletion.findOne({
          telegramId:
            user.telegramId,

          taskId:
            task._id
        });

      if (!completion) {
        return res.status(400).json({
          error:
            "Start the task first."
        });
      }

      if (
        completion.status ===
        "completed"
      ) {
        return res.json({
          ok: true,

          completed: true,

          user:
            serializeUser(user)
        });
      }

      /* WEBSITE */

      if (
        task.type ===
        "website_visit"
      ) {
        const seconds =
          (
            Date.now() -
            completion.startedAt.getTime()
          ) / 1000;

        if (
          seconds <
          Number(
            task.minVisitSeconds || 0
          )
        ) {
          return res.status(400).json({
            error:
              `Please keep the task open for ${task.minVisitSeconds} seconds.`
          });
        }
      }

      /* CHANNEL */

      if (
        task.type ===
        "channel_join"
      ) {
        if (!global.botInstance) {
          return res.status(503).json({
            error:
              "Bot is still starting. Try again shortly."
          });
        }

        try {
          const member =
            await global.botInstance.telegram.getChatMember(
              task.target ||
                `@${CHANNEL_USERNAME}`,
              Number(user.telegramId)
            );

          if (
            ![
              "creator",
              "administrator",
              "member"
            ].includes(
              member.status
            )
          ) {
            return res.status(400).json({
              error:
                "Join the Telegram channel first."
            });
          }
        } catch (error) {
          console.error(
            "Channel verification failed:",
            error.message
          );

          return res.status(400).json({
            error:
              "Channel verification failed. Make sure the bot is an administrator in the channel."
          });
        }
      }

      /* BOT START */

      if (
        task.type ===
        "bot_start"
      ) {
        const botUsername =
          process.env.BOT_USERNAME ||
          "";

        if (
          !botUsername ||
          task.target ===
            botUsername
        ) {
          /*
           * Existing bot backend is the verification
           * point for the current Lucky Fest bot.
           */
        } else {
          return res.status(400).json({
            error:
              "This bot-start task requires its target bot to be configured for verification."
          });
        }
      }

      completion.status =
        "completed";

      completion.completedAt =
        new Date();

      await completion.save();

      user.coins =
        Number(user.coins || 0) +
        Number(
          task.rewardCoins || 0
        );

      if (task.rewardUsdt) {
        user.usdt =
          Number(user.usdt || 0) +
          Number(task.rewardUsdt);
      }

      await user.save();

      await Transaction.create({
        telegramId:
          user.telegramId,

        type:
          "task",

        coins:
          Number(
            task.rewardCoins || 0
          ),

        amount:
          Number(
            task.rewardUsdt || 0
          ),

        note:
          task.title,

        meta: {
          taskId:
            String(task._id)
        }
      });

      res.json({
        ok: true,

        message:
          `Task complete! +${task.rewardCoins || 0} coins`,

        user:
          serializeUser(user)
      });
    } catch (error) {
      console.error(
        "Task verify error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to verify task."
      });
    }
  }
);

/* =========================================================
   THEME
========================================================= */

app.post(
  "/api/theme",
  auth,
  async (req, res) => {
    try {
      const theme =
        req.body.theme === "light"
          ? "light"
          : "dark";

      const user =
        await getOrCreateUser(
          req.tgUser
        );

      user.theme =
        theme;

      await user.save();

      res.json({
        ok: true,
        theme
      });
    } catch (error) {
      console.error(
        "Theme error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to save theme."
      });
    }
  }
);

/* =========================================================
   LANGUAGE
========================================================= */

app.post(
  "/api/language",
  auth,
  async (req, res) => {
    try {
      const supported = [
        "English",
        "বাংলা",
        "Hindi",
        "Urdu",
        "Arabic",
        "Russian",
        "Spanish",
        "Tiếng Việt",
        "Türkçe",
        "Bahasa Indonesia",
        "Português",
        "Français",
        "Deutsch",
        "中文"
      ];

      const language =
        supported.includes(
          req.body.language
        )
          ? req.body.language
          : "English";

      const user =
        await getOrCreateUser(
          req.tgUser
        );

      user.language =
        language;

      await user.save();

      res.json({
        ok: true,
        language
      });
    } catch (error) {
      console.error(
        "Language error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to save language."
      });
    }
  }
);

/* =========================================================
   WALLET SAVE
========================================================= */

app.post(
  "/api/wallet",
  auth,
  async (req, res) => {
    try {
      const user =
        await getOrCreateUser(
          req.tgUser
        );

      const address =
        String(
          req.body.address || ""
        ).trim();

      const name =
        String(
          req.body.name ||
            "TON Wallet"
        )
          .trim()
          .slice(0, 60);

      if (
        !address ||
        address.length < 20
      ) {
        return res.status(400).json({
          error:
            "Enter a valid wallet address."
        });
      }

      user.walletAddress =
        address;

      user.walletName =
        name;

      await user.save();

      res.json({
        ok: true,

        user:
          serializeUser(user)
      });
    } catch (error) {
      console.error(
        "Wallet save error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to save wallet."
      });
    }
  }
);

/* =========================================================
   WALLET DELETE
========================================================= */

app.delete(
  "/api/wallet",
  auth,
  async (req, res) => {
    try {
      const user =
        await getOrCreateUser(
          req.tgUser
        );

      user.walletAddress =
        "";

      user.walletName =
        "";

      await user.save();

      res.json({
        ok: true,

        user:
          serializeUser(user)
      });
    } catch (error) {
      console.error(
        "Wallet delete error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to disconnect wallet."
      });
    }
  }
);

/* =========================================================
   CLAIM MINING
========================================================= */

app.post(
  "/api/claim",
  auth,
  async (req, res) => {
    try {
      const user =
        await getOrCreateUser(
          req.tgUser
        );

      /*
       * Always settle first.
       */
      await settleMining(user);

      const amount =
        Number(
          user.miningAccrued || 0
        );

      if (amount <= 0) {
        return res.status(400).json({
          error:
            "No mining profit is ready to claim yet."
        });
      }

      user.miningAccrued =
        0;

      user.usdt =
        Number(user.usdt || 0) +
        amount;

      user.claimedUsdt =
        Number(
          user.claimedUsdt || 0
        ) +
        amount;

      user.lastClaimAt =
        new Date();

      await user.save();

      await Transaction.create({
        telegramId:
          user.telegramId,

        type:
          "claim",

        amount,

        note:
          "Auto mining profit claim",

        status:
          "completed"
      });

      res.json({
        ok: true,

        claimed:
          roundNumber(
            amount,
            8
          ),

        user:
          serializeUser(user)
      });
    } catch (error) {
      console.error(
        "Claim error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to claim mining profit."
      });
    }
  }
);

/* =========================================================
   TOP-UP REQUEST
========================================================= */

app.post(
  "/api/topup",
  auth,
  async (req, res) => {
    try {
      const user =
        await getOrCreateUser(
          req.tgUser
        );

      const amount =
        Number(
          req.body.amount
        );

      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 100000
      ) {
        return res.status(400).json({
          error:
            "Enter a valid top-up amount."
        });
      }

      /*
       * IMPORTANT:
       *
       * Top-up request is pending.
       *
       * We DO NOT instantly add it to miningPrincipal.
       *
       * Admin/payment confirmation should activate
       * boosted mining.
       */
      const tx =
        await Transaction.create({
          telegramId:
            user.telegramId,

          type:
            "topup",

          amount,

          status:
            "pending",

          note:
            "Top-up request"
        });

      if (
        process.env.ADMIN_CHAT_ID &&
        global.botInstance
      ) {
        try {
          await global.botInstance.telegram.sendMessage(
            process.env.ADMIN_CHAT_ID,

            [
              "💵 Top-up request",

              `User: ${user.telegramId}`,

              `Amount: ${amount} USDT`,

              `Request: ${tx._id}`
            ].join("\n")
          );
        } catch (error) {
          console.error(
            "Admin notification failed:",
            error.message
          );
        }
      }

      res.json({
        ok: true,

        transactionId:
          String(tx._id),

        wallet:
          TOPUP_WALLET,

        message:
          `Send exactly ${amount} USDT to the wallet shown, then wait for payment confirmation.`
      });
    } catch (error) {
      console.error(
        "Topup error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to create top-up request."
      });
    }
  }
);

/* =========================================================
   WITHDRAW
========================================================= */

app.post(
  "/api/withdraw",
  auth,
  async (req, res) => {
    try {
      const user =
        await getOrCreateUser(
          req.tgUser
        );

      await settleMining(user);

      const amount =
        Number(
          req.body.amount
        );

      const wallet =
        String(
          req.body.wallet ||
          user.walletAddress ||
          ""
        ).trim();

      const min =
        Number(
          process.env.MIN_WITHDRAW_USDT ||
          1
        );

      if (
        !Number.isFinite(amount) ||
        amount < min
      ) {
        return res.status(400).json({
          error:
            `Minimum withdrawal is ${min} USDT.`
        });
      }

      if (
        !wallet ||
        wallet.length < 20
      ) {
        return res.status(400).json({
          error:
            "Connect or enter a valid wallet address."
        });
      }

      if (
        amount >
        Number(user.usdt || 0)
      ) {
        return res.status(400).json({
          error:
            "Insufficient USDT balance."
        });
      }

      /*
       * Reserve amount.
       */
      user.usdt =
        Number(user.usdt || 0) -
        amount;

      user.withdrawnUsdt =
        Number(
          user.withdrawnUsdt || 0
        ) +
        amount;

      user.walletAddress =
        wallet;

      await user.save();

      const tx =
        await Transaction.create({
          telegramId:
            user.telegramId,

          type:
            "withdraw",

          amount,

          status:
            "pending",

          note:
            "Withdrawal request",

          meta: {
            wallet
          }
        });

      if (
        process.env.ADMIN_CHAT_ID &&
        global.botInstance
      ) {
        try {
          await global.botInstance.telegram.sendMessage(
            process.env.ADMIN_CHAT_ID,

            [
              "💸 Withdrawal request",

              `User: ${user.telegramId}`,

              `Amount: ${amount} USDT`,

              `Wallet: ${wallet}`,

              `Request: ${tx._id}`
            ].join("\n")
          );
        } catch (error) {
          console.error(
            "Admin notification failed:",
            error.message
          );
        }
      }

      res.json({
        ok: true,

        user:
          serializeUser(user),

        transactionId:
          String(tx._id)
      });
    } catch (error) {
      console.error(
        "Withdraw error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to create withdrawal request."
      });
    }
  }
);

/* =========================================================
   SUBSCRIBE
========================================================= */

app.post(
  "/api/subscribe",
  auth,
  async (req, res) => {
    try {
      const user =
        await getOrCreateUser(
          req.tgUser
        );

      const exists =
        await Transaction.findOne({
          telegramId:
            user.telegramId,

          type:
            "subscribe",

          status:
            "completed"
        });

      if (exists) {
        return res.json({
          ok: true,

          message:
            "Reward already claimed."
        });
      }

      user.coins =
        Number(user.coins || 0) +
        10;

      await user.save();

      await Transaction.create({
        telegramId:
          user.telegramId,

        type:
          "subscribe",

        coins:
          10,

        status:
          "completed",

        note:
          "Channel subscription reward"
      });

      res.json({
        ok: true,

        user:
          serializeUser(user)
      });
    } catch (error) {
      console.error(
        "Subscribe error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to claim subscription reward."
      });
    }
  }
);

/* =========================================================
   STATIC FILE SAFETY CHECK
========================================================= */

/*
 * Never send index.html for these paths if they were not
 * found. This gives browser a proper 404 instead of turning
 * a missing CSS/JS file into HTML.
 */
app.use(
  (req, res, next) => {
    if (
      req.path.startsWith("/api/") ||
      req.path === "/styles.css" ||
      req.path.endsWith(".js") ||
      req.path.endsWith(".css") ||
      req.path.endsWith(".png") ||
      req.path.endsWith(".jpg") ||
      req.path.endsWith(".jpeg") ||
      req.path.endsWith(".webp") ||
      req.path.endsWith(".svg") ||
      req.path.endsWith(".ico") ||
      req.path.endsWith(".json")
    ) {
      return res.status(404).send("Not Found");
    }

    next();
  }
);

/* =========================================================
   SPA FALLBACK
========================================================= */

/*
 * IMPORTANT:
 *
 * This MUST remain LAST.
 *
 * Express 5 compatible wildcard:
 *
 * /{*splat}
 *
 * It serves index.html only for actual frontend routes.
 */
app.get(
  "/{*splat}",
  (_req, res) => {
    res.sendFile(
      INDEX_FILE,
      error => {
        if (error) {
          console.error(
            "index.html send error:",
            error
          );

          if (!res.headersSent) {
            res.status(500).send(
              "Frontend index.html not found."
            );
          }
        }
      }
    );
  }
);

/* =========================================================
   MINING HEARTBEAT
========================================================= */

let miningHeartbeatStarted =
  false;

function startMiningHeartbeat() {
  if (miningHeartbeatStarted) {
    return;
  }

  miningHeartbeatStarted = true;

  setInterval(
    async () => {
      try {
        const users =
          await User.find({
            $or: [
              {
                miningPrincipal: {
                  $gt: 0
                }
              },

              {
                miningAccrued: {
                  $gte: 0
                }
              }
            ]
          })
            .limit(1000);

        for (const user of users) {
          try {
            await settleMining(user);
          } catch (error) {
            console.error(
              `Mining update failed for ${user.telegramId}:`,
              error.message
            );
          }
        }
      } catch (error) {
        console.error(
          "Mining heartbeat failed:",
          error.message
        );
      }
    },

    MINING_HEARTBEAT_MS
  );

  console.log(
    `Mining heartbeat started: ${MINING_HEARTBEAT_MS}ms`
  );
}

/* =========================================================
   SERVER START
========================================================= */

async function main() {
  try {
    console.log(
      "Connecting to MongoDB..."
    );

    await connectDB();

    console.log(
      "MongoDB connected."
    );

    await seedDefaults();

    console.log(
      "Default data checked."
    );

    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `Web app running on port ${PORT}`
        );

        console.log(
          `Public directory: ${PUBLIC_DIR}`
        );

        console.log(
          `Index file: ${INDEX_FILE}`
        );

        console.log(
          `Normal mining/day: ${NORMAL_MINING_DAILY_RATE}`
        );

        console.log(
          `Top-up mining rate/day: ${TOPUP_MINING_DAILY_RATE}`
        );

        startMiningHeartbeat();

        /*
         * Start Telegram bot without blocking server.
         */
        Promise.resolve()
          .then(() => startBot())
          .then(bot => {
            global.botInstance =
              bot;

            console.log(
              "Telegram bot started."
            );
          })
          .catch(error => {
            console.error(
              "Telegram bot failed to start:",
              error
            );
          });
      }
    );
  } catch (error) {
    console.error(
      "Server startup failed:",
      error
    );

    process.exit(1);
  }
}

main();
