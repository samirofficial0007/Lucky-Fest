# Assistant Bangladesh — Telegram Mini App + Bot

Full stack: Express + Telegraf + MongoDB + Dark Mini App UI.

## Features
- Trade dashboard (live balance, claim, top-up, withdraw, GRID chart UI)
- **Farm** auto-mining (0.02%/day of coins → USDT)
- Friends / 5-level referral
- Gifts with open animation + spin
- Tasks (admin can add/remove from Mini App)
- Account (theme, language, operations, FAQ)
- Owner commands with multi-step announcement (text + image + optional button)

## Owner commands
```
/start /help
/announcement          → interactive text broadcast (+ optional button)
/announcementimage     → interactive image broadcast
/addadmin <id>
/removeadmin <id>
/stats
/totalusers            → total + last 7 days + today
/withdrawals
/approvewithdraw <id>
/rejectwithdraw <id>
```

## Render deploy
1. Push repo to GitHub
2. New Web Service → connect repo
3. Build: `npm install` · Start: `npm start`
4. Env vars from `.env.example`
5. Set Web App URL in BotFather
6. `npm run seed:faq` once (optional)

Root directory on Render should be the project root (where package.json lives).
