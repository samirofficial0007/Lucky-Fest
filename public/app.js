const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor("#0a1224");
    tg.setBackgroundColor("#0a1224");
  } catch (e) {}
}

const state = {
  user: null,
  page: "trade",
  config: { botUsername: "", botName: "NOVUM.AI Agent", minWithdraw: 1 },
  referrals: null,
  faq: [],
  accountData: null,
  liveUsdt: 0,
  miningTimer: null,
  ratePerSec: 0.0005 / 3600 // $0.0005 per hour
};

function money(n, d = 4) {
  return Number(n || 0).toFixed(d);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])
  );
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}

function pushNotif(text, sub) {
  const box = document.getElementById("floatNotif");
  const item = document.createElement("div");
  item.className = "item";
  item.innerHTML = `<div class="ico">↓</div><div><b>${escapeHtml(text)}</b><span>${escapeHtml(sub || "")}</span></div>`;
  box.appendChild(item);
  setTimeout(() => item.remove(), 4500);
}

async function api(url, options = {}) {
  options.headers = {
    ...(options.headers || {}),
    "x-telegram-init-data": tg?.initData || ""
  };
  if (options.body && typeof options.body !== "string") {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  const r = await fetch(url, options);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* ---------- Auto mining live tick ---------- */
function startMining() {
  stopMining();
  if (!state.user) return;
  state.liveUsdt = Number(state.user.usdt || 0);
  state.miningTimer = setInterval(() => {
    state.liveUsdt += state.ratePerSec;
    const el = document.getElementById("liveBal");
    if (el) {
      const full = state.liveUsdt.toFixed(10);
      const [whole, dec] = full.split(".");
      el.innerHTML = `<span class="prefix">$</span>${whole}.<span class="decimals">${dec}</span>`;
      el.classList.remove("tick-anim");
      void el.offsetWidth;
      el.classList.add("tick-anim");
    }
  }, 1000);
}

function stopMining() {
  if (state.miningTimer) {
    clearInterval(state.miningTimer);
    state.miningTimer = null;
  }
}

async function heartbeat() {
  try {
    const d = await api("/api/presence", { method: "POST" });
    const e = document.getElementById("onlineCount");
    if (e) e.textContent = `${Number(d.online || 0).toLocaleString()} online`;
  } catch (e) {}
}
setInterval(heartbeat, 5000);

/* ---------- Demo floating withdraws ---------- */
const fakeNames = ["da***09", "Ch***76", "Os***66", "vk***12", "mr***88"];
setInterval(() => {
  if (Math.random() > 0.55) {
    const n = fakeNames[Math.floor(Math.random() * fakeNames.length)];
    const amt = (Math.random() * 0.3 + 0.05).toFixed(2);
    pushNotif(`@${n}`, `successfully withdraws $${amt} USDT`);
  }
}, 12000);

async function loadConfig() {
  try {
    state.config = await api("/api/config");
  } catch (e) {}
}

async function load() {
  const c = document.getElementById("content");
  c.innerHTML = `<div class="loading">Loading</div>`;
  try {
    await loadConfig();
    state.user = await api("/api/me");
    state.liveUsdt = Number(state.user.usdt || 0);
    render();
    startMining();
    heartbeat();
  } catch (e) {
    c.innerHTML = `<div class="page-enter"><h2>Telegram authorization required</h2><p class="muted">Open this page from your bot Mini App button.</p></div>`;
  }
}

function nav() {
  document.querySelectorAll(".bottom-nav button").forEach((b) =>
    b.classList.toggle("active", b.dataset.page === state.page)
  );
}

function render() {
  nav();
  const c = document.getElementById("content");
  c.classList.remove("page-enter");
  void c.offsetWidth;
  c.classList.add("page-enter");

  if (state.page === "trade") c.innerHTML = viewTrade();
  if (state.page === "friends") c.innerHTML = viewFriends();
  if (state.page === "farm") c.innerHTML = viewFarm();
  if (state.page === "gifts") c.innerHTML = viewGifts();
  if (state.page === "account") c.innerHTML = viewAccount();
  bind();
}

function profileHead() {
  const u = state.user;
  return `
  <div class="profile-head">
    <img class="avatar" src="${escapeHtml(u.photoUrl || "/assets/assistant-logo.jpg")}" alt="">
    <div class="badge-name">${escapeHtml(u.name || "User")}</div>
    <div class="level-pill">★ Level ${u.level || 1}</div>
  </div>
  <div class="total-line">₮ <b>${money(u.coins || 0, 0)} USDT</b> Total balance</div>`;
}

function viewTrade() {
  const u = state.user;
  const live = state.liveUsdt.toFixed(10);
  const [w, d] = live.split(".");
  return `
  ${profileHead()}
  <div class="income-row">
    <b>◉ Income</b>
    <span>◷ $${money(u.incomeHour, 4)} hr</span>
    <span>▣ $${money(u.incomeDay, 2)} day</span>
    <span>▣ $${money(u.incomeMonth, 2)} month</span>
  </div>
  <div class="live-balance" id="liveBal"><span class="prefix">$</span>${w}.<span class="decimals">${d}</span></div>
  <div class="action-row">
    <button class="btn btn-lime anim-btn" id="btnClaim">↗ Claim profit</button>
    <button class="btn btn-dark anim-btn" id="btnHow">? How to earn?</button>
  </div>
  <p class="hint">Top up to 3 USDT or grow with invites to raise income to 2.7% per day.</p>
  <div class="dual-cards">
    <div class="stat-card coin card-anim">
      <h4>Coins</h4>
      <div class="val">${money(u.coins, 0)}</div>
      <div class="sub">≈ $${money(u.coins, 2)} · 0.02% Per day</div>
    </div>
    <div class="stat-card usdt card-anim">
      <h4>USDT balance</h4>
      <div class="val">$${money(u.usdt, 4)}</div>
      <div class="sub">0% Per day</div>
    </div>
  </div>
  <div class="action-row">
    <button class="btn btn-blue anim-btn" id="btnTopup">↑ Top up</button>
    <button class="btn btn-lime anim-btn" id="btnWithdraw">↓ Withdraw</button>
  </div>
  <div class="invite-box">
    <h3>Get +50 coins for an invite</h3>
    <p>⚡ Your hourly income will increase by +50%!<br>★ Automatic 5-level USDT income</p>
    <div class="mini-avatars">
      <span>👤</span><span>👤</span><span>👤</span><span class="more">+</span>
    </div>
    <div class="action-row">
      <button class="btn btn-dark anim-btn" id="btnCopy">⎘ Copy</button>
      <button class="btn btn-blue anim-btn" id="btnInvite">✈ Invite</button>
    </div>
  </div>
  <div class="channel-box">
    <h3>✈ Subscribe to the channel</h3>
    <p>Get +10 coins on your balance</p>
    <button class="btn btn-blue anim-btn" id="btnSub" style="width:auto;padding:10px 18px">Subscribe →</button>
  </div>
  <div class="chart-box card-anim">
    <div class="chart-head">
      <div><b>BTC/USDT · GRID Bot</b><div class="muted" style="font-size:12px">77,608 <span style="color:#4ade80">+0.76%</span></div></div>
      <div class="chart-tabs"><span class="on">1 day</span><span>7 days</span><span>30 days</span></div>
    </div>
    <svg class="chart-svg" viewBox="0 0 320 120" preserveAspectRatio="none">
      <polyline fill="none" stroke="#22c55e" stroke-width="1.5" points="0,80 20,70 40,75 60,55 80,60 100,40 120,48 140,35 160,42 180,28 200,32 220,20 240,25 260,18 280,22 300,15 320,12"/>
      <polyline fill="none" stroke="#a78bfa" stroke-width="1.2" points="0,90 40,85 80,70 120,65 160,50 200,45 240,38 280,30 320,28"/>
    </svg>
    <div class="ops-list">
      <div class="op"><span>23/08/2026 · 22:45</span><span class="up">+0.43%</span></div>
      <div class="op"><span>23/08/2026 · 20:45</span><span class="down">-0.02%</span></div>
      <div class="op"><span>23/08/2026 · 19:15</span><span class="up">+0.32%</span></div>
      <div class="op"><span>23/08/2026 · 18:30</span><span class="up">+0.32%</span></div>
    </div>
  </div>`;
}

function viewFriends() {
  const u = state.user;
  const list = (state.referrals && state.referrals.direct) || [];
  const rewards = [
    ["+50 coins and 10% USDT", "First invite"],
    ["+30 coins and 10% USDT", "Second invite"],
    ["+20 coins and 10% USDT", "Third invite"],
    ["+10 coins and 10% USDT", "Fourth invite"],
    ["+10 coins and 10% USDT", "Further invites"]
  ];
  return `
  <h2 class="section-title">Invite friends and raise your hourly income</h2>
  <div class="action-row">
    <button class="btn btn-dark anim-btn" id="btnCopy">⎘ Copy</button>
    <button class="btn btn-blue anim-btn" id="btnInvite">✈ Invite</button>
  </div>
  <div class="reward-list">
    ${rewards
      .map(
        ([t, s]) => `
      <div class="reward-item">
        <div class="ico">↗</div>
        <div><b>${t}</b><small>${s}</small></div>
      </div>`
      )
      .join("")}
  </div>
  <div class="gift-banner">🎁 +1 gift for every invite</div>
  <div class="level-prog">
    <h4>🖐 Five-level program</h4>
    <div class="level-grid">
      <div>10%<span>L1</span></div>
      <div>3%<span>L2</span></div>
      <div>2%<span>L3</span></div>
      <div>1%<span>L4</span></div>
      <div>1%<span>L5</span></div>
    </div>
    <p class="muted" style="margin:10px 0 0;font-size:11px">From every USDT top-up</p>
  </div>
  <h3 style="margin:16px 0 8px">Your referrals</h3>
  <div class="tabs-row">
    <button class="on">All · ${u.referralCount || 0}</button>
    <button>L1 · ${u.referralCount || 0}</button>
    <button>L2 · 0</button>
    <button>L3 · 0</button>
    <button>L4 · 0</button>
    <button>L5 · 0</button>
  </div>
  ${
    list.length
      ? list
          .map(
            (x) => `
    <div class="acc-card full" style="margin-bottom:8px">
      <div class="lbl">${escapeHtml(x.name)}</div>
      <div class="v">@${escapeHtml(x.username || "—")} · ${new Date(x.joinedAt).toLocaleDateString()}</div>
    </div>`
          )
          .join("")
      : `<div class="empty">No referrals yet</div>`
  }`;
}

function viewFarm() {
  const u = state.user;
  const last = u.lastClaimAt ? new Date(u.lastClaimAt).getTime() : 0;
  const left = Math.max(0, 3600000 - (Date.now() - last));
  const mins = Math.ceil(left / 60000);
  const can = left <= 0;
  return `
  ${profileHead()}
  <div class="farm-card card-anim">
    <h3>Hourly Farm</h3>
    <p class="muted">Claim $0.0005 USDT every hour · Auto mining is running</p>
    <div class="live-balance" style="font-size:28px" id="liveBalFarm">$${money(state.liveUsdt, 8)}</div>
    <div class="farm-meta">
      <div><b>Claimed</b><div>$${money(u.claimedUsdt || 0, 4)}</div></div>
      <div><b>Hour rate</b><div>$${money(u.incomeHour, 4)}</div></div>
    </div>
    <div class="action-row" style="margin-top:16px">
      <button class="btn btn-lime anim-btn" id="btnClaim" ${can ? "" : "disabled"}>
        ${can ? "↗ Claim now" : `Wait ${mins} min`}
      </button>
    </div>
  </div>
  <p class="hint">Top-up commissions (5 levels): 10% / 3% / 2% / 1% / 1%</p>`;
}

function viewGifts() {
  const u = state.user;
  const avail = Math.max(0, (u.gifts || 0) - (u.openedGifts || 0));
  return `
  <div class="gifts-hero">
    <div class="big-gift">🎁</div>
    <h2>Open gifts and get free coins</h2>
    <p>Get +1 gift for every invite</p>
    <div class="val" style="font-size:28px;font-weight:900;margin:12px 0">${avail} available</div>
    <button class="btn btn-lime anim-btn" id="btnOpenGift" ${avail > 0 ? "" : "disabled"} style="max-width:220px;margin:0 auto">Open gift</button>
  </div>
  <div class="invite-box">
    <h3>🎁 Get +1 gift for every invite</h3>
    <div class="action-row">
      <button class="btn btn-dark anim-btn" id="btnCopy">⎘ Copy</button>
      <button class="btn btn-blue anim-btn" id="btnInvite">✈ Invite</button>
    </div>
  </div>`;
}

function viewAccount() {
  const u = state.user;
  const inv = state.accountData?.invitedBy;
  return `
  ${profileHead()}
  <div class="acc-grid">
    <div class="acc-card card-anim"><div class="lbl">👥 Invited by</div><div class="v">${inv ? escapeHtml(inv.name) : "—"}</div></div>
    <div class="acc-card card-anim"><div class="lbl">↗ Coin balance</div><div class="v" style="color:#fbbf24">${money(u.coins, 0)}</div></div>
    <div class="acc-card card-anim"><div class="lbl">₮ USDT balance</div><div class="v">${money(u.usdt, 4)} USDT</div></div>
    <div class="acc-card card-anim"><div class="lbl">👥 Referral income</div><div class="v">${money(u.referralIncome, 4)} USDT</div></div>
    <div class="acc-card card-anim"><div class="lbl">↗ Referral coins</div><div class="v" style="color:#f472b6">${money(u.referralCoins, 0)} coins</div></div>
    <div class="acc-card card-anim"><div class="lbl">↓ USDT withdrawn</div><div class="v">${money(u.withdrawnUsdt, 2)} USDT</div></div>
    <div class="acc-card card-anim"><div class="lbl">🌐 Language</div><div class="v">🇬🇧 ${escapeHtml(u.language || "English")}</div></div>
    <div class="acc-card card-anim"><div class="lbl">☀ Theme</div><div class="v">${escapeHtml(u.theme || "Dark")}</div></div>
    <div class="acc-card card-anim"><div class="lbl">⇄ Operations</div><div class="v">History</div></div>
    <div class="acc-card card-anim"><div class="lbl">? FAQ</div><div class="v">${(state.faq || []).length || 0} answers</div></div>
    <div class="acc-card full card-anim"><div class="lbl">♥ Help</div><div class="v" style="color:#4ade80">● Operators online</div></div>
  </div>
  <p class="muted" style="text-align:center;font-size:11px;margin-top:16px">2026-08-24 · v1.0</p>`;
}

function modal(title, bodyHtml, onSubmit, submitLabel = "OK") {
  const old = document.getElementById("modal");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "modal";
  el.id = "modal";
  el.innerHTML = `
    <div class="modal-box">
      <h3>${title}</h3>
      ${bodyHtml}
      <div class="modal-actions">
        <button class="btn btn-dark anim-btn" id="mCancel">Close</button>
        <button class="btn btn-lime anim-btn" id="mOk">${submitLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  document.getElementById("mCancel").onclick = () => el.remove();
  document.getElementById("mOk").onclick = () => onSubmit(el);
}

function refLink() {
  const bot = state.config.botUsername || "YOUR_BOT";
  return `https://t.me/${bot}?start=ref_${state.user.telegramId}`;
}

function bind() {
  const map = {
    btnClaim: async () => {
      try {
        const d = await api("/api/claim", { method: "POST" });
        state.user = d.user;
        state.liveUsdt = Number(d.user.usdt || 0);
        toast("Profit claimed: $0.0005");
        render();
        startMining();
      } catch (e) {
        toast(e.message);
      }
    },
    btnHow: () => {
      modal(
        "How to earn",
        `<p><b>Earn by investing</b><br>Top up your USDT balance and your AI agent will automatically use it to run the trading bot.</p>
         <p><b>Earn by inviting</b><br>Send invites: you get coins for each registration. Five-level program credits USDT from every top-up. +1 crypto gift per invite.</p>`,
        (el) => el.remove(),
        "Got it"
      );
    },
    btnTopup: () => {
      modal(
        "Top up USDT",
        `<p class="muted">Enter amount. Creates a pending request.</p>
         <input id="mAmount" type="number" min="1" step="0.01" placeholder="Amount in USDT">`,
        async (el) => {
          try {
            const amount = Number(document.getElementById("mAmount").value);
            const d = await api("/api/topup", { method: "POST", body: { amount } });
            el.remove();
            toast(d.message || "Request created");
          } catch (e) {
            toast(e.message);
          }
        },
        "Create request"
      );
    },
    btnWithdraw: () => {
      modal(
        "Withdraw USDT",
        `<input id="mAmount" type="number" min="1" step="0.01" placeholder="Amount">
         <input id="mWallet" placeholder="USDT wallet address">`,
        async (el) => {
          try {
            const amount = Number(document.getElementById("mAmount").value);
            const wallet = document.getElementById("mWallet").value;
            const d = await api("/api/withdraw", { method: "POST", body: { amount, wallet } });
            state.user = d.user;
            state.liveUsdt = Number(d.user.usdt || 0);
            el.remove();
            toast("Withdrawal request submitted");
            render();
            startMining();
          } catch (e) {
            toast(e.message);
          }
        },
        "Submit"
      );
    },
    btnCopy: () => {
      navigator.clipboard?.writeText(refLink());
      toast("Referral link copied");
    },
    btnInvite: () => {
      const link = refLink();
      const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join my AI agent!")}`;
      if (tg?.openTelegramLink) tg.openTelegramLink(share);
      else location.href = share;
    },
    btnSub: async () => {
      try {
        const d = await api("/api/subscribe", { method: "POST" });
        state.user = d.user;
        toast(d.message || "+10 coins");
        render();
        startMining();
      } catch (e) {
        toast(e.message);
      }
    },
    btnOpenGift: async () => {
      try {
        const d = await api("/api/open-gift", { method: "POST" });
        state.user = d.user;
        toast(`Gift opened: +${d.reward} coins`);
        render();
        startMining();
      } catch (e) {
        toast(e.message);
      }
    }
  };
  Object.keys(map).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.onclick = map[id];
  });
}

document.querySelectorAll(".bottom-nav button").forEach((b) => {
  b.onclick = async () => {
    state.page = b.dataset.page;
    if (state.page === "friends") {
      try {
        state.referrals = await api("/api/referrals");
      } catch (e) {}
    }
    if (state.page === "account") {
      try {
        state.accountData = await api("/api/account");
        state.faq = await api("/api/faq");
      } catch (e) {}
    }
    render();
    if (state.page === "trade" || state.page === "farm") startMining();
  };
});

document.getElementById("closeBtn")?.addEventListener("click", () => {
  if (tg?.close) tg.close();
});

load();
