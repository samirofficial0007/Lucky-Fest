const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor("#09142f");
    tg.setBackgroundColor("#09142f");
  } catch (e) {}
}

const state = {
  user: null,
  page: "trade",
  config: { botUsername: "", botName: "NOVUM.AI Agent", minWithdraw: 1 },
  referrals: null,
  faq: [],
  accountData: null
};

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

function money(n, d = 4) {
  return Number(n || 0).toFixed(d);
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}

function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[m])
  );
}

async function heartbeat() {
  try {
    const d = await api("/api/presence", { method: "POST" });
    const e = document.querySelector(".online span");
    if (e) e.textContent = `${Number(d.online || 0).toLocaleString()} online`;
  } catch (e) {}
}
setInterval(heartbeat, 5000);

async function loadConfig() {
  try {
    state.config = await api("/api/config");
    window.BOT_USERNAME = state.config.botUsername || "";
  } catch (e) {}
}

async function load() {
  try {
    await loadConfig();
    state.user = await api("/api/me");
    render();
    heartbeat();
  } catch (e) {
    document.getElementById("content").innerHTML = `
      <div class="page">
        <h1>Telegram authorization required</h1>
        <p class="muted">Open this page from your Telegram bot's Mini App button.</p>
      </div>`;
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
  if (state.page === "trade") c.innerHTML = dashboard();
  if (state.page === "friends") c.innerHTML = friends();
  if (state.page === "farm") c.innerHTML = farm();
  if (state.page === "gifts") c.innerHTML = gifts();
  if (state.page === "account") c.innerHTML = account();
  bindActions();
}

function shell(inner, title = "") {
  return `<div class="page">${
    title ? `<h1 class="hero-title">${title}</h1>` : ""
  }${inner}</div>`;
}

function dashboard() {
  const u = state.user;
  return shell(`
    <div class="balance-row">
      <img class="avatar" src="${escapeHtml(u.photoUrl || "/assets/assistant-logo.jpg")}" alt="">
      <div class="name-badge">${escapeHtml(u.name)}</div>
      <div class="level">★ Level ${u.level || 1}</div>
    </div>
    <div class="income">
      <b>◉ Income</b>
      <span>◷ $${money(u.incomeHour, 4)} hr</span>
      <span>▣ $${money(u.incomeDay, 2)} day</span>
      <span>▣ $${money(u.incomeMonth, 2)} month</span>
    </div>
    <div class="big-income">$<span>${money(u.usdt, 4)}</span></div>
    <div class="actions">
      <button class="btn blue" id="btnTopup">Top up</button>
      <button class="btn lime" id="btnWithdraw">Withdraw</button>
    </div>
    <div class="cards">
      <div class="card coin-bg">
        <h3>Coins</h3>
        <div class="number">${money(u.coins, 2)}</div>
      </div>
      <div class="card usdt-bg">
        <h3>USDT</h3>
        <div class="number">${money(u.usdt, 4)}</div>
      </div>
    </div>
    <div class="section">
      <div class="invite-card">
        <b>Invite friends</b>
        <p class="muted">Earn coins + gifts for every successful invite.</p>
        <div class="actions">
          <button class="btn blue" id="btnCopyRef">Copy link</button>
          <button class="btn lime" id="btnShareRef">Share</button>
        </div>
      </div>
    </div>
  `);
}

function friends() {
  const u = state.user;
  const list = (state.referrals && state.referrals.direct) || [];
  const rows = list.length
    ? list
        .map(
          (x) => `
      <div class="account-row">
        <div>
          <b>${escapeHtml(x.name)}</b>
          <div class="muted">@${escapeHtml(x.username || "—")}</div>
        </div>
        <div class="muted">${new Date(x.joinedAt).toLocaleDateString()}</div>
      </div>`
        )
        .join("")
    : `<div class="empty">No referrals yet. Share your link!</div>`;

  return shell(
    `
    <div class="cards">
      <div class="card"><h3>Invites</h3><div class="number">${u.referralCount || 0}</div></div>
      <div class="card"><h3>Ref Coins</h3><div class="number">${money(u.referralCoins, 1)}</div></div>
    </div>
    <div class="section">
      <b>Direct invite rewards</b>
      <p class="muted">+50 / +30 / +20 / +10 / +10 coins by position + 1 gift each</p>
    </div>
    <div class="section">
      <b>Your team</b>
      ${rows}
    </div>
    <div class="actions">
      <button class="btn blue" id="btnCopyRef">Copy link</button>
      <button class="btn lime" id="btnShareRef">Share</button>
    </div>
  `,
    "Friends"
  );
}

function farm() {
  const u = state.user;
  const last = u.lastClaimAt ? new Date(u.lastClaimAt).getTime() : 0;
  const left = Math.max(0, 3600000 - (Date.now() - last));
  const mins = Math.ceil(left / 60000);
  const canClaim = left <= 0;

  return shell(
    `
    <div class="farm-stat">
      <h3>Hourly Farm</h3>
      <p class="muted">Claim $0.0005 USDT every hour</p>
      <div class="number">$${money(u.claimedUsdt || 0, 4)} claimed</div>
    </div>
    <div class="cards" style="margin-top:16px">
      <div class="farm-stat"><b>Hour</b><div>$${money(u.incomeHour, 4)}</div></div>
      <div class="farm-stat"><b>Day</b><div>$${money(u.incomeDay, 2)}</div></div>
    </div>
    <div class="actions" style="margin-top:20px">
      <button class="btn lime" id="btnClaim" ${canClaim ? "" : "disabled"}>
        ${canClaim ? "Claim now" : `Wait ${mins} min`}
      </button>
    </div>
    <div class="section">
      <p class="muted">Top-up commissions (5 levels): 10% / 3% / 2% / 1% / 1%</p>
    </div>
  `,
    "Farm"
  );
}

function gifts() {
  const u = state.user;
  const available = Math.max(0, (u.gifts || 0) - (u.openedGifts || 0));

  return shell(
    `
    <div style="text-align:center;padding:20px 0">
      <div class="gift">🎁</div>
      <h2>Open gifts</h2>
      <p class="muted">Get free coins from gifts earned by invites</p>
      <div class="number" style="margin:12px 0">${available} available</div>
      <button class="btn lime" id="btnOpenGift" ${
        available > 0 ? "" : "disabled"
      }>Open gift</button>
    </div>
    <div class="section">
      <p class="muted">+1 gift for every successful invite. Open to receive 5–25 coins.</p>
    </div>
    <div class="actions">
      <button class="btn blue" id="btnCopyRef">Copy invite link</button>
      <button class="btn lime" id="btnShareRef">Invite friends</button>
    </div>
  `,
    "Gifts"
  );
}

function account() {
  const u = state.user;
  const inv = state.accountData?.invitedBy;
  const ops = state.accountData?.operations || [];

  const faqHtml = (state.faq || [])
    .map(
      (f) => `
    <div class="account-row">
      <div>
        <b>${escapeHtml(f.question)}</b>
        <div class="muted">${escapeHtml(f.answer)}</div>
      </div>
    </div>`
    )
    .join("");

  const opsHtml = ops
    .slice(0, 15)
    .map(
      (o) => `
    <div class="account-row">
      <div>
        <b>${escapeHtml(o.type)}</b>
        <div class="muted">${escapeHtml(o.note || "")}</div>
      </div>
      <div>${o.amount ? "$" + money(o.amount, 4) : (o.coins || 0) + " coins"}</div>
    </div>`
    )
    .join("");

  return shell(
    `
    <div class="balance-row">
      <img class="avatar" src="${escapeHtml(u.photoUrl || "/assets/assistant-logo.jpg")}" alt="">
      <div>
        <div class="name-badge">${escapeHtml(u.name)}</div>
        <div class="muted">@${escapeHtml(u.username || "—")} · Level ${u.level || 1}</div>
      </div>
    </div>
    <div class="section">
      <div class="account-row"><span>Total balance</span><b>$${money(u.totalBalance, 4)}</b></div>
      <div class="account-row"><span>Coins</span><b>${money(u.coins, 2)}</b></div>
      <div class="account-row"><span>USDT</span><b>$${money(u.usdt, 4)}</b></div>
      <div class="account-row"><span>Referral income</span><b>$${money(u.referralIncome, 4)}</b></div>
      <div class="account-row"><span>Referral coins</span><b>${money(u.referralCoins, 1)}</b></div>
      <div class="account-row"><span>Withdrawn</span><b>$${money(u.withdrawnUsdt, 4)}</b></div>
      <div class="account-row"><span>Invited by</span><b>${
        inv ? escapeHtml(inv.name) : "—"
      }</b></div>
      <div class="account-row"><span>Language</span><b>${escapeHtml(u.language)}</b></div>
      <div class="account-row"><span>Theme</span><b>${escapeHtml(u.theme)}</b></div>
    </div>
    <div class="section">
      <b>Operations</b>
      ${opsHtml || '<div class="empty">No operations yet</div>'}
    </div>
    <div class="section">
      <b>FAQ</b>
      ${faqHtml || '<div class="empty">No FAQ yet</div>'}
    </div>
    <div class="section muted">Version 1.0.0 · Assistant Bangladesh</div>
  `,
    "Account"
  );
}

function modal(title, body, submitLabel) {
  const old = document.getElementById("modal");
  if (old) old.remove();
  const el = document.createElement("div");
  el.id = "modal";
  el.className = "modal";
  el.innerHTML = `
    <div class="modal-box">
      <h3>${title}</h3>
      ${body}
      <div class="modal-actions">
        <button class="btn blue" id="modalCancel">Cancel</button>
        <button class="btn lime" id="modalSubmit">${submitLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  document.getElementById("modalCancel").onclick = () => el.remove();
}

function topup() {
  modal(
    "Top up USDT",
    `<p class="muted">Enter amount. Creates a pending request for admin processing.</p>
     <input id="amount" type="number" min="1" step="0.01" placeholder="Amount in USDT">`,
    "Create request"
  );
  document.getElementById("modalSubmit").onclick = async () => {
    try {
      const amount = Number(document.getElementById("amount").value);
      const d = await api("/api/topup", { method: "POST", body: { amount } });
      document.getElementById("modal").remove();
      toast(d.message || "Request created");
    } catch (e) {
      toast(e.message);
    }
  };
}

function withdraw() {
  modal(
    "Withdraw USDT",
    `<input id="amount" type="number" min="1" step="0.01" placeholder="Amount in USDT">
     <input id="wallet" placeholder="USDT wallet address">`,
    "Submit"
  );
  document.getElementById("modalSubmit").onclick = async () => {
    try {
      const amount = Number(document.getElementById("amount").value);
      const wallet = document.getElementById("wallet").value;
      const d = await api("/api/withdraw", {
        method: "POST",
        body: { amount, wallet }
      });
      state.user = d.user;
      document.getElementById("modal").remove();
      toast("Withdrawal request submitted");
      render();
    } catch (e) {
      toast(e.message);
    }
  };
}

function refLink() {
  const id = state.user?.telegramId;
  const bot = state.config.botUsername || window.BOT_USERNAME || "YOUR_BOT";
  return `https://t.me/${bot}?start=ref_${id}`;
}

function copyRef() {
  const text = refLink();
  navigator.clipboard?.writeText(text);
  toast("Referral link copied");
}

function shareRef() {
  const link = refLink();
  const share = `https://t.me/share/url?url=${encodeURIComponent(
    link
  )}&text=${encodeURIComponent("Join my AI agent and start earning!")}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(share);
  else location.href = share;
}

async function claim() {
  try {
    const d = await api("/api/claim", { method: "POST" });
    state.user = d.user;
    toast("Profit claimed: $0.0005");
    render();
  } catch (e) {
    toast(e.message);
  }
}

async function openGift() {
  try {
    const d = await api("/api/open-gift", { method: "POST" });
    state.user = d.user;
    toast(`Gift opened: +${d.reward} coins`);
    render();
  } catch (e) {
    toast(e.message);
  }
}

function bindActions() {
  const map = {
    btnTopup: topup,
    btnWithdraw: withdraw,
    btnCopyRef: copyRef,
    btnShareRef: shareRef,
    btnClaim: claim,
    btnOpenGift: openGift
  };
  Object.keys(map).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.onclick = map[id];
  });
}

document.querySelectorAll(".bottom-nav button").forEach((b) => {
  b.onclick = async () => {
    state.page = b.dataset.page;
    if (state.page === "friends" && !state.referrals) {
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
  };
});

document.getElementById("closeBtn")?.addEventListener("click", () => {
  if (tg?.close) tg.close();
});

load();
