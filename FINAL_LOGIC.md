# Final Logic (Implemented)

- Every Telegram account has isolated MongoDB data.
- `/start` registers the user and handles valid referral attribution (`ref_<telegramId>`).
- Direct invite rewards: +50 / +30 / +20 / +10 / +10 coins by registration position; +1 gift per successful invite.
- Five-level top-up commission: 10% / 3% / 2% / 1% / 1% (applied when top-up is marked completed).
- Gifts: +1 gift per invite; open gift for random 5–25 coins.
- Live online count: unique users with heartbeat in last 45 seconds.
- Hourly farm claim: $0.0005 USDT once per hour.
- Top-up and withdrawals are request-based until a real payment provider is connected.
- Account page: balances, invited-by, operations, FAQ, language, theme.
