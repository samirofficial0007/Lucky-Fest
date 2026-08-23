# NOVUM.AI Agent — Telegram Bot + Mini App

This is a fresh functional rebuild based on the screenshots supplied in the chat. It is **not the original lost source code**; the original source cannot be recovered byte-for-byte from screenshots. The UI, navigation, welcome flow, referral structure, MongoDB persistence, and Render deployment structure have been recreated.

## Included

- Telegram `/start` welcome message
- Telegram Mini App launch button
- Telegram WebApp `initData` verification
- MongoDB/Mongoose user storage
- Referral tracking with `?start=ref_<telegramId>`
- Dashboard / Trade / Friends / Farm / Gifts / Account tabs
- Balance and income display
- Claim-profit action
- Top-up request flow
- Withdraw request flow
- Channel-subscribe reward hook
- Five-level referral percentages: 10%, 3%, 2%, 1%, 1%
- Referral invite rewards: 50 / 30 / 20 / 10 / 10 coins
- One gift per successful referral
- Grid-bot chart-style dashboard
- Render-ready Node/Express server
- GitHub-ready project layout
- Screenshot-derived welcome and assistant logo assets

## 1. Create the bot

Open @BotFather in Telegram and create a bot. Copy the token.

Set the bot's username in `.env`.

## 2. Create MongoDB

Create a MongoDB Atlas database and put the connection string in `MONGODB_URI`.

Example:

MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/novum_agent?retryWrites=true&w=majority

## 3. Configure environment

Copy `.env.example` to `.env` locally.

Required:

- `BOT_TOKEN`
- `WEB_APP_URL`
- `MONGODB_URI`
- `BOT_USERNAME`

Optional:

- `ADMIN_CHAT_ID` — receives top-up/withdraw notifications
- `CHANNEL_USERNAME`
- `CHANNEL_URL`
- `MIN_WITHDRAW_USDT`

## 4. Run locally

```bash
npm install
npm start
```

The web app is served at `/`.

For Telegram Web Apps, use a public HTTPS URL. For local testing you can use a tunnel such as Cloudflare Tunnel/ngrok.

## 5. Deploy to Render

1. Push this folder to GitHub.
2. Create a new Render Web Service from the repository.
3. Render will use `npm install` and `npm start`.
4. Add all environment variables from `.env.example`.
5. Set `WEB_APP_URL` to the final Render HTTPS URL.
6. Restart/redeploy.

The bot uses Telegraf long polling, so the Render service must stay running.

## 6. Set the Mini App URL in Telegram

BotFather → your bot → Bot Settings → Menu Button → Configure Menu Button.

Use the Render URL.

The `/start` button in the bot also opens the same URL.

## Important production notes

This rebuild includes **request-based** top-up and withdrawal records. It does not secretly move real USDT and does not invent blockchain confirmations. To handle real deposits/withdrawals, connect your preferred payment/crypto provider and replace the request handlers with its verified webhook/API flow.

The displayed trading chart is a UI recreation of the supplied screenshots. It is not a live exchange feed.

Do not advertise guaranteed returns. Configure your own legitimate earning, trading, and payout rules before public launch.
