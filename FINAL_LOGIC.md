# Final Logic (Lucky Fest)

- Every Telegram account has isolated MongoDB data.
- `/start` registers the user and handles referral (`ref_<telegramId>`).
- Invite rewards: coins by invite position + 1 gift per invite (see bot.js INVITE_REWARDS).
- Five-level top-up commission: 10% / 3% / 2% / 1% / 1% (applied on `/approvetopup`).
- Gifts: open for random coins; +1 gift per invite.
- Live online: display fluctuates 30,000–40,000 while Mini App is open.
- Farm claim: profit from coins × 0.02%/day, accrued since last claim (max 24h).
- Level 1–7 from total (coins + usdt) thresholds: 0 / 3 / 10 / 30 / 100 / 300 / 1000.
- Top-up: pending request → admin `/approvetopup <id>` credits coins + commissions.
- Withdrawals: pending → admin approve/reject.
- Account: balances, referrals, operations, FAQ, language, theme.
