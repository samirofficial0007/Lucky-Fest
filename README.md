# Lucky Fest — Telegram Mini App

A gift-merge game with daily tasks, level-gated raffles, TON wallet connect,
9 languages, and an admin panel. Built for: GitHub → Render (free web
service) → MongoDB Atlas.

## 1. What's inside

```
luckyfest-bot/
  server.js              # Express entrypoint
  src/
    config.js            # reads env vars
    db.js                # MongoDB connection
    middleware/
      telegramAuth.js    # verifies Telegram initData (THE login/anti-cheat gate)
      adminAuth.js       # restricts /api/admin/* to ADMIN_IDS
      rateLimiter.js
    models/               # User, Task, UserTask, Raffle
    routes/               # auth, game, tasks, wallet, raffles, admin, i18n
    utils/
      verifyTelegram.js   # HMAC verification per Telegram's spec
      gameLogic.js        # server-authoritative XP/level/cooldowns
      randomWinner.js      # seeded, logged raffle draw
    locales/              # en, zh, ru, ar, fr, pt, es, vi, bn
  public/                 # the Mini App itself (served at your root URL)
    index.html, style.css, app.js
    tonconnect-manifest.json
  admin/                  # the admin panel (served at /admin)
    index.html, admin.css, admin.js
```

## 2. How login/security works (read this before anything else)

Every privileged request from the Mini App carries Telegram's `initData`
string in the `X-Telegram-Init-Data` header. The backend re-derives an HMAC
over that string using your bot token and rejects anything that doesn't
match, or that's older than 24h (`src/utils/verifyTelegram.js`). This is
what Telegram calls "validating data received via the Mini App" — it's the
only trustworthy way to know who's making a request. **The frontend never
sends a bare `telegramId` that the server just believes** — that would let
anyone open devtools and pretend to be any user.

Anti-cheat on top of that:
- Per-action cooldown + daily action cap, tracked server-side per user
  (`gameLogic.js`) — a scripted button-masher gets rate-limited, not
  rewarded.
- Task claims use a unique DB index on `(telegramId, taskKey, day)` so a
  replayed "claim" request can't double-pay even under a race condition.
- Merge/XP amounts are decided by the server, never trusted from the
  client.
- Raffle winner selection is seeded and the seed is stored on the raffle
  document, so a draw can be recomputed/audited later instead of being an
  unaccountable `Math.random()` call.

None of this is a substitute for a real security audit if you plan to move
real money or valuable NFTs through this. Treat it as a solid baseline, not
a guarantee.

## 3. Set up MongoDB Atlas

1. Create a free account at mongodb.com/cloud/atlas, create a free M0
   cluster.
2. **Database Access** → add a database user with a strong password.
3. **Network Access** → add `0.0.0.0/0` (allow from anywhere) — Render's
   IPs aren't static on the free tier, so this is the practical option;
   just make sure your DB user password is strong.
4. Get your connection string (Connect → Drivers) — it looks like
   `mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/luckyfest`.

## 4. Push to GitHub

```bash
cd luckyfest-bot
git init
git add .
git commit -m "Initial Lucky Fest scaffold"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/luckyfest-bot.git
git push -u origin main
```

`.env` is already in `.gitignore` — never commit real secrets. Use
`.env.example` as the template.

## 5. Deploy on Render

1. New → Web Service → connect your GitHub repo.
2. Build command: `npm install`
3. Start command: `npm start`
4. Add environment variables (Render dashboard → Environment):
   - `BOT_TOKEN` — from BotFather (yours: the one you already have)
   - `MONGODB_URI` — from step 3
   - `ADMIN_IDS` — your numeric Telegram ID (message @userinfobot to get it)
   - `ADMIN_SESSION_SECRET` — any long random string
   - `PORT` — Render sets this automatically, you can leave your default
5. Deploy. You'll get a URL like `https://luckyfest-bot.onrender.com`.

Render's free tier sleeps after inactivity; the first request after a
sleep takes ~30-50s to wake up. Fine for testing, worth upgrading before a
real launch with many users.

## 6. Wire the URL back into Telegram

1. In BotFather: `/myapps` → your app → **Edit Web App URL** → paste your
   real Render URL (replacing the `https://example.com` placeholder).
2. Update `public/tonconnect-manifest.json` — replace every
   `REPLACE-WITH-YOUR-RENDER-URL.onrender.com` with your actual URL, then
   commit + push (Render redeploys automatically).
3. Open `t.me/LuckyFest_bot/app` in Telegram to test.

## 7. Admin panel

Visit `https://your-app.onrender.com/admin` **from inside Telegram** (open
it via a link in a chat, or use the bot's menu button) — it needs Telegram
identity the same way the main app does. Only Telegram IDs listed in
`ADMIN_IDS` get in; everyone else gets a 403 from the server itself, not
just a hidden button.

From there you can:
- See total users / active tasks / open raffles
- Create/deactivate tasks (with per-language titles)
- Create raffles, close entries, and draw winners
- Search users, ban/unban, manually adjust XP

## 8. Before you touch real prizes/money

- **Legal**: prize draws, especially ones involving crypto/USDT payouts,
  can fall under gambling/lottery regulation depending on your country and
  your users' countries. Check this before launching publicly — this
  codebase doesn't include any compliance logic.
- **Wallet security**: this app only ever stores a public wallet
  *address* — it never asks for seed phrases or private keys, and it
  shouldn't ever need to. If you build the actual payout flow, that's a
  separate, more sensitive piece of infrastructure (ideally a small
  service with its own restricted hot wallet, manual approval step, and
  logging) — not something to bolt onto this API casually.
- **Fairness**: the seeded raffle draw is auditable but not a
  cryptographic commit-reveal scheme. For high-value draws, consider
  publishing the seed and entry list publicly after the draw so anyone can
  recompute it.
- Rotate your `BOT_TOKEN` if it's ever been visible in a screenshot or
  shared chat (BotFather → `/mybots` → your bot → API Token → Revoke).

## 9. What's intentionally left for you to extend

- The merge board is a single evolving item chain (8 tiers, `public/assets/items/gift_tier1..8.png`) on a 16-cell grid with drag-and-drop merging — extend `MAX_TIER` / add new item chains by generating more tier art and branching `src/routes/game.js`.
- The Roadmap tab (`/api/levels/roadmap`) is fully admin-configurable per level: energy grant, random lootbox (with the shake-then-reveal modal), or a raffle-linked "Participate" giveaway. Add entries from the admin panel's **Roadmap** tab.
- Prize fulfillment after a raffle draw is manual (admin sees the winner
  list) — automating payouts is a deliberate scope cut given the legal/
  security weight of that step.
- Push notifications, referral tracking, and a proper bot `/start` command
  handler (this scaffold only implements the Mini App HTTP API, not a
  running Telegram bot process) are not included yet.
- `energy` is currently a flavor currency granted by tasks/roadmap and spent on "Get Gift" — it isn't yet wired as a cost on merges themselves; tune `NEW_GIFT_ENERGY_COST` in `src/routes/game.js` and add merge costs if you want a tighter economy.
