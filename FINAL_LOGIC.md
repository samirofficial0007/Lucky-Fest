# Lucky Fest Final Logic

- Telegram accounts are isolated by Telegram ID.
- Server starts the HTTP listener before the Telegram bot so Render can detect the assigned PORT.
- FAQ and starter tasks are seeded automatically on server startup when the collections are empty.
- Auto mining is server-side. Each active user stores a mining principal and last mining timestamp. Earnings are calculated from elapsed time, so closing the app does not stop mining.
- A lightweight server mining heartbeat settles active users every 60 seconds while the web service is awake; API requests also settle the user's elapsed profit.
- Default daily mining rate is configurable with MINING_DAILY_RATE (2.7% by default for this project configuration).
- Top-up requests never credit funds automatically. They create a pending transaction and display the configured receiving wallet.
- Admin can approve a top-up from Telegram with /approve_topup <transactionId>. Approval adds the verified amount to miningPrincipal and activates mining.
- Task types: channel_join, bot_start, website_visit.
- Channel tasks use Telegram getChatMember and therefore require the bot to have the necessary channel access.
- Website tasks enforce a minimum server-side elapsed time before verification.
- The bot-start starter task is tied to the configured Lucky Fest bot; reaching the bot backend proves the Telegram account has started it.
- Task completion is unique per user/task and rewards are recorded in Transaction.
- Wallet connection uses TON Connect. Private keys are never requested or stored.
- Theme and language are persisted per Telegram account.
- Help opens @assistant_bd.
- Official channel: https://t.me/Lucky_Fest_Official
