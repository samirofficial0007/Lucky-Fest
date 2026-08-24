# Lucky Fest — Telegram Mini App + Bot

A Render-ready Telegram Mini App with:

- Server-side auto mining that continues while the Mini App is closed.
- Telegram channel join tasks with Telegram membership verification.
- Bot-start and website-visit tasks.
- Task rewards stored in MongoDB with one-time completion records.
- Referral and gift rewards.
- USDT top-up requests with the configured TON receiving wallet.
- Admin approval commands for top-ups.
- Withdraw requests and transaction history.
- TON Connect wallet picker for supported wallets such as Tonkeeper when available on the device.
- Persistent Dark/Light theme.
- Persistent multilingual account preference.
- Full FAQ seeded automatically on first server run.
- Render Free friendly startup: HTTP port binds before Telegram bot launch.

## Required environment variables

`BOT_TOKEN`, `MONGODB_URI`, `WEB_APP_URL`, `BOT_USERNAME`, and `ADMIN_CHAT_ID`.

The deployment manifest also configures the official channel and receiving wallet.

## Admin bot commands

- `/pending`
- `/approve_topup <transactionId>`
- `/reject_topup <transactionId>`

## User bot commands

- `/start`
- `/app`
- `/tasks`
- `/faq`
- `/help`

## Important payment behavior

A top-up request is **pending** until an administrator verifies the actual blockchain payment. The app does not fake payment confirmations. Once approved, the amount becomes the user's mining principal and server-side mining starts.

## TON Connect

The Mini App uses the official TON Connect UI CDN. The server exposes `/tonconnect-manifest.json` dynamically so the manifest uses the deployed HTTPS origin.
