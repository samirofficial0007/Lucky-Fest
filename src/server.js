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
   BASIC APP CONFIG
========================================================= */

app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.json({
  limit: "1mb"
}));

app.use(express.urlencoded({
  extended: false
}));

const PORT = process.env.PORT || 3000;


/* =========================================================
   PROJECT CONFIG
========================================================= */

const CHANNEL_USERNAME =
  (process.env.CHANNEL_USERNAME || "Lucky_Fest_Official")
    .replace(/^@/, "");

const CHANNEL_URL =
  process.env.CHANNEL_URL ||
  "https://t.me/Lucky_Fest_Official";

const TOPUP_WALLET =
  process.env.TOPUP_WALLET ||
  "UQCzzBp_io5zdMiOCMykYY7HzUFkhRqST-xMWvr_DzSScooi";

const SUPPORT_USERNAME =
  (process.env.SUPPORT_USERNAME || "assistant_bd")
    .replace(/^@/, "");

const WEB_APP_URL =
  process.env.WEB_APP_URL || "";


/* =========================================================
   MINING CONFIG
========================================================= */

/*
  NORMAL MINING
  -------------------------
  Every registered user receives
  normal mining even without top-up.

  Example:
  0.001 USDT/day
*/

const NORMAL_MINING_DAILY_RATE =
  Number(process.env.NORMAL_MINING_DAILY_RATE || 0.001);


/*
  TOP-UP / BOOST MINING
  -------------------------
  If user has confirmed miningPrincipal,
  this rate is applied to that principal.

  Example:
  100 USDT × 0.027/day
  = 2.7 USDT/day
*/

const MINING_DAILY_RATE =
  Number(process.env.MINING_DAILY_RATE || 0.027);


/*
  Prevent huge elapsed-time calculations.
  Default = 365 days.
*/

const MINING_MAX_ELAPSED_SECONDS =
  Number(
    process.env.MINING_MAX_ELAPSED_SECONDS ||
    (86400 * 365)
  );


/*
  Minimum withdrawal.
*/

const MIN_WITHDRAW_USDT =
  Number(process.env.MIN_WITHDRAW_USDT || 1);


/* =========================================================
   TELEGRAM AUTH MIDDLEWARE
========================================================= */

function auth(req, res, next) {

  try {

    const initData =
      req.headers["x-telegram-init-data"] ||
      req.body?.initData;

    const tgUser =
      verifyTelegramInitData(
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

    console.error("Telegram auth error:", error);

    return res.status(401).json({
      error: "Invalid Telegram authorization"
    });

  }

}


/* =========================================================
   NUMBER HELPERS
========================================================= */

function safeNumber(value, fallback = 0) {

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;

}


/* =========================================================
   MINING LEVEL RATE
========================================================= */

function miningRateForLevel(level) {

  const base =
    safeNumber(
      MINING_DAILY_RATE,
      0.027
    );

  const rates = {

    1: base,

    2: base * 1.15,

    3: base * 1.30,

    4: base * 1.50,

    5: base * 1.75

  };

  const currentLevel =
    Math.min(
      Math.max(
        safeNumber(level, 1),
        1
      ),
      5
    );

  return (
    rates[currentLevel] ||
    base
  );

}


/* =========================================================
   NORMAL MINING
========================================================= */

function calculateNormalMining(elapsedSeconds) {

  if (
    elapsedSeconds <= 0 ||
    NORMAL_MINING_DAILY_RATE <= 0
  ) {

    return 0;

  }

  return (
    NORMAL_MINING_DAILY_RATE *
    (elapsedSeconds / 86400)
  );

}


/* =========================================================
   BOOST / TOP-UP MINING
========================================================= */

function calculateBoostMining(
  principal,
  level,
  elapsedSeconds
) {

  principal =
    safeNumber(principal);

  if (
    principal <= 0 ||
    elapsedSeconds <= 0
  ) {

    return 0;

  }

  const dailyRate =
    miningRateForLevel(level);

  return (
    principal *
    dailyRate *
    (elapsedSeconds / 86400)
  );

}


/* =========================================================
   SETTLE MINING
========================================================= */

/*
  IMPORTANT:

  Normal mining:
      Always active.

  Boost mining:
      Only active when:
        miningActive === true
        AND
        miningPrincipal > 0

  Both earnings are added to:
      miningAccrued
*/

async function settleMining(user) {

  if (!user) {
    return {
      normal: 0,
      boost: 0,
      total: 0
    };
  }


  const now =
    Date.now();


  let last =
    user.miningLastAt
      ? user.miningLastAt.getTime()
      : now;


  /*
    Safety:
    If old/invalid date exists,
    start from now.
  */

  if (
    !Number.isFinite(last) ||
    last > now
  ) {

    last = now;

  }


  let elapsed =
    (now - last) / 1000;


  elapsed =
    Math.min(
      Math.max(elapsed, 0),
      MINING_MAX_ELAPSED_SECONDS
    );


  if (elapsed <= 0) {

    return {
      normal: 0,
      boost: 0,
      total: 0
    };

  }


  /* -----------------------------------------
     NORMAL MINING
  ----------------------------------------- */

  const normalEarned =
    calculateNormalMining(
      elapsed
    );


  /* -----------------------------------------
     BOOST MINING
  ----------------------------------------- */

  let boostEarned = 0;


  if (
    user.miningActive === true &&
    safeNumber(user.miningPrincipal) > 0
  ) {

    boostEarned =
      calculateBoostMining(
        safeNumber(user.miningPrincipal),
        safeNumber(user.level, 1),
        elapsed
      );

  }


  const totalEarned =
    normalEarned +
    boostEarned;


  /*
    Save accumulated mining.
  */

  if (totalEarned > 0) {

    user.miningAccrued =
      safeNumber(user.miningAccrued) +
      totalEarned;

  }


  /*
    VERY IMPORTANT:
    Move miningLastAt forward even if
    earning is zero.
  */

  user.miningLastAt =
    new Date(now);


  await user.save();


  return {

    normal: normalEarned,

    boost: boostEarned,

    total: totalEarned

  };

}


/* =========================================================
   CREATE / UPDATE USER
========================================================= */

async function getOrCreateUser(tg) {

  const telegramId =
    String(tg.id);


  let user =
    await User.findOne({
      telegramId
    });


  /* -----------------------------------------
     NEW USER
  ----------------------------------------- */

  if (!user) {

    user =
      await User.create({

        telegramId,

        username:
          tg.username || "",

        firstName:
          tg.first_name || "",

        lastName:
          tg.last_name || "",

        photoUrl:
          tg.photo_url || "",

        miningLastAt:
          new Date(),

        miningAccrued:
          0,

        miningPrincipal:
          0,

        miningActive:
          false

      });


    return user;

  }


  /* -----------------------------------------
     EXISTING USER
  ----------------------------------------- */

  /*
    First settle old mining.
    This ensures the user gets earning
    for time spent away from the app.
  */

  await settleMining(user);


  user.username =
    tg.username || "";

  user.firstName =
    tg.first_name || "";

  user.lastName =
    tg.last_name || "";

  user.photoUrl =
    tg.photo_url ||
    user.photoUrl ||
    "";

  user.lastSeenAt =
    new Date();


  await user.save();


  return user;

}


/* =========================================================
   SERIALIZE USER
========================================================= */

function serializeUser(u) {

  const coins =
    safeNumber(u.coins);

  const usdt =
    safeNumber(u.usdt);

  const miningAccrued =
    safeNumber(u.miningAccrued);

  const principal =
    safeNumber(u.miningPrincipal);

  const level =
    safeNumber(u.level, 1);


  const boostDailyRate =
    miningRateForLevel(level);


  const normalDailyIncome =
    NORMAL_MINING_DAILY_RATE;


  const boostDailyIncome =
    principal > 0
      ? principal * boostDailyRate
      : 0;


  const totalDailyIncome =
    normalDailyIncome +
    (
      u.miningActive
        ? boostDailyIncome
        : 0
    );


  return {

    telegramId:
      u.telegramId,

    username:
      u.username || "",

    name:
      [
        u.firstName,
        u.lastName
      ]
        .filter(Boolean)
        .join(" ")
        || "User",


    photoUrl:
      u.photoUrl ||
      "/assets/assistant-logo.jpg",


    level,


    coins:
      Number(
        coins.toFixed(4)
      ),


    usdt:
      Number(
        usdt.toFixed(8)
      ),


    /*
      Current accumulated amount
      waiting to be claimed.
    */

    miningAccrued:
      Number(
        miningAccrued.toFixed(8)
      ),


    /*
      Total display balance.
    */

    totalBalance:
      Number(
        (
          coins +
          usdt +
          miningAccrued
        ).toFixed(8)
      ),


    /* ---------------------------------------
       NORMAL MINING
    --------------------------------------- */

    normalMiningDaily:
      Number(
        normalDailyIncome.toFixed(8)
      ),


    normalMiningHour:
      Number(
        (
          normalDailyIncome / 24
        ).toFixed(8)
      ),


    /* ---------------------------------------
       TOP-UP BOOST MINING
    --------------------------------------- */

    miningPrincipal:
      Number(
        principal.toFixed(8)
      ),


    miningActive:
      !!u.miningActive,


    miningRateDaily:
      Number(
        boostDailyRate.toFixed(8)
      ),


    boostMiningDaily:
      Number(
        boostDailyIncome.toFixed(8)
      ),


    /* ---------------------------------------
       TOTAL INCOME
    --------------------------------------- */

    incomeHour:
      Number(
        (
          totalDailyIncome / 24
        ).toFixed(8)
      ),


    incomeDay:
      Number(
        totalDailyIncome.toFixed(8)
      ),


    incomeMonth:
      Number(
        (
          totalDailyIncome * 30
        ).toFixed(8)
      ),


    referralIncome:
      Number(
        safeNumber(
          u.referralIncome
        ).toFixed(8)
      ),


    referralCoins:
      Number(
        safeNumber(
          u.referralCoins
        ).toFixed(4)
      ),


    withdrawnUsdt:
      Number(
        safeNumber(
          u.withdrawnUsdt
        ).toFixed(8)
      ),


    referralCount:
      safeNumber(
        u.referralCount
      ),


    gifts:
      safeNumber(
        u.gifts
      ),


    language:
      u.language ||
      "English",


    theme:
      u.theme ||
      "dark",


    walletAddress:
      u.walletAddress ||
      "",


    walletName:
      u.walletName ||
      ""

  };

}


/* =========================================================
   DEFAULT FAQ + TASKS
========================================================= */

async function seedDefaults() {

  /* -----------------------------------------
     FAQ
  ----------------------------------------- */

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
        "Every registered user receives normal mining automatically. You do not need to make a top-up to receive normal mining."
      ],

      [
        "How does boost mining work?",
        "After a valid top-up is confirmed, the confirmed amount becomes your mining principal. The principal generates additional mining income while normal mining continues."
      ],

      [
        "Does mining work when the app is closed?",
        "Yes. Mining is calculated on the server from the last mining time. You do not need to keep the Mini App open."
      ],

      [
        "When does boost mining start?",
        "Boost mining starts after an administrator confirms a valid top-up."
      ],

      [
        "How do I top up?",
        "Enter your amount in Top Up. The app creates a pending payment request and shows the configured receiving wallet. Send the required amount and wait for confirmation."
      ],

      [
        "What tasks can I complete?",
        "Tasks can include joining the official Telegram channel, starting the configured bot and visiting websites."
      ],

      [
        "How is a channel task verified?",
        "The bot checks your Telegram channel membership. The bot must have the required permission in the configured channel."
      ],

      [
        "How does a bot-start task work?",
        "Open the configured bot and press Start, then return to the Mini App and verify the task."
      ],

      [
        "How does a website task work?",
        "Open the task link and keep it open for the required time. Then return to the Mini App and press Verify."
      ],

      [
        "How do referrals work?",
        "Your referral link can reward coins and gifts for successful registrations."
      ],

      [
        "What is the minimum withdrawal?",
        "The minimum withdrawal is controlled by the MIN_WITHDRAW_USDT server setting."
      ],

      [
        "Can I connect a wallet?",
        "Yes. Use Wallet Connect in Account. TON Connect opens a supported wallet picker without exposing private keys."
      ],

      [
        "Where can I see transactions?",
        "Open Account → Operations to see recent top-ups, mining claims, withdrawals, task rewards and referral activity."
      ],

      [
        "How do I change language?",
        "Open Account → Language and choose one of the available languages."
      ],

      [
        "How do I change theme?",
        "Open Account → Theme and choose Light or Dark."
      ],

      [
        "How do I contact support?",
        `Use the Help button or open https://t.me/${SUPPORT_USERNAME}.`
      ],

      [
        "Is payment automatically credited?",
        "No. A pending payment does not activate boost mining until the payment is confirmed."
      ],

      [
        "What happens to a rejected top-up?",
        "A rejected payment does not increase your mining principal."
      ],

      [
        "How do I open the official channel?",
        `Use the channel task or open ${CHANNEL_URL}.`
      ]

    ];


    await FAQ.insertMany(

      faqs.map(
        (x, i) => ({

          question:
            x[0],

          answer:
            x[1],

          order:
            i + 1

        })
      )

    );

  }


  /* -----------------------------------------
     TASKS
  ----------------------------------------- */

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
          process.env.BOT_USERNAME || "",

        url:
          process.env.BOT_USERNAME
            ? `https://t.me/${process.env.BOT_USERNAME}`
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
          WEB_APP_URL,

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


/* =========================================================
   TON CONNECT MANIFEST
========================================================= */

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


/* =========================================================
   CONFIG API
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

      botUsername:
        process.env.BOT_USERNAME || "",

      normalMiningDaily:
        NORMAL_MINING_DAILY_RATE,

      boostMiningDaily:
        MINING_DAILY_RATE,

      minWithdrawUsdt:
        MIN_WITHDRAW_USDT

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

      ok:
        true,

      service:
        "lucky-fest"

    });

  }
);


/* =========================================================
   CURRENT USER
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
        Make sure latest mining is settled.
      */

      await settleMining(user);


      res.json(
        serializeUser(user)
      );

    } catch (e) {

      console.error(
        "GET /api/me error:",
        e
      );

      res.status(500).json({

        error:
          "Failed to load account"

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

      await Presence.findOneAndUpdate(

        {
          telegramId:
            String(req.tgUser.id)
        },

        {

          telegramId:
            String(req.tgUser.id),

          lastSeenAt:
            new Date()

        },

        {
          upsert:
            true
        }

      );


      const online =
        await Presence.countDocuments({

          lastSeenAt: {
            $gte:
              new Date(
                Date.now() -
                45000
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
          createdAt:
            -1
        })
        .limit(100);


    res.json({

      referralCount:
        safeNumber(
          user.referralCount
        ),

      direct:
        direct.map(x => ({

          telegramId:
            x.telegramId,

          name:
            [
              x.firstName,
              x.lastName
            ]
              .filter(Boolean)
              .join(" ")
              ||
              x.username
              ||
              "User",

          username:
            x.username ||
            "",

          joinedAt:
            x.createdAt

        }))

    });

  }
);


/* =========================================================
   ACCOUNT
========================================================= */

app.get(
  "/api/account",
  auth,
  async (req, res) => {

    const user =
      await getOrCreateUser(
        req.tgUser
      );


    let invitedBy =
      null;


    if (
      user.referrerTelegramId
    ) {

      const r =
        await User.findOne({

          telegramId:
            user.referrerTelegramId

        });


      if (r) {

        invitedBy = {

          name:
            [
              r.firstName,
              r.lastName
            ]
              .filter(Boolean)
              .join(" ")
              ||
              "User",

          username:
            r.username ||
            ""

        };

      }

    }


    const operations =
      await Transaction.find({

        telegramId:
          user.telegramId

      })
        .sort({
          createdAt:
            -1
        })
        .limit(100);


    res.json({

      user:
        serializeUser(user),

      invitedBy,

      operations

    });

  }
);


/* =========================================================
   FAQ
========================================================= */

app.get(
  "/api/faq",
  auth,
  async (_req, res) => {

    res.json(

      await FAQ.find({
        active:
          true
      })
        .sort({
          order:
            1
        })
        .limit(50)

    );

  }
);


/* =========================================================
   TRANSACTIONS
========================================================= */

app.get(
  "/api/transactions",
  auth,
  async (req, res) => {

    const user =
      await getOrCreateUser(
        req.tgUser
      );


    res.json(

      await Transaction.find({

        telegramId:
          user.telegramId

      })
        .sort({
          createdAt:
            -1
        })
        .limit(100)

    );

  }
);


/* =========================================================
   TASKS
========================================================= */

app.get(
  "/api/tasks",
  auth,
  async (req, res) => {

    const tasks =
      await Task.find({
        active:
          true
      })
        .sort({
          order:
            1,

          createdAt:
            1
        });


    const completions =
      await TaskCompletion.find({

        telegramId:
          String(req.tgUser.id)

      });


    const map =
      new Map(

        completions.map(
          c => [
            String(c.taskId),
            c
          ]
        )

      );


    res.json(

      tasks.map(t => {

        const completion =
          map.get(
            String(t._id)
          );


        return {

          ...t.toObject(),

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
        String(
          req.tgUser.id
        );


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

          ok:
            true,

          completed:
            true,

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

        ok:
          true,

        task,

        verifyAfterSeconds:
          task.type ===
          "website_visit"
            ? task.minVisitSeconds
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

          ok:
            true,

          completed:
            true,

          user:
            serializeUser(user)

        });

      }


      /* ---------------------------------------
         WEBSITE TASK
      --------------------------------------- */

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
          task.minVisitSeconds
        ) {

          return res.status(400).json({

            error:
              `Please keep the task open for ${task.minVisitSeconds} seconds.`

          });

        }

      }


      /* ---------------------------------------
         CHANNEL TASK
      --------------------------------------- */

      if (
        task.type ===
        "channel_join"
      ) {

        if (
          !global.botInstance
        ) {

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

        } catch (e) {

          console.error(
            "Channel verification failed:",
            e.message
          );


          return res.status(400).json({

            error:
              "Channel verification failed. Make sure the bot is an administrator in the channel."

          });

        }

      }


      /* ---------------------------------------
         BOT START TASK
      --------------------------------------- */

      if (
        task.type ===
        "bot_start"
      ) {

        if (
          !process.env.BOT_USERNAME ||
          task.target ===
          process.env.BOT_USERNAME
        ) {

          /*
            Existing bot-start behaviour.
          */

        } else {

          return res.status(400).json({

            error:
              "This bot-start task requires its target bot to be configured for verification."

          });

        }

      }


      /* ---------------------------------------
         COMPLETE
      --------------------------------------- */

      completion.status =
        "completed";

      completion.completedAt =
        new Date();


      await completion.save();


      const rewardCoins =
        safeNumber(
          task.rewardCoins
        );


      const rewardUsdt =
        safeNumber(
          task.rewardUsdt
        );


      user.coins =
        safeNumber(
          user.coins
        ) +
        rewardCoins;


      user.usdt =
        safeNumber(
          user.usdt
        ) +
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
            String(
              task._id
            )

        }

      });


      res.json({

        ok:
          true,

        message:
          `Task complete! +${rewardCoins} coins`,

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
          "Task verification failed."

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

      ok:
        true,

      theme

    });

  }
);


/* =========================================================
   LANGUAGE
========================================================= */

app.post(
  "/api/language",
  auth,
  async (req, res) => {

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

      ok:
        true,

      language

    });

  }
);


/* =========================================================
   SAVE WALLET
========================================================= */

app.post(
  "/api/wallet",
  auth,
  async (req, res) => {

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
        .slice(
          0,
          60
        );


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

      ok:
        true,

      user:
        serializeUser(user)

    });

  }
);


/* =========================================================
   DELETE WALLET
========================================================= */

app.delete(
  "/api/wallet",
  auth,
  async (req, res) => {

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

      ok:
        true,

      user:
        serializeUser(user)

    });

  }
);


/* =========================================================
   MINING STATUS
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


      /*
        Settle latest normal +
        boost mining.
      */

      const earned =
        await settleMining(user);


      res.json({

        ok:
          true,

        earned,

        user:
          serializeUser(user)

      });

    } catch (error) {

      console.error(
        "Mining status error:",
        error
      );

      res.status(500).json({

        error:
          "Failed to load mining status."

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
        First calculate everything
        accumulated since last update.
      */

      await settleMining(user);


      const amount =
        safeNumber(
          user.miningAccrued
        );


      if (
        amount <= 0
      ) {

        return res.status(400).json({

          error:
            "No mining profit is ready to claim yet."

        });

      }


      /*
        Move mining amount to
        actual USDT balance.
      */

      user.miningAccrued =
        0;


      user.usdt =
        safeNumber(
          user.usdt
        ) +
        amount;


      user.claimedUsdt =
        safeNumber(
          user.claimedUsdt
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
          "Normal + Boost auto mining profit claim",

        status:
          "completed"

      });


      res.json({

        ok:
          true,

        claimed:
          Number(
            amount.toFixed(8)
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
        IMPORTANT:

        Do NOT activate mining here.

        Payment is pending until admin /
        payment verification confirms it.
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


      /* ---------------------------------------
         ADMIN NOTIFICATION
      --------------------------------------- */

      if (
        process.env.ADMIN_CHAT_ID &&
        global.botInstance
      ) {

        try {

          await global.botInstance.telegram.sendMessage(

            process.env.ADMIN_CHAT_ID,

            `💵 Top-up request

User: ${user.telegramId}
Amount: ${amount} USDT
Request: ${tx._id}`

          );

        } catch (e) {

          console.error(
            "Admin notification failed:",
            e.message
          );

        }

      }


      res.json({

        ok:
          true,

        transactionId:
          String(
            tx._id
          ),

        wallet:
          TOPUP_WALLET,

        amount,

        message:
          `Send exactly ${amount} USDT to the wallet shown, then wait for payment confirmation.`

      });

    } catch (error) {

      console.error(
        "Top-up error:",
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


      /*
        Settle latest mining first.
      */

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


      if (
        !Number.isFinite(amount) ||
        amount < MIN_WITHDRAW_USDT
      ) {

        return res.status(400).json({

          error:
            `Minimum withdrawal is ${MIN_WITHDRAW_USDT} USDT.`

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
        safeNumber(
          user.usdt
        )
      ) {

        return res.status(400).json({

          error:
            "Insufficient USDT balance."

        });

      }


      /*
        Reserve balance immediately.
      */

      user.usdt =
        safeNumber(
          user.usdt
        ) -
        amount;


      user.withdrawnUsdt =
        safeNumber(
          user.withdrawnUsdt
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


      /* ---------------------------------------
         ADMIN NOTIFICATION
      --------------------------------------- */

      if (
        process.env.ADMIN_CHAT_ID &&
        global.botInstance
      ) {

        try {

          await global.botInstance.telegram.sendMessage(

            process.env.ADMIN_CHAT_ID,

            `💸 Withdrawal request

User: ${user.telegramId}
Amount: ${amount} USDT
Wallet: ${wallet}
Request: ${tx._id}`

          );

        } catch (e) {

          console.error(
            "Admin withdrawal notification failed:",
            e.message
          );

        }

      }


      res.json({

        ok:
          true,

        user:
          serializeUser(user),

        transactionId:
          String(
            tx._id
          )

      });

    } catch (error) {

      console.error(
        "Withdrawal error:",
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
   SUBSCRIBE REWARD
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

          ok:
            true,

          message:
            "Reward already claimed."

        });

      }


      user.coins =
        safeNumber(
          user.coins
        ) +
        10;


      await user.save();


      await Transaction.create({

        telegramId:
          user.telegramId,

        type:
          "subscribe",

        coins:
          10,

        note:
          "Channel subscription reward",

        status:
          "completed"

      });


      res.json({

        ok:
          true,

        user:
          serializeUser(user)

      });

    } catch (error) {

      console.error(
        "Subscribe reward error:",
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
   SPA FALLBACK
========================================================= */

/*
  Express 5 compatible fallback.
*/

app.get(
  "/{*splat}",
  (_req, res) => {

    res.sendFile(
      path.join(
        process.cwd(),
        "public",
        "index.html"
      )
    );

  }
);


/* =========================================================
   BACKGROUND MINING HEARTBEAT
========================================================= */

function startMiningHeartbeat() {

  setInterval(
    async () => {

      try {

        /*
          Process active boost miners.
        */

        const users =
          await User.find({

            miningActive:
              true,

            miningPrincipal: {
              $gt:
                0
            }

          }).limit(1000);


        for (
          const user of users
        ) {

          try {

            await settleMining(
              user
            );

          } catch (error) {

            console.error(
              `Mining settlement failed for ${user.telegramId}:`,
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

    60000

  );

}


/* =========================================================
   START SERVER
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


    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          `Web app running on port ${PORT}`
        );


        console.log(
          `Normal mining: ${NORMAL_MINING_DAILY_RATE} USDT/day`
        );


        console.log(
          `Boost mining base rate: ${MINING_DAILY_RATE} /day`
        );


        console.log(
          "Mining system: NORMAL + TOP-UP BOOST"
        );


        /*
          Start background mining settlement.
        */

        startMiningHeartbeat();


        /*
          Start Telegram bot.
        */

        Promise
          .resolve()
          .then(
            () => startBot()
          )
          .then(
            bot => {

              global.botInstance =
                bot;

              console.log(
                "Telegram bot started."
              );

            }
          )
          .catch(
            err => {

              console.error(
                "Telegram bot failed to start:",
                err

              );

            }
          );

      }
    );

  } catch (err) {

    console.error(
      "Server startup failed:",
      err
    );


    process.exit(1);

  }

}


/* =========================================================
   START
========================================================= */

main();
