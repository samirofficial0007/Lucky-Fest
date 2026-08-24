require("dotenv").config();
const { connectDB } = require("../src/db");
const FAQ = require("../src/models/FAQ");

const items = [
  { q: "How do I start earning?", a: "Open the Farm tab — mining starts automatically. Claim profit anytime. Invite friends and open gifts for more coins." },
  { q: "What are coins?", a: "Coins are your working capital. 1 coin = 1 USDT value. The bot pays 0.02% of coin value as USDT profit every day." },
  { q: "How do I withdraw?", a: "Go to Trade → Withdraw. Enter amount and wallet. Admin will process pending requests." },
  { q: "How does referral work?", a: "Share your invite link. You get coins + 1 gift per invite. 5-level program: 10%, 3%, 2%, 1%, 1% from network top-ups." },
  { q: "How do I open gifts?", a: "Open Gifts tab and tap a gift card. You need gifts balance (earned by inviting)." },
  { q: "What is Farm?", a: "Farm is auto-mining. Profit accrues every second based on your coins. Claim moves it to USDT balance." }
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
