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
   - `ADMIN_IDS` — your numeric Telegram ID (message @userinfobot to get it) — this becomes the permanent Owner
   - `ADMIN_SESSION_SECRET` — any long random string
   - `MINI_APP_URL` — your Render URL once you know it (e.g. `https://lucky-fest.onrender.com`) — powers the bot's `/start` Play button
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

## 9. What's new in this update

- **In-app Admin tab**: no more separate `/admin` URL needed day-to-day — admins (and the Owner) manage tasks, roadmap, raffles, and users from a tab inside the Mini App itself. The old `/admin` static panel still works too (same API), pick whichever you prefer.
- **Owner/Admin system is now database-backed**, not just env vars: `ADMIN_IDS`'s first entry is seeded as the permanent **Owner** on first boot (`src/seed.js`). The Owner can add/remove other admins from the Admin tab; an Owner can never be removed via the API. To change who the Owner is, you'd need to edit the `Admin` collection directly in MongoDB Atlas.
- **Energy auto-regen**: +1 energy every 30 seconds, capped at 50 — but task/roadmap rewards can push energy above 50 freely (the cap only throttles passive regen). Tune via `ENERGY_CAP` / `ENERGY_REGEN_SECONDS` / `ENERGY_REGEN_AMOUNT`.
- **Demo roadmap** is seeded automatically on first boot (levels 3/5/10/15/25) so the Roadmap tab isn't empty — edit or delete these from the Admin tab any time.
- **Telegram bot process** (`src/bot.js`) now runs alongside the API in the same Render service: `/start` shows a 9-language picker, then sends a localized welcome message with a "▶️ Play" button that opens the Mini App directly. Requires `MINI_APP_URL` to be set to your real Render URL.
- **Wallet connect** now uses TON Connect **UI** (not the raw SDK) so it shows the proper wallet-picker modal (Telegram Wallet / Tonkeeper / Gram Wallet / etc.) instead of jumping straight into one wallet's permission screen.
- **Drag-and-drop merge** rewritten with touch events (not Pointer Events) for reliability inside Telegram's in-app browser, plus a floating "+XP" animation on successful merges.
- **Merge now costs energy** (2 per merge, "Get Gift" still costs 5) — tune `MERGE_ENERGY_COST` / `NEW_GIFT_ENERGY_COST` in `src/routes/game.js`.

## 11. What's new in THIS update (v3)

- **Bottom nav restructured**: Home, Task, Level, Friend, Wallet (+ Admin, admin-only). The old separate Raffles tab is gone — raffle entry now happens via the "Participate" button on giveaway-type Level rewards.
- **Levels now start at 0**, not 1. Cosmetic "Premium" band kicks in past level 100 (101-200 = Premium badge, 201-300 = Elite, beyond = generic Tier N) — purely a visual badge next to the level number, no feature is gated behind it.
- **Friend invite system**: each user gets a personal invite link (`t.me/<bot>?start=ref_<id>`) on the new **Friend** tab. The bottom-row board cells (indices 12-15, shown as 🔒) unlock at 1/3/5/10 invites respectively, each dropping a guaranteed-high-tier gift when unlocked. Referral counting happens in `src/bot.js` when someone starts the bot via that link — **it only works through the bot's `/start`, not by opening the Mini App URL directly**, since Telegram only passes the `ref_` payload through bot deep links.
- **"Get Gift" is now random-tier** (weighted mostly toward low tiers, occasionally higher — see `GET_GIFT_WEIGHTS` in `src/utils/gifts.js`) instead of always giving tier 1. Merge XP now scales with the resulting tier (`xpForMergeTier`) instead of a flat amount. Merging two max-tier (8) gifts together gives a bonus XP burst and clears both cells (there's no tier 9 art).
- **Lucky Vault** (renamed from "Holiday Giftbox"): a spin animation cycling through star/gem/coin/NFT/energy icons for suspense, but — to be upfront — **it always actually grants a random amount of energy** (5-30). The other icons are visual flavor only; there's no real Stars/TON/NFT payout wired to this feature. If you want it to sometimes grant something else for real, that needs new, carefully-scoped work (payout logic, fairness/audit concerns) — flagging this so nobody assumes more is happening under the hood than actually is.
- **Giveaway channel link**: Admin tab → Settings lets an admin/owner set a channel URL. Level rewards of type "giveaway" show that link (or "Coming Soon" if unset) instead of just a bare Participate button.
- **Bot commands** (`src/bot.js`): `/start` (now also handles `ref_<id>` referral payloads), `/help` (shows different content to admins vs regular users), `/announcement <text>` and `/announcementimage` (broadcast to all users, admin-only, paced to avoid Telegram rate limits — could take a while for a large user base), `/addadmin` / `/removeadmin` (owner-only), `/stats`, `/totalusers`. None of these appear or respond for non-admins.
- **Drag-and-drop bug fix**: dragging no longer moves the real board tile out of the grid (which was causing `touchcancel` mid-gesture in Telegram's in-app browser, silently killing the drag). It now drags a floating *ghost* clone while the real tile stays hidden in place; the board only actually updates once the server confirms the merge.

### Honest scope notes for this update
- The "Get Gift" tier probabilities are a fixed table in code (`src/utils/gifts.js`), not yet exposed as a % editor in the admin UI — edit the numbers directly for now.
- Broadcasts (`/announcement`) loop through all users sequentially with a small delay; for a very large user base this could take a while and there's no progress bar beyond the final "sent to X/Y" message.
- The referral link only attributes correctly through the bot's own `/start` deep link — sharing the raw Mini App URL instead won't count as a referral.


- Prize fulfillment after a raffle draw is manual — automating payouts is a deliberate scope cut given the legal/security weight of that step.
- Referral tracking and richer bot commands (`/help`, `/profile`, etc.) aren't implemented — `src/bot.js` only handles `/start` + language selection.
- The bot uses polling, not webhooks — fine for one Render instance; if you ever scale to multiple instances you'd need to switch to a webhook so only one process polls Telegram.
