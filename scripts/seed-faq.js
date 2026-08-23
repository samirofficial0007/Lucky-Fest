require("dotenv").config();
const { connectDB } = require("../src/db");
const FAQ = require("../src/models/FAQ");

const items = [
  {
    question: "How do I earn?",
    answer: "Invite friends, claim hourly farm, open gifts, and complete channel tasks.",
    order: 1
  },
  {
    question: "How does referral work?",
    answer: "Share your link. Direct invites give coins by position (+50/+30/+20/+10/+10) and +1 gift each.",
    order: 2
  },
  {
    question: "What is top-up commission?",
    answer: "When someone in your team tops up, you get 5-level commission: 10% / 3% / 2% / 1% / 1%.",
    order: 3
  },
  {
    question: "How often can I claim?",
    answer: "Once every hour from the Farm page ($0.0005 USDT).",
    order: 4
  },
  {
    question: "How do withdrawals work?",
    answer: "Submit a request with your USDT wallet. Admin processes after review.",
    order: 5
  }
];

(async () => {
  await connectDB();
  await FAQ.deleteMany({});
  await FAQ.insertMany(items);
  console.log("FAQ seeded:", items.length);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
