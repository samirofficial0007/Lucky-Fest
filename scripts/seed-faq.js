require("dotenv").config();
const { connectDB } = require("../src/db");
const FAQ = require("../src/models/FAQ");

const items = [
  {
    q: "How do I start earning?",
    a: "Top up from 3 USDT to start farming. Income starts right after the credit and shows on the home profit card."
  },
  {
    q: "How do I top up?",
    a: "On Home tap Top up, connect wallet (Tonkeeper / DeFi), then Deposit. After payment, admin approves and funds appear on balance."
  },
  {
    q: "What is the minimum top-up and withdrawal?",
    a: "Both top-up and withdrawal start from 3 USDT. Use quick buttons or type the amount."
  },
  {
    q: "How do I withdraw USDT?",
    a: "Tap Withdraw on Home, enter amount and wallet address. Funds go to your crypto wallet after admin confirmation."
  },
  {
    q: "How long does a withdrawal take?",
    a: "Payouts usually arrive within minutes after confirmation. Rarely the network may delay a transfer by a few hours."
  },
  {
    q: "How do I claim farm profit?",
    a: "On Home tap Claim profit. Accrued income moves to the USDT balance and farming starts again."
  },
  {
    q: "What is the USDT balance?",
    a: "It is your net USDT that you earned and can withdraw. Profit is generated automatically and moved to the USDT account after claim."
  },
  {
    q: "What are coins?",
    a: "Coins are a separate balance from registration, invites and gifts. 1 coin = 1 USDT. The bot invests them and they pay 0.02% USDT profit per day."
  },
  {
    q: "How do I get more coins?",
    a: "Invite friends: you get coins for each registration. Also open crypto gifts and complete Tasks."
  },
  {
    q: "How does the referral program work?",
    a: "Send an invite from Friends. You get coins for each signup, USDT from five-level top-ups, and +1 crypto gift per invite."
  },
  {
    q: "What is 5-level income?",
    a: "The five-level program credits USDT to your balance from every top-up in your structure: 10%, 3%, 2%, 1%, 1%."
  },
  {
    q: "How do I open a gift?",
    a: "In Gifts tap a card. First you see the gift, then the prize reel stops on coins."
  },
  {
    q: "What can I win in gifts?",
    a: "Crypto gifts hide coin credits. Open them to claim coins and speed up income."
  },
  {
    q: "Why isn't income growing?",
    a: "Income runs while there are funds on the balance. After a claim the counter restarts. A top-up raises daily income. Level percent applies to USDT holdings."
  },
  {
    q: "What percent is paid per day?",
    a: "USDT income uses your current balance and level percent (2.7%–4%). Coins pay a separate 0.02% shown in the coins block."
  },
  {
    q: "Is withdrawing safe?",
    a: "Withdrawals go to the wallet address you enter. Always check the address. After sending, a transaction cannot be undone."
  },
  {
    q: "How do I change the theme?",
    a: "Open Account and tap Theme. Switch light or dark; the choice is saved on the device."
  },
  {
    q: "Where do I get help?",
    a: "In Account tap Help — operators are online. You can also search FAQ at the top."
  }
];

(async () => {
  await connectDB();
  await FAQ.deleteMany({});
  for (let i = 0; i < items.length; i++) {
    await FAQ.create({ question: items[i].q, answer: items[i].a, sortOrder: i });
  }
  console.log("FAQ seeded:", items.length);
  process.exit(0);
})();
