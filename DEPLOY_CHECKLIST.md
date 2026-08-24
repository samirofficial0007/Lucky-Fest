# Lucky Fest deployment checklist

1. Create a Render Web Service from the repository.
2. Build command: `npm install`.
3. Start command: `npm start`.
4. Set `BOT_TOKEN`.
5. Set `MONGODB_URI`.
6. Set `WEB_APP_URL` to the public Render HTTPS URL.
7. Set `BOT_USERNAME` to the real Lucky Fest bot username without `@`.
8. Set `ADMIN_CHAT_ID` to the admin Telegram numeric ID used for approval commands.
9. Keep `CHANNEL_USERNAME=Lucky_Fest_Official` and ensure the bot is an administrator in that channel.
10. Keep `TOPUP_WALLET` as the verified receiving address and confirm the intended USDT network before accepting payments.
11. Open `/health` after deployment and confirm `{ ok: true }`.
12. Start the bot with `/start`, then open the Mini App.
13. Complete the channel task to confirm Telegram membership verification works.
14. Create a top-up request and use `/pending` and `/approve_topup <id>` from the admin account after independently verifying the blockchain payment.
15. Confirm the user shows an active mining principal and that profit changes after elapsed time.
16. Test closing the Mini App and reopening it later; server-side mining should settle elapsed time.
17. Test Theme, Language, FAQ, Help, Wallet Connect, Withdraw and Operations.
