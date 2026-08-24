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

/*
|--------------------------------------------------------------------------
| PATHS
|--------------------------------------------------------------------------
*/

const PUBLIC_DIR = path.join(process.cwd(), "public");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");

/*
|--------------------------------------------------------------------------
| STATIC FILES
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This MUST be before the SPA fallback.
|
| /styles.css
| /app.js
| /assets/*
| etc.
|
| will now be served from /public.
|
|--------------------------------------------------------------------------
*/

app.use(
  express.static(PUBLIC_DIR, {
    extensions: ["html"],
    index: false,
    maxAge: "1h"
  })
);

/*
|--------------------------------------------------------------------------
| SECURITY / BODY PARSING
|--------------------------------------------------------------------------
*/

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const PORT = Number(process.env.PORT || 3000);

const CHANNEL_USERNAME = (
  process.env.CHANNEL_USERNAME || "Lucky_Fest_Official"
).replace(/^@/, "");

const CHANNEL_URL =
  process.env.CHANNEL_URL ||
  `https://t.me/${CHANNEL_USERNAME}`;

const BOT_USERNAME = (
  process.env.BOT_USERNAME || ""
).replace(/^@/, "");

const SUPPORT_USERNAME = (
  process.env.SUPPORT_USERNAME || "assistant_bd"
).replace(/^@/, "");

const TOPUP_WALLET =
  process.env.TOPUP_WALLET ||
  "UQCzzBp_io5zdMiOCMykYY7HzUFkhRqST-xMWvr_DzSScooi";

/*
|--------------------------------------------------------------------------
| MINING CONFIG
|--------------------------------------------------------------------------
|
| NORMAL MINING
| Every user gets basic mining even without top-up.
|
| Example:
| NORMAL_MINING_DAILY_RATE=0.005
|
| means base mining principal of 1 USDT generates
| 0.005 USDT/day.
|
| TOP-UP MINING
| Top-up amount becomes the boosted mining principal.
|
| Example:
| 10 USDT top-up
| 0.027 daily rate
| = 10 * 0.027 = 0.27 USDT/day
|
|--------------------------------------------------------------------------
*/

const NORMAL_MINING_PRINCIPAL = Number(
  process.env.NORMAL_MINING_PRINCIPAL || 1
);

const NORMAL_MINING_DAILY_RATE = Number(
  process.env.NORMAL_MINING_DAILY_RATE || 0.005
);

const TOPUP_MINING_DAILY_RATE = Number(
  process.env.TOPUP_MINING_DAILY_RATE || 0.027
);

const MINING_MAX_ELAPSED_SECONDS = Number(
  process.env.MINING_MAX_ELAPSED_SECONDS || 86400 * 365
);

/*
|--------------------------------------------------------------------------
| LEVEL BOOST
|--------------------------------------------------------------------------
|
| Top-up mining can become faster according to user level.
|
|--------------------------------------------------------------------------
*/

function levelMultiplier(level) {
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
|--------------------------------------------------------------------------
| MINING CALCULATION
|--------------------------------------------------------------------------
*/

function calculateMining(user, elapsedSeconds) {
  const elapsed = Math.min(
    Math.max(Number(elapsedSeconds || 0), 0),
    MINING_MAX_ELAPSED_SECONDS
  );

  if (elapsed <= 0) {
    return {
      normalEarned: 0,
      topupEarned: 0,
      totalEarned: 0
    };
  }

  const levelBoost = levelMultiplier(user.level);

  /*
   * NORMAL MINING
   *
   * Every user receives this.
   */
  const normalDailyIncome =
    NORMAL_MINING_PRINCIPAL *
    NORMAL_MINING_DAILY_RATE;

  const normalEarned =
    normalDailyIncome *
    (elapsed / 86400);

  /*
   * TOP-UP BOOSTED MINING
   *
   * Only active when user has a confirmed miningPrincipal.
   */
  let topupEarned = 0;

  const principal = Number(
    user.miningPrincipal || 0
  );

  if (
    user.miningActive &&
    principal > 0
  ) {
    const topupDailyIncome =
      principal *
      TOPUP_MINING_DAILY_RATE *
      levelBoost;

    topupEarned =
      topupDailyIncome *
      (elapsed / 86400);
  }

  return {
    normalEarned,
    topupEarned,
    totalEarned:
      normalEarned +
      topupEarned
  };
}

/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
*/

function auth(req, res, next) {
  try {
    const initData =
      req.headers["x-telegram-init-data"] ||
      req.body?.initData ||
      req.query?.initData;

    const tgUser = verifyTelegramInitData(
      initData,
      process.env.BOT_TOKEN
    );

    if (!tgUser) {
      return res.status(401).json({
        error: "Telegram authorization required"
      });
    }

    req.tgUser = tgUser;

    next();
  } catch (error) {
    console.error("Auth error:", error);

    return res.status(401).json({
      error: "Invalid Telegram authorization"
    });
  }
}

/*
|--------------------------------------------------------------------------
| SETTLE MINING
|--------------------------------------------------------------------------
*/

async function settleMining(user) {
  /*
   * We need a last mining timestamp.
   */
  const now = Date.now();

  const last =
    user.miningLastAt instanceof Date
      ? user.miningLastAt.getTime()
      : user.miningLastAt
        ? new Date(user.miningLastAt).getTime()
        : now;

  const elapsedSeconds = Math.min(
    Math.max((now - last) / 1000, 0),
    MINING_MAX_ELAPSED_SECONDS
  );

  if (elapsedSeconds <= 0) {
    return {
      normalEarned: 0,
      topupEarned: 0,
      totalEarned: 0
    };
  }

  const result = calculateMining(
    user,
    elapsedSeconds
  );

  /*
   * Add mining earnings to pending balance.
   */
  if (result.totalEarned > 0) {
    user.miningAccrued =
      Number(user.miningAccrued || 0) +
      result.totalEarned;
  }

  /*
   * Always update timestamp.
   */
  user.miningLastAt = new Date(now);

  await user.save();

  return result;
}

/*
|--------------------------------------------------------------------------
| GET / CREATE USER
|--------------------------------------------------------------------------
*/

async function getOrCreateUser(tg) {
  const telegramId = String(tg.id);

  let user = await User.findOne({
    telegramId
  });

  /*
   * NEW USER
   */
  if (!user) {
    user = await User.create({
      telegramId,
      username: tg.username || "",
      firstName: tg.first_name || "",
      lastName: tg.last_name || "",
      photoUrl: tg.photo_url || "",
      miningLastAt: new Date(),
      miningAccrued: 0,
      miningPrincipal: 0,
      miningActive: false
    });

    return user;
  }

  /*
   * EXISTING USER
   */
  user.username = tg.username || "";
  user.firstName = tg.first_name || "";
  user.lastName = tg.last_name || "";

  if (tg.photo_url) {
    user.photoUrl = tg.photo_url;
  }

  user.lastSeenAt = new Date();

  /*
   * Settle mining before returning user.
   */
  await settleMining(user);

  /*
   * settleMining already saves the user,
   * but this keeps profile updates safe.
   */
  await user.save();

  return user;
}

/*
|--------------------------------------------------------------------------
| SERIALIZE USER
|--------------------------------------------------------------------------
*/

function serializeUser(user) {
  const miningAccrued =
    Number(user.miningAccrued || 0);

  const miningPrincipal =
    Number(user.miningPrincipal || 0);

  const level =
    Number(user.level || 1);

  const boost =
    levelMultiplier(level);

  const normalDaily =
    NORMAL_MINING_PRINCIPAL *
    NORMAL_MINING_DAILY_RATE;

  const topupDaily =
    user.miningActive &&
    miningPrincipal > 0
      ? miningPrincipal *
        TOPUP_MINING_DAILY_RATE *
        boost
      : 0;

  const totalDaily =
    normalDaily +
    topupDaily;

  const totalHourly =
    totalDaily / 24;

  const totalMonthly =
    totalDaily * 30;

  const coins =
    Number(user.coins || 0);

  const usdt =
    Number(user.usdt || 0);

  return {
    telegramId: user.telegramId,

    username:
      user.username || "",

    name:
      [
        user.firstName,
        user.lastName
      ]
        .filter(Boolean)
        .join(" ") || "User",

    photoUrl:
      user.photoUrl ||
      "/assets/assistant-logo.jpg",

    level,

    coins:
      Number(coins.toFixed(4)),

    usdt:
      Number(usdt.toFixed(8)),

    /*
     * Pending mining is included here.
     */
    totalBalance:
      Number(
        (
          coins +
          usdt +
          miningAccrued
        ).toFixed(8)
      ),

    /*
     * Mining information
     */
    miningAccrued:
      Number(
        miningAccrued.toFixed(8)
      ),

    miningPrincipal:
      Number(
        miningPrincipal.toFixed(8)
      ),

    miningActive:
      !!user.miningActive,

    normalMiningDaily:
      Number(
        normalDaily.toFixed(8)
      ),

    topupMiningDaily:
      Number(
        topupDaily.toFixed(8)
      ),

    miningDaily:
      Number(
        totalDaily.toFixed(8)
      ),

    incomeHour:
      Number(
        totalHourly.toFixed(8)
      ),

    incomeDay:
      Number(
        totalDaily.toFixed(8)
      ),

    incomeMonth:
      Number(
        totalMonthly.toFixed(8)
      ),

    miningRateNormal:
      NORMAL_MINING_DAILY_RATE,

    miningRateTopup:
      TOPUP_MINING_DAILY_RATE,

    levelMultiplier:
      boost,

    /*
     * Referral
     */
    referralIncome:
      Number(
        (user.referralIncome || 0).toFixed(8)
      ),

    referralCoins:
      Number(
        (user.referralCoins || 0).toFixed(4)
      ),

    referralCount:
      Number(user.referralCount || 0),

    gifts:
      Number(user.gifts || 0),

    /*
     * Withdraw
     */
    withdrawnUsdt:
      Number(
        (user.withdrawnUsdt || 0).toFixed(8)
      ),

    claimedUsdt:
      Number(
        (user.claimedUsdt || 0).toFixed(8)
      ),

    /*
     * Settings
     */
    language:
      user.language || "English",

    theme:
      user.theme || "dark",

    /*
     * Wallet
     */
    walletAddress:
      user.walletAddress || "",

    walletName:
      user.walletName || ""
  };
}

/*
|--------------------------------------------------------------------------
| DEFAULT FAQ + TASKS
|--------------------------------------------------------------------------
*/

async function seedDefaults() {
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
        "Every registered user receives basic server-side mining. You do not need to keep the Mini App open."
      ],
      [
        "How does top-up mining work?",
        "After an administrator confirms your top-up, the confirmed amount becomes your mining principal and gives you additional boosted mining income."
      ],
      [
        "Can I mine without top-up?",
        "Yes. Normal mining continues even when your mining principal is zero."
      ],
      [
        "Does mining continue when I close the app?",
        "Yes. Mining is calculated by the server using elapsed time."
      ],
      [
        "When does boosted mining start?",
        "Boosted mining starts after an administrator confirms the top-up."
      ],
      [
        "How do I top up?",
        "Enter the amount in Top Up. The app creates a pending payment request and shows the configured receiving wallet."
      ],
      [
        "What tasks can I complete?",
        "Tasks can include joining the official Telegram channel, starting the configured bot and visiting websites."
      ],
      [
        "How is a channel task verified?",
        "The Telegram bot checks the user's membership status."
      ],
      [
        "How does a bot-start task work?",
        "Open the configured bot and press Start, then return to the Mini App."
      ],
      [
        "How does a website task work?",
        "Open the task link and keep it open for the required time before verifying."
      ],
      [
        "How do referrals work?",
        "Referral rewards are controlled by the application's referral system."
      ],
      [
        "What is the minimum withdrawal?",
        "The minimum withdrawal is controlled by MIN_WITHDRAW_USDT."
      ],
      [
        "Can I connect a wallet?",
        "Yes. Use Wallet Connect in Account."
      ],
      [
        "Where can I see transactions?",
        "Open Account → Operations."
      ],
      [
        "How do I change language?",
        "Open Account → Language."
      ],
      [
        "How do I change theme?",
        "Open Account → Theme."
      ],
      [
        "How do I contact support?",
        "Use the Help button."
      ],
      [
        "Is payment automatically credited?",
        "No. A payment must be verified before a top-up becomes active."
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
    await Task.insertMany([
      {
        title:
          "Join Lucky Fest Official",

        description:
          "Join the official Telegram channel and verify your membership.",

        type:
          "channel_join",

        target:
          `@${CHANNEL_USERNAME}`,

        url:
          CHANNEL_URL,

        rewardCoins:
          25,

        order:
          1
      },

      {
        title:
          "Start Lucky Fest Bot",

        description:
          "Open the bot and press Start. Then return here to verify.",

        type:
          "bot_start",

        target:
          BOT_USERNAME,

        url:
          BOT_USERNAME
            ? `https://t.me/${BOT_USERNAME}`
            : "",

        rewardCoins:
          20,

        order:
          2
      },

      {
        title:
          "Visit our website",

        description:
          "Open the website and stay for a few seconds, then return to verify.",

        type:
          "website_visit",

        target:
          "official-site",

        url:
          process.env.WEB_APP_URL || "",

        rewardCoins:
          15,

        minVisitSeconds:
          6,

        order:
          3
      }
    ]);
  }
}

/*
|--------------------------------------------------------------------------
| TON CONNECT MANIFEST
|--------------------------------------------------------------------------
*/

app.get(
  "/tonconnect-manifest.json",
  (req, res) => {
    const origin =
      `${req.protocol}://${req.get("host")}`;

    res.json({
      url:
        origin,

      name:
        "Lucky Fest",

      iconUrl:
        `${origin}/assets/assistant-logo.jpg`
    });
  }
);

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

app.get(
  "/health",
  (_req, res) => {
    res.json({
      ok: true,
      service: "lucky-fest"
    });
  }
);

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

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

      botUsername:
        BOT_USERNAME,

      mining: {
        normalDailyRate:
          NORMAL_MINING_DAILY_RATE,

        normalPrincipal:
          NORMAL_MINING_PRINCIPAL,

        topupDailyRate:
          TOPUP_MINING_DAILY_RATE,

        maxElapsedSeconds:
          MINING_MAX_ELAPSED_SECONDS
      }
    });
  }
);

/*
|--------------------------------------------------------------------------
| CURRENT USER
|--------------------------------------------------------------------------
*/

app.get(
  "/api/me",
  auth,
  async (req, res) => {
    try {
      const user =
        await getOrCreateUser(
          req.tgUser
        );

      res.json(
        serializeUser(user)
      );
    } catch (error) {
      console.error(
        "GET /api/me:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load account"
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| PRESENCE
|--------------------------------------------------------------------------
*/

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
          new: true
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

/*
|--------------------------------------------------------------------------
| REFERRALS
|--------------------------------------------------------------------------
*/

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
          Number(user.referralCount || 0),

        direct:
          direct.map((item) => ({
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

/*
|--------------------------------------------------------------------------
| ACCOUNT
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| FAQ
|--------------------------------------------------------------------------
*/

app.get(
  "/api/faq",
  auth,
  async (_req, res) => {
    try {
      const faqs =
        await FAQ.find({
          active: true
        })
          .sort({
            order: 1
          })
          .limit(50);

      res.json(faqs);
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

/*
|--------------------------------------------------------------------------
| TRANSACTIONS
|--------------------------------------------------------------------------
*/

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

      res.json(transactions);
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

/*
|--------------------------------------------------------------------------
| TASKS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/tasks",
  auth,
  async (req, res) => {
    try {
      const tasks =
        await Task.find({
          active: true
        }).sort({
          order: 1,
          createdAt: 1
        });

      const completions =
        await TaskCompletion.find({
          telegramId:
            String(req.tgUser.id)
        });

      const completionMap =
        new Map(
          completions.map(
            (completion) => [
              String(completion.taskId),
              completion
            ]
          )
        );

      res.json(
        tasks.map((task) => {
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

/*
|--------------------------------------------------------------------------
| START TASK
|--------------------------------------------------------------------------
*/

app.post(
  "/api/tasks/:id/start",
  auth,
  async (req, res) => {
    try {
      const task =
        await Task.findOne({
          _id:
            req.params.id,

          active:
            true
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
          taskId:
            task._id
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
        "Start task error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to start task."
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| VERIFY TASK
|--------------------------------------------------------------------------
*/

app.post(
  "/api/tasks/:id/verify",
  auth,
  async (req, res) => {
    try {
      const task =
        await Task.findOne({
          _id:
            req.params.id,

          active:
            true
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

      /*
       * Website task
       */
      if (
        task.type ===
        "website_visit"
      ) {
        const startedAt =
          completion.startedAt
            ? completion.startedAt.getTime()
            : Date.now();

        const seconds =
          (Date.now() -
            startedAt) /
          1000;

        const required =
          Number(
            task.minVisitSeconds || 0
          );

        if (seconds < required) {
          return res.status(400).json({
            error:
              `Please keep the task open for ${required} seconds.`
          });
        }
      }

      /*
       * Channel task
       */
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

              Number(
                user.telegramId
              )
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

      /*
       * Bot start task
       */
      if (
        task.type ===
        "bot_start"
      ) {
        if (
          !BOT_USERNAME ||
          task.target ===
            BOT_USERNAME
        ) {
          /*
           * Existing bot backend verification.
           */
        } else {
          return res.status(400).json({
            error:
              "This bot-start task requires its target bot to be configured."
          });
        }
      }

      /*
       * Complete
       */
      completion.status =
        "completed";

      completion.completedAt =
        new Date();

      await completion.save();

      const rewardCoins =
        Number(
          task.rewardCoins || 0
        );

      const rewardUsdt =
        Number(
          task.rewardUsdt || 0
        );

      user.coins =
        Number(user.coins || 0) +
        rewardCoins;

      user.usdt =
        Number(user.usdt || 0) +
        rewardUsdt;

      await user.save();

      await Transaction.create({
        telegramId:
          user.telegramId,

        type:
          "task",

        coins:
          rewardCoins,

        amount:
          rewardUsdt,

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
          `Task complete! +${rewardCoins} coins`,

        user:
          serializeUser(user)
      });
    } catch (error) {
      console.error(
        "Verify task error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to verify task."
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| THEME
|--------------------------------------------------------------------------
*/

app.post(
  "/api/theme",
  auth,
  async (req, res) => {
    try {
      const theme =
        req.body.theme ===
        "light"
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
          "Failed to save theme"
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| LANGUAGE
|--------------------------------------------------------------------------
*/

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
          "Failed to save language"
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| WALLET SAVE
|--------------------------------------------------------------------------
*/

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
          "Failed to save wallet"
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| WALLET DELETE
|--------------------------------------------------------------------------
*/

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
          "Failed to remove wallet"
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| CLAIM MINING
|--------------------------------------------------------------------------
*/

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
       * Make sure latest mining is settled.
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
        Number(user.claimedUsdt || 0) +
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
          "Auto mining profit claim"
      });

      res.json({
        ok: true,

        user:
          serializeUser(user),

        claimed:
          amount
      });
    } catch (error) {
      console.error(
        "Claim error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to claim mining profit"
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| TOP UP REQUEST
|--------------------------------------------------------------------------
*/

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
        Number(req.body.amount);

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
       * Top-up does NOT activate mining here.
       *
       * It remains pending until admin confirms it.
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
              "",
              `User: ${user.telegramId}`,
              `Amount: ${amount} USDT`,
              `Request: ${tx._id}`,
              "",
              "Status: PENDING"
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

/*
|--------------------------------------------------------------------------
| WITHDRAW
|--------------------------------------------------------------------------
*/

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
        Number(req.body.amount);

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
              "",
              `User: ${user.telegramId}`,
              `Amount: ${amount} USDT`,
              `Wallet: ${wallet}`,
              `Request: ${tx._id}`,
              "",
              "Status: PENDING"
            ].join("\n")
          );
        } catch (error) {
          console.error(
            "Admin withdrawal notification failed:",
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

/*
|--------------------------------------------------------------------------
| SUBSCRIBE REWARD
|--------------------------------------------------------------------------
*/

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
          "Failed to claim reward."
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| SPA FALLBACK
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This is AFTER express.static().
|
| API routes are already registered above,
| so this catches only frontend routes.
|
|--------------------------------------------------------------------------
*/

app.get(
  "/{*splat}",
  (req, res) => {
    /*
     * Never return index.html for asset files.
     */
    if (
      path.extname(req.path)
    ) {
      return res.status(404).end();
    }

    res.sendFile(
      INDEX_FILE
    );
  }
);

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

async function main() {
  try {
    /*
     * Connect MongoDB
     */
    await connectDB();

    /*
     * Seed FAQ + Tasks
     */
    await seedDefaults();

    /*
     * Start Express
     */
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
          `Normal mining daily rate: ${NORMAL_MINING_DAILY_RATE}`
        );

        console.log(
          `Top-up mining daily rate: ${TOPUP_MINING_DAILY_RATE}`
        );

        /*
         * -------------------------------------------------------
         * MINING HEARTBEAT
         * -------------------------------------------------------
         *
         * This periodically settles active top-up miners.
         *
         * Normal mining is also settled whenever the user
         * connects/opens the app, because settleMining()
         * calculates elapsed time from miningLastAt.
         *
         * -------------------------------------------------------
         */

        setInterval(
          async () => {
            try {
              const users =
                await User.find({
                  $or: [
                    {
                      miningActive:
                        true,

                      miningPrincipal:
                        {
                          $gt: 0
                        }
                    },

                    {
                      miningLastAt:
                        {
                          $lt:
                            new Date()
                        }
                    }
                  ]
                }).limit(1000);

              for (
                const user of users
              ) {
                await settleMining(
                  user
                );
              }

              console.log(
                `Mining heartbeat settled ${users.length} users`
              );
            } catch (error) {
              console.error(
                "Mining heartbeat failed:",
                error.message
              );
            }
          },

          60000
        );

        /*
         * -------------------------------------------------------
         * TELEGRAM BOT
         * -------------------------------------------------------
         */

        Promise.resolve()
          .then(() =>
            startBot()
          )
          .then((bot) => {
            global.botInstance =
              bot;

            console.log(
              "Telegram bot started successfully."
            );
          })
          .catch((error) => {
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
