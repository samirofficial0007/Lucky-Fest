# Lucky Fest — Telegram Mini App + Bot

Full stack: Express + Telegraf + MongoDB + Dark Mini App UI.

## Features
- Trade dashboard (live balance, claim, top-up, withdraw)
- Farm auto-mining (0.02%/day of coins → USDT)
- Friends / 5-level referral (L1–L5 counts)
- Gifts with open animation
- Tasks (admin can add/remove from Mini App)
- Account (theme, language, operations, FAQ)
- Owner commands: announcement, top-ups, withdrawals

## Owner commands
```
/start /help
/announcement
/announcementimage
/addadmin <telegramid>
/removeadmin <telegramid>
/stats
/totalusers
/withdrawals
/approvewithdraw <id>
/rejectwithdraw <id>
/topups
/approvetopup <id>
/rejecttopup <id>
```

## Render deploy
1. Push repo to GitHub
2. New Web Service → connect repo
3. Build: `npm install` · Start: `npm start`
4. Env vars from `.env.example`
5. Set Web App URL in BotFather
6. Update `public/tonconnect-manifest.json` with your HTTPS URL
7. `npm run seed:faq` once (optional)
