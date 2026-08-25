/* Assistant Bangladesh Mini App */
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) { tg.ready(); tg.expand(); try { tg.setHeaderColor("#0b1220"); tg.setBackgroundColor("#0b1220"); } catch(e){} }

const state = {
  user: null,
  config: null,
  page: "trade",
  liveBalance: 0,
  miningTimer: null,
  isAdmin: false,
  tasks: [],
  referrals: null,
  ops: []
};

const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const content = $("#content");

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

function headers() {
  const h = { "Content-Type": "application/json" };
  if (tg && tg.initData) h["x-telegram-init-data"] = tg.initData;
  return h;
}

async function api(path, opts={}) {
  const res = await fetch(path, { ...opts, headers: { ...headers(), ...(opts.headers||{}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function money(n, d=8) {
  const x = Number(n) || 0;
  return x.toFixed(d).replace(/\.?0+$/, match => match.includes('.') ? match.replace(/0+$/,'').replace(/\.$/,'') : match) || "0";
}

function fmtOnline(n) {
  return Number(n||0).toLocaleString("en-US") + " online";
}

function nextInviteReward(count) {
  // Display matches screenshot style (actual backend rewards remain 50/30/20/10/10)
  const rewards = [20,20,20,10,10];
  return rewards[Math.min(count||0, rewards.length-1)] || 10;
}

/* ---------- Live mining (Farm + Trade display) ---------- */
function startMining() {
  if (state.miningTimer) clearInterval(state.miningTimer);
  const u = state.user;
  if (!u) return;
  // Accrued base from claimedUsdt display simulation
  const hourRate = u.incomeHour || 0.0005;
  const tick = hourRate / 3600; // per second
  state.liveBalance = Number(u.usdt || 0);
  // Also show small growing number like screenshots (unclaimed visual)
  let unclaimed = 0;
  if (u.lastClaimAt) {
    const hrs = Math.min((Date.now() - new Date(u.lastClaimAt).getTime()) / 3600000, 24);
    unclaimed = hrs * hourRate;
  } else {
    unclaimed = hourRate * 0.1;
  }
  state.liveBalance = unclaimed;

  state.miningTimer = setInterval(() => {
    state.liveBalance += tick;
    const el = $("#liveBal");
    if (el) el.textContent = "$" + state.liveBalance.toFixed(10).replace(/0+$/,"").replace(/\.$/,"");
  }, 1000);
}

/* ---------- Floating payouts ---------- */
async function showPayouts() {
  try {
    const { payouts } = await api("/api/payouts");
    const box = $("#floatNotif");
    if (!box || !payouts) return;
    const p = payouts[Math.floor(Math.random()*payouts.length)];
    const item = document.createElement("div");
    item.className = "float-item";
    item.innerHTML = `<div class="ic">↓</div><div><b>${p.user}</b> successfully withdraws $${p.amount} USDT</div>`;
    box.appendChild(item);
    setTimeout(() => item.remove(), 3800);
  } catch(e) {}
}

/* ---------- Pages ---------- */
function renderTrade() {
  const u = state.user || {};
  const inviteCoins = nextInviteReward(u.referralCount);
  content.innerHTML = `
    <div class="profile-row">
      <img class="avatar" src="${u.photoUrl || '/assets/assistant-logo.jpg'}" onerror="this.src='/assets/assistant-logo.jpg'" alt="">
      <div>
        <div class="badge">Assistant Bangladesh</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">${u.name || 'User'}</div>
      </div>
      <div class="level-pill">★ Level ${u.level||1}</div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:700">${u.coins||0} USDT <span style="color:var(--muted);font-weight:500">Total balance</span></div>
      </div>
      <div class="income-row">
        <span>Income</span>
        <span>◷ $${money(u.incomeHour,6)} hr</span>
        <span>◷ $${money(u.incomeDay,4)} day</span>
        <span>◷ $${money(u.incomeMonth,2)} month</span>
      </div>
      <div class="balance-big" id="liveBal">$${state.liveBalance ? state.liveBalance.toFixed(10) : '0.0000000000'}</div>
      <div class="btn-row">
        <button class="btn btn-green anim-btn" id="claimBtn">↗ Claim profit</button>
        <button class="btn btn-dark anim-btn" id="howEarnBtn">? How to earn?</button>
      </div>
      <p class="muted">Top up to 3 USDT or grow with invites to raise income to 2.7% per day.</p>
      <div class="grid2" style="margin-top:10px">
        <div class="mini-card coins">
          <h4>Coins</h4>
          <div class="val">${u.coins||0} ≈ $${Number(u.coins||0).toFixed(2)}</div>
          <div class="sub">0.02% Per day</div>
        </div>
        <div class="mini-card usdt">
          <h4>USDT balance</h4>
          <div class="val">$${money(u.usdt,4)}</div>
          <div class="sub">0% Per day</div>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-blue anim-btn" id="topupBtn">↑ Top up</button>
        <button class="btn btn-green anim-btn" id="withdrawBtn">↓ Withdraw</button>
      </div>
    </div>
    <div class="invite-box">
      <div class="title">Get +${inviteCoins} coins for an invite</div>
      <div class="muted">⚡ Your hourly income will increase by +50%!<br>★ Automatic 5-level USDT income</div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-dark anim-btn" id="copyRef">⧉ Copy</button>
        <button class="btn btn-blue anim-btn" id="inviteBtn">✈ Invite</button>
      </div>
    </div>
    <div class="card" style="margin-top:12px;display:flex;align-items:center;gap:10px">
      <div style="font-size:22px">✈</div>
      <div style="flex:1">
        <div style="font-weight:700">Subscribe to the channel</div>
        <div class="muted">Get +10 coins on your balance</div>
      </div>
      <button class="btn btn-blue btn-sm anim-btn" id="subBtn">Subscribe →</button>
    </div>
    <div class="card soft" style="text-align:center;color:var(--gold)">★★★★★ Payout reviews</div>
    <div class="card" style="margin-top:8px">
      <div class="section-title">Your trading-bot dashboard</div>
      <div class="dashboard-hero">
        <div class="active-pill">ACTIVE</div>
        <div class="big">${u.coins||0} USDT</div>
        <div class="stats">
          <div>Coins<strong>${u.coins||0}</strong></div>
          <div>Active<strong>1 bots</strong></div>
          <div>USDT<strong>$${money(u.usdt,4)}</strong></div>
        </div>
      </div>
      <div class="grid2">
        <div class="mini-card"><h4>Successful trades</h4><div class="val">72.19%</div></div>
        <div class="mini-card"><h4>Total income</h4><div class="val">${money(u.claimedUsdt,4)} USDT</div></div>
        <div class="mini-card"><h4>Bots</h4><div class="val">BTC</div></div>
        <div class="mini-card"><h4>Updated</h4><div class="val" id="updTime">--:--:--</div></div>
      </div>
      <div class="chart-box" style="margin-top:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px">
          <b>BTC/USDT · GRID Bot</b>
          <span style="color:var(--green2)">+0.46%</span>
        </div>
        <svg class="chart-svg" viewBox="0 0 320 120" preserveAspectRatio="none">
          <polyline fill="none" stroke="#3ddc84" stroke-width="2" points="0,90 20,85 40,88 60,70 80,72 100,55 120,60 140,40 160,45 180,30 200,35 220,25 240,28 260,18 280,22 300,12 320,15"/>
          <polyline fill="none" stroke="#7c9cff" stroke-width="1.5" points="0,95 40,92 80,80 120,70 160,55 200,48 240,40 280,30 320,28"/>
        </svg>
        <div class="ops-list">
          <div class="ops-row"><span>23/08 · 23:45</span><span class="pos">+0.23%</span></div>
          <div class="ops-row"><span>23/08 · 21:30</span><span class="pos">+0.32%</span></div>
          <div class="ops-row"><span>23/08 · 20:45</span><span class="neg">-0.02%</span></div>
          <div class="ops-row"><span>23/08 · 19:15</span><span class="pos">+0.32%</span></div>
        </div>
      </div>
    </div>
  `;
  $("#updTime").textContent = new Date().toLocaleTimeString();
  $("#claimBtn").onclick = claimProfit;
  $("#howEarnBtn").onclick = () => openHowEarn();
  $("#topupBtn").onclick = () => openTopup();
  $("#withdrawBtn").onclick = () => openWithdraw();
  $("#copyRef").onclick = copyRef;
  $("#inviteBtn").onclick = shareInvite;
  $("#subBtn").onclick = doSubscribe;
  startMining();
}

function renderFarm() {
  const u = state.user || {};
  content.innerHTML = `
    <div class="section-title">🌾 Farm · Auto Mining</div>
    <div class="card">
      <p class="muted">Mining starts automatically when you open the app. Profit accrues every second from your coin balance (0.02%/day).</p>
      <div class="balance-big" id="liveBal">$${state.liveBalance.toFixed(10)}</div>
      <div class="income-row">
        <span>$${money(u.incomeHour,6)} / hr</span>
        <span>$${money(u.incomeDay,4)} / day</span>
        <span>$${money(u.incomeMonth,2)} / month</span>
      </div>
      <button class="btn btn-green anim-btn" id="claimBtn" style="width:100%">↗ Claim profit to USDT</button>
    </div>
    <div class="grid2">
      <div class="mini-card coins"><h4>Working capital</h4><div class="val">${u.coins||0} coins</div><div class="sub">1 coin = 1 USDT value</div></div>
      <div class="mini-card usdt"><h4>Claimed USDT</h4><div class="val">$${money(u.claimedUsdt,6)}</div><div class="sub">Lifetimeable</div></div>
    </div>
    <div class="card soft">
      <div class="section-title">How farm works</div>
      <p class="muted">• Coins are invested by the trading bot<br>• 0.02% of coin value is paid daily as USDT<br>• Claim anytime to move profit to USDT balance<br>• More coins = higher hourly income</p>
    </div>
  `;
  $("#claimBtn").onclick = claimProfit;
  startMining();
}

function renderFriends() {
  const u = state.user || {};
  const r = state.referrals || { direct: [], referralCount: 0, levels: { l1:0,l2:0,l3:0,l4:0,l5:0 } };
  const levels = r.levels || { l1:0,l2:0,l3:0,l4:0,l5:0 };
  const list = (r.direct||[]).map(x => `
    <div class="ops-row">
      <div>
        <div style="font-weight:600">${x.name || x.firstName || 'User'}</div>
        <div class="muted" style="font-size:11px">${x.joinedAt || x.createdAt ? new Date(x.joinedAt || x.createdAt).toLocaleString() : ''} · Level ${x.level||1}</div>
      </div>
      <div class="pos">+0.00 USDT</div>
    </div>
  `).join("") || `<p class="muted">No referrals yet. Invite friends!</p>`;

  content.innerHTML = `
    <div class="section-title">Invite friends and raise your hourly income</div>
    <div class="btn-row">
      <button class="btn btn-dark anim-btn" id="copyRef">⧉ Copy</button>
      <button class="btn btn-blue anim-btn" id="inviteBtn">✈ Invite</button>
    </div>
    <div class="card">
      <div class="section-title">Reward for each friend</div>
      <div class="reward-item">🚀 +20 coins and 10% USDT · Third invite</div>
      <div class="reward-item">🚀 +10 coins and 10% USDT · Fourth invite</div>
      <div class="reward-item">🚀 +10 coins and 10% USDT · Further invites</div>
      <div class="reward-item blue">🎁 +1 gift for every invite</div>
    </div>
    <div class="card" style="background:rgba(245,197,66,0.08);border-color:rgba(245,197,66,0.25)">
      <div class="section-title">🔥 Five-level program</div>
      <p class="muted">From every USDT top-up</p>
      <div class="level-bars">
        <div>10%</div><div>3%</div><div>2%</div><div>1%</div><div>1%</div>
      </div>
    </div>
    <div class="card">
      <div class="section-title">Your referrals</div>
      <p class="muted" style="margin-bottom:8px">Sorted by levels</p>
      <div class="tabs">
        <button class="tab active">All · ${r.referralCount||0}</button>
        <button class="tab">L1 · ${levels.l1||0}</button>
        <button class="tab">L2 · ${levels.l2||0}</button>
        <button class="tab">L3 · ${levels.l3||0}</button>
        <button class="tab">L4 · ${levels.l4||0}</button>
        <button class="tab">L5 · ${levels.l5||0}</button>
      </div>
      ${list}
    </div>
  `;
  $("#copyRef").onclick = copyRef;
  $("#inviteBtn").onclick = shareInvite;
}

function renderGifts() {
  const u = state.user || {};
  content.innerHTML = `
    <div class="section-title">Open gifts and get free coins</div>
    <p class="muted">You have <b>${u.gifts||0}</b> gift(s). Invite friends to get more.</p>
    <div class="gift-grid" style="margin-top:12px">
      <div class="gift-card gift-pulse" data-gift="btc">
        <div class="label">BTC GIFT</div>
        <div class="tag">GIFT</div>
        <div class="box">🧰</div>
      </div>
      <div class="gift-card gift-pulse" data-gift="eth">
        <div class="label">ETH GIFT</div>
        <div class="tag">GIFT</div>
        <div class="box">🎁</div>
      </div>
    </div>
    <div class="invite-box" style="margin-top:16px">
      <div class="title">Get +1 gift for every invite</div>
      <div class="btn-row">
        <button class="btn btn-blue anim-btn" id="inviteBtn">✈ Invite</button>
      </div>
    </div>
  `;
  $$(".gift-card").forEach(c => c.onclick = () => openGift());
  $("#inviteBtn").onclick = shareInvite;
}

function renderTasks() {
  const tasks = state.tasks || [];
  const adminPanel = state.isAdmin ? `
    <div class="card">
      <div class="section-title">Admin · Add Task</div>
      <input class="input" id="tTitle" placeholder="Task title">
      <input class="input" id="tDesc" placeholder="Description">
      <input class="input" id="tLink" placeholder="Link (https://...)">
      <input class="input" id="tReward" type="number" placeholder="Reward coins" value="10">
      <button class="btn btn-green anim-btn" id="addTaskBtn" style="width:100%">+ Add Task</button>
    </div>
  ` : "";

  const list = tasks.map(t => `
    <div class="task-item">
      <div class="info">
        <div class="title">${t.title}</div>
        <div class="desc">${t.description||''} · +${t.rewardCoins||0} coins</div>
      </div>
      ${t.claimed
        ? `<button class="btn btn-dark btn-sm" disabled>Done</button>`
        : `<button class="btn btn-green btn-sm anim-btn" data-claim="${t.id}">Claim</button>`}
      ${state.isAdmin ? `<button class="btn btn-outline btn-sm" data-del="${t.id}">✕</button>` : ""}
    </div>
  `).join("") || `<p class="muted">No tasks yet.</p>`;

  content.innerHTML = `
    <div class="section-title">📋 Tasks</div>
    ${adminPanel}
    <div class="card">${list}</div>
  `;
  if (state.isAdmin) {
    $("#addTaskBtn").onclick = async () => {
      try {
        await api("/api/admin/tasks", {
          method: "POST",
          body: JSON.stringify({
            title: $("#tTitle").value,
            description: $("#tDesc").value,
            link: $("#tLink").value,
            rewardCoins: Number($("#tReward").value)||10
          })
        });
        toast("Task added");
        await loadTasks();
        renderTasks();
      } catch(e) { toast(e.message); }
    };
  }
  $$("[data-claim]").forEach(b => b.onclick = async () => {
    try {
      const data = await api("/api/tasks/claim", { method:"POST", body: JSON.stringify({ taskId: b.dataset.claim }) });
      state.user = data.user;
      toast("Reward claimed!");
      await loadTasks();
      renderTasks();
    } catch(e) { toast(e.message); }
  });
  $$("[data-del]").forEach(b => b.onclick = async () => {
    try {
      await api("/api/admin/tasks/"+b.dataset.del, { method:"DELETE" });
      toast("Removed");
      await loadTasks();
      renderTasks();
    } catch(e) { toast(e.message); }
  });
}

function renderAccount() {
  const u = state.user || {};
  content.innerHTML = `
    <div class="profile-row">
      <img class="avatar" src="${u.photoUrl||'/assets/assistant-logo.jpg'}" onerror="this.src='/assets/assistant-logo.jpg'">
      <div>
        <div class="badge">Assistant Bangladesh</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">${u.name||''}</div>
      </div>
      <div class="level-pill">★ Level ${u.level||1}</div>
    </div>
    <div class="account-grid">
      <div class="acc-item"><div class="k">Invited by</div><div class="v">${u.referrerTelegramId||'—'}</div></div>
      <div class="acc-item"><div class="k">Coin balance</div><div class="v">${u.coins||0}</div></div>
      <div class="acc-item"><div class="k">USDT balance</div><div class="v">${money(u.usdt,3)} USDT</div></div>
      <div class="acc-item"><div class="k">Referral income</div><div class="v">${money(u.referralIncome,3)} USDT</div></div>
      <div class="acc-item"><div class="k">Referral coins</div><div class="v">${u.referralCoins||0} coins</div></div>
      <div class="acc-item"><div class="k">USDT withdrawn</div><div class="v">${money(u.withdrawnUsdt,3)} USDT</div></div>
      <div class="acc-item" id="langBtn"><div class="k">Language</div><div class="v">${u.language||'English'}</div></div>
      <div class="acc-item" id="themeBtn"><div class="k">Theme</div><div class="v">${u.theme||'Dark'} · toggle</div></div>
      <div class="acc-item" id="opsBtn"><div class="k">Operations</div><div class="v">History</div></div>
      <div class="acc-item" id="faqBtn"><div class="k">FAQ</div><div class="v">Answers</div></div>
      <div class="acc-item" id="tasksBtn"><div class="k">Tasks</div><div class="v">Earn more</div></div>
      <div class="acc-item"><div class="k">Help</div><div class="v">Operators online</div></div>
    </div>
  `;
  $("#themeBtn").onclick = async () => {
    const next = (u.theme === "light") ? "dark" : "light";
    try {
      const data = await api("/api/settings", { method:"POST", body: JSON.stringify({ theme: next }) });
      state.user = data.user;
      document.body.classList.toggle("theme-light", next === "light");
      renderAccount();
    } catch(e) { toast(e.message); }
  };
  $("#opsBtn").onclick = openOperations;
  $("#faqBtn").onclick = openFAQ;
  $("#tasksBtn").onclick = () => { state.page = "tasks"; setActiveNav(null); renderTasks(); };
  $("#langBtn").onclick = openLanguage;
}

/* ---------- Actions ---------- */
async function claimProfit() {
  try {
    const data = await api("/api/claim", { method:"POST", body:"{}" });
    state.user = data.user;
    toast(data.claimed ? `Claimed ${Number(data.claimed).toFixed(8)} USDT` : (data.message||"Claimed"));
    startMining();
    if (state.page === "farm") renderFarm(); else renderTrade();
  } catch(e) { toast(e.message); }
}

async function doSubscribe() {
  try {
    const cfg = state.config || {};
    if (cfg.channelUrl) window.open(cfg.channelUrl, "_blank");
    const data = await api("/api/subscribe", { method:"POST", body:"{}" });
    state.user = data.user;
    toast(data.message || "+10 coins");
    renderTrade();
  } catch(e) { toast(e.message); }
}

function refLink() {
  const uname = (state.config && state.config.botUsername) || "";
  const id = state.user && state.user.telegramId;
  return uname ? `https://t.me/${uname}?start=ref_${id}` : location.href;
}

async function copyRef() {
  try {
    await navigator.clipboard.writeText(refLink());
    toast("Link copied");
  } catch(e) { toast(refLink()); }
}

function shareInvite() {
  const link = refLink();
  // Promotional text matching the bot screenshots + link (Telegram share will attach the link as preview/button)
  const text = `🚀 Launch your personal AI agent and earn USDT income!\n\n🎁 +50 USDT immediately upon activation\n⚡ Earnings start from the very first second\n💰 Withdrawals available with no investment or mandatory referrals\n📱 Everything works directly inside Telegram\n\n👉 Join now: ${link}`;
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
  } else if (navigator.share) {
    navigator.share({ title: "Assistant Bangladesh", text, url: link }).catch(() => copyRef());
  } else {
    copyRef();
  }
}

async function openGift() {
  if (!state.user || (state.user.gifts||0) < 1) {
    toast("No gifts left. Invite friends!");
    return;
  }
  const overlay = document.createElement("div");
  overlay.className = "gift-overlay";
  overlay.innerHTML = `
    <div class="confetti" id="conf"></div>
    <div class="gift-big">🧰</div>
    <div class="spin-wheel" id="wheel"></div>
    <div id="giftResult" style="margin-top:20px;text-align:center;display:none">
      <h2 style="margin:0 0 8px">Congratulations!</h2>
      <p id="giftWin"></p>
      <button class="btn btn-green anim-btn" id="claimGift" style="margin-top:12px;min-width:160px">Claim reward</button>
    </div>
  `;
  document.body.appendChild(overlay);
  const values = [7,6,5,4,3,2,1,7,6,5];
  const wheel = $("#wheel", overlay);
  values.forEach((v,i) => {
    const c = document.createElement("div");
    c.className = "spin-card";
    c.innerHTML = `<div style="font-size:11px;opacity:.7">COINS</div><div>${v}</div>`;
    wheel.appendChild(c);
  });
  let i = 0;
  const spin = setInterval(() => {
    $$(".spin-card", overlay).forEach(c => c.classList.remove("active"));
    const cards = $$(".spin-card", overlay);
    cards[i % cards.length].classList.add("active");
    i++;
  }, 120);

  let reward = 1;
  try {
    const data = await api("/api/gift/open", { method:"POST", body:"{}" });
    reward = data.reward;
    state.user = data.user;
  } catch(e) {
    clearInterval(spin);
    overlay.remove();
    toast(e.message);
    return;
  }

  setTimeout(() => {
    clearInterval(spin);
    const cards = $$(".spin-card", overlay);
    cards.forEach(c => c.classList.remove("active"));
    const winIdx = values.findIndex(v => v === reward);
    if (winIdx >= 0) cards[winIdx].classList.add("active");
    $("#giftResult", overlay).style.display = "block";
    $("#giftWin", overlay).textContent = `You won ${reward} coins!`;
    // confetti
    const conf = $("#conf", overlay);
    for (let k=0;k<40;k++) {
      const iel = document.createElement("i");
      iel.style.left = Math.random()*100 + "%";
      iel.style.background = ["#3ddc84","#f5c542","#2f7bff","#fff"][k%4];
      iel.style.animationDelay = (Math.random()*0.8)+"s";
      conf.appendChild(iel);
    }
    $("#claimGift", overlay).onclick = () => {
      overlay.remove();
      toast(`+${reward} coins`);
      renderGifts();
    };
  }, 2200);
}

function openModal(html) {
  const root = $("#modalRoot");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  $(".modal-backdrop").onclick = (e) => { if (e.target.classList.contains("modal-backdrop")) root.innerHTML = ""; };
}

function openHowEarn() {
  openModal(`
    <button class="close-x" onclick="document.getElementById('modalRoot').innerHTML=''">Close ×</button>
    <h3>How to earn</h3>
    <div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:18px">📈</span>
        <b>Earn by investing</b>
      </div>
      <p class="muted">Top up your USDT balance and your AI agent will automatically use it to run the trading bot.<br><br>
      Funds start generating profit right after the top-up.<br><br>
      Withdraw earned USDT to your wallet anytime or reinvest for more income!</p>
      <button class="btn btn-blue anim-btn" style="width:100%;margin-top:10px" id="howTopBtn">↑ Top up balance</button>
    </div>
    <div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:18px">👥</span>
        <b>Earn by inviting</b>
      </div>
      <p class="muted">Send invites to friends: you get coins for each registration, which greatly increases your hourly income!<br><br>
      The five-level referral program credits USDT to your balance from every top-up in your structure.<br><br>
      You also get +1 crypto gift for every invite!</p>
      <button class="btn btn-green anim-btn" style="width:100%;margin-top:10px" id="howInvBtn">✈ Invite</button>
    </div>
  `);
  $("#howTopBtn").onclick = () => { $("#modalRoot").innerHTML = ""; openTopup(); };
  $("#howInvBtn").onclick = () => { $("#modalRoot").innerHTML = ""; shareInvite(); };
}

function openTopup() {
  openModal(`
    <button class="close-x" onclick="document.getElementById('modalRoot').innerHTML=''">Close ×</button>
    <h3>Top up balance</h3>
    <input class="input" id="topAmt" type="number" placeholder="Amount USDT" value="10">
    <button class="btn btn-blue anim-btn" id="doTop" style="width:100%">Submit top-up request</button>
  `);
  $("#doTop").onclick = async () => {
    try {
      const amount = Number($("#topAmt").value);
      const data = await api("/api/topup", { method:"POST", body: JSON.stringify({ amount }) });
      toast(data.message || "Submitted");
      $("#modalRoot").innerHTML = "";
    } catch(e) { toast(e.message); }
  };
}

function openWithdraw() {
  openModal(`
    <button class="close-x" onclick="document.getElementById('modalRoot').innerHTML=''">Close ×</button>
    <h3>Withdraw USDT</h3>
    <input class="input" id="wAmt" type="number" placeholder="Amount">
    <input class="input" id="wWallet" placeholder="Wallet address (USDT TRC20/BEP20)">
    <button class="btn btn-green anim-btn" id="doW" style="width:100%">Request withdrawal</button>
  `);
  $("#doW").onclick = async () => {
    try {
      const data = await api("/api/withdraw", {
        method:"POST",
        body: JSON.stringify({ amount: Number($("#wAmt").value), wallet: $("#wWallet").value })
      });
      state.user = data.user;
      toast("Withdrawal submitted");
      $("#modalRoot").innerHTML = "";
      renderTrade();
    } catch(e) { toast(e.message); }
  };
}

async function openOperations() {
  try {
    const data = await api("/api/operations");
    const rows = (data.operations||[]).map(o => {
      const val = o.coins ? `+${o.coins} coins` : (o.amount ? `${o.amount>0?'+':''}${Number(o.amount).toFixed(6)} USDT` : o.note||"");
      return `<div class="ops-row"><div><b>${o.type}</b><div class="muted" style="font-size:11px">${new Date(o.createdAt).toLocaleString()}</div></div><div class="pos">${val}</div></div>`;
    }).join("") || "<p class='muted'>No operations</p>";
    openModal(`<button class="close-x" onclick="document.getElementById('modalRoot').innerHTML=''">Close ×</button><h3>Operations</h3>${rows}`);
  } catch(e) { toast(e.message); }
}

async function openFAQ() {
  try {
    const data = await api("/api/faq");
    const items = (data.faqs||[]).map(f => `<details class="faq-item"><summary>${f.question}</summary><p>${f.answer}</p></details>`).join("")
      || `<details class="faq-item"><summary>How do I start earning?</summary><p>Open Farm, claim profit, invite friends, open gifts.</p></details>
          <details class="faq-item"><summary>What are coins?</summary><p>1 coin = 1 USDT value. Coins pay 0.02% daily profit.</p></details>
          <details class="faq-item"><summary>How does referral work?</summary><p>5-level program: 10%, 3%, 2%, 1%, 1% from top-ups.</p></details>`;
    openModal(`<button class="close-x" onclick="document.getElementById('modalRoot').innerHTML=''">Close ×</button><h3>FAQ</h3>${items}`);
  } catch(e) { toast(e.message); }
}

function openLanguage() {
  const langs = ["English","বাংলা","Русский","Español","العربية"];
  openModal(`
    <button class="close-x" onclick="document.getElementById('modalRoot').innerHTML=''">Close ×</button>
    <h3>Language</h3>
    ${langs.map(l => `<button class="btn btn-dark anim-btn" style="width:100%;margin-bottom:8px" data-lang="${l}">${l}</button>`).join("")}
  `);
  $$("[data-lang]").forEach(b => b.onclick = async () => {
    try {
      const data = await api("/api/settings", { method:"POST", body: JSON.stringify({ language: b.dataset.lang }) });
      state.user = data.user;
      $("#modalRoot").innerHTML = "";
      renderAccount();
    } catch(e) { toast(e.message); }
  });
}

/* ---------- Nav ---------- */
function setActiveNav(page) {
  $$(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.page === page);
  });
}

async function go(page) {
  state.page = page;
  setActiveNav(page);
  content.classList.remove("page-enter");
  void content.offsetWidth;
  content.classList.add("page-enter");
  if (page === "trade") renderTrade();
  else if (page === "farm") renderFarm();
  else if (page === "friends") {
    try { state.referrals = await api("/api/referrals"); } catch(e) {}
    renderFriends();
  }
  else if (page === "gifts") renderGifts();
  else if (page === "account") renderAccount();
  else if (page === "tasks") { await loadTasks(); renderTasks(); }
}

async function loadTasks() {
  try {
    const data = await api("/api/tasks");
    state.tasks = data.tasks || [];
  } catch(e) { state.tasks = []; }
}

/* ---------- Boot ---------- */
async function boot() {
  $("#closeBtn").onclick = () => { if (tg) tg.close(); };
  $$(".nav-btn").forEach(b => b.onclick = () => go(b.dataset.page));

  try {
    state.config = await api("/api/config");
  } catch(e) { state.config = {}; }

  try {
    const me = await api("/api/me");
    state.user = me;
    state.isAdmin = !!me.isAdmin;
    if (me.theme === "light") document.body.classList.add("theme-light");
  } catch(e) {
    // Demo fallback for browser preview
    state.user = {
      name: "Demo User", photoUrl: "/assets/assistant-logo.jpg", level: 1,
      coins: 56, usdt: 0.0005, claimedUsdt: 0, incomeHour: 0.0005, incomeDay: 0.012, incomeMonth: 0.36,
      gifts: 2, referralCount: 0, language: "English", theme: "dark", telegramId: "demo"
    };
  }

  go("trade");
  // Live online: update every 4 seconds so the number moves up/down like screenshots (30k–40k)
  const updateOnline = () => {
    api("/api/heartbeat").then(d => {
      if (d.online) $("#onlineCount").textContent = fmtOnline(d.online);
    }).catch(()=>{});
  };
  updateOnline();
  setInterval(updateOnline, 4000);
  setInterval(showPayouts, 12000);
  setTimeout(showPayouts, 3000);
}

boot();
