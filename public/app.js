const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try { tg.setHeaderColor("#14224a"); tg.setBackgroundColor("#0b1229"); } catch(e){}
}

const BOT_USERNAME = ""; window.BOT_USERNAME = BOT_USERNAME;
const state={user:null,page:"trade"};

async function heartbeat(){try{const d=await api("/api/presence",{method:"POST"});const e=document.querySelector(".online span");if(e)e.textContent=`${Number(d.online||0).toLocaleString()} online`;}catch(e){}}
setInterval(heartbeat,2500);

function money(n,d=4){return Number(n||0).toFixed(d)}
function escapeHtml(s){return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function toast(msg){const el=document.getElementById("toast");if(!el)return;el.textContent=msg;el.classList.add("show");clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>el.classList.remove("show"),2600)}
async function api(url,options={}){options.headers={...(options.headers||{}),"x-telegram-init-data":tg?.initData||""};if(options.body&&typeof options.body!=="string"){options.headers["Content-Type"]="application/json";options.body=JSON.stringify(options.body)}const r=await fetch(url,options);const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Request failed");return data}

async function load(){try{state.user=await api("/api/me");render();heartbeat();startPayoutTicker()}catch(e){document.getElementById("content").innerHTML=`<div class="page"><h1 class="hero-title">Telegram authorization required</h1><p class="muted">Open this Mini App from your Telegram bot button.</p></div>`}}
function shell(inner,title=""){return `<div class="page">${title?`<h1 class="hero-title">${title}</h1>`:""}${inner}</div>`}
function nav(){document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===state.page))}
function render(){nav();const c=document.getElementById("content");if(state.page==="trade")c.innerHTML=dashboard();if(state.page==="friends")c.innerHTML=friends();if(state.page==="farm")c.innerHTML=farm();if(state.page==="gifts")c.innerHTML=gifts();if(state.page==="account")c.innerHTML=account()}

function dashboard(){
  const u=state.user;
  const cents=String(Math.floor(Math.random()*90000000)+10000000).padStart(8,"0");
  const income=`0.00${String(Math.floor(Math.random()*99)+1).padStart(2,"0")}`;
  return shell(`
    <div class="balance-row">
      <img class="avatar" src="${u.photoUrl||"/assets/assistant-logo.jpg"}" alt="">
      <div class="name-badge">${escapeHtml(u.name)}</div>
      <div class="level">★ Level 1</div>
    </div>
    <div class="total-line"><span class="usdt-dot">₮</span><b>${money(u.coins,0)}</b><b style="font-size:22px;color:#9ea6b8">USDT</b><span>Total balance</span></div>
    <div class="income"><strong><span class="dot"></span> Income</strong><span>◷ <b>$0.0012</b> hr</span><span>▣ <b>$0.03</b> day</span><span>▣ <b>$0.90</b> month</span></div>
    <div class="big-income">$0.00<span>${income}${cents}</span></div>
    <div class="income-actions"><button class="btn btn-lime" onclick="claim()">↗ Claim profit</button><button class="btn btn-ghost" onclick="howEarn()">❔ How to earn?</button></div>
    <p class="info-note">Top up to 3 USDT or grow with invites to raise income to 2.7% per day.</p>
    <div class="cards">
      <div class="card coin"><h3>Coins</h3><div class="coin-value">${money(u.coins,0)}</div><div class="sub-value">≈$${money(u.coins,2)}</div><div class="daily">0.02% <span class="muted">Per day</span></div></div>
      <div class="card usdt"><h3>USDT balance</h3><div class="coin-value">$${money(u.usdt,4)}</div><div class="sub-value">&nbsp;</div><div class="daily red">0% <span class="muted">Per day</span></div></div>
    </div>
    <div class="actions"><button class="btn btn-blue" onclick="topup()">⇧ &nbsp;Top up</button><button class="btn btn-lime" onclick="withdraw()">⇩ &nbsp;Withdraw</button></div>
    <div class="invite-card">
      <h2>Get +20 coins for an invite</h2>
      <div class="invite-lines"><div>⚡ <b>Your hourly income will increase by +50%!</b></div><div>★ Automatic 5-level USDT income</div></div>
      <div class="invite-row"><div class="mini-avatars"><img src="/assets/assistant-logo.jpg" alt=""><i>V</i></div><button class="btn btn-ghost" onclick="copyRef()">▣ &nbsp;Copy</button><button class="btn btn-blue" onclick="shareRef()">➤ &nbsp;Invite</button></div>
    </div>
    <div class="subscribe"><div class="tg-icon">➤</div><div><b>Subscribe to the channel</b><div class="muted" style="margin-top:4px">Get +10 coins on your balance</div></div><button onclick="subscribe()">Subscribe →</button></div>
    <div class="review"><span class="stars">★ ★ ★ ★ ★</span> Payout reviews</div>
  `)
}

function friends(){
  const count=Number(state.user.referralCount||0);
  return shell(`
    <h1 class="hero-title">Invite friends and raise<br>your hourly income</h1>
    <div class="invite-card"><div class="invite-lines"><div>⚡ <b>Get rewards for every registration</b></div><div>★ Automatic 5-level USDT income</div></div><div class="actions" style="margin-top:18px"><button class="btn btn-ghost" onclick="copyRef()">▣ &nbsp;Copy</button><button class="btn btn-blue" onclick="shareRef()">➤ &nbsp;Invite</button></div></div>
    <div class="panel green-panel"><h2>Reward for each friend</h2>
      ${[["+50 coins and 10% USDT","First invite"],["+30 coins and 10% USDT","Second invite"],["+20 coins and 10% USDT","Third invite"],["+10 coins and 10% USDT","Fourth invite"],["+10 coins and 10% USDT","Further invites"]].map(x=>`<div class="reward"><img src="/assets/assistant-logo.jpg" alt=""><div><b>${x[0]}</b><div class="muted">${x[1]}</div></div></div>`).join("")}
    </div>
    <div class="panel blue-panel"><div class="gift-banner"><div class="gift-icon">♔</div><div><h2 style="margin:0 0 4px">+1 gift for every invite</h2><div style="color:rgba(255,255,255,.68)">Open gifts to collect free coins.</div></div></div></div>
    <div class="panel orange-panel"><h2>🔥 Five-level program</h2><div class="levels">${["10%","3%","2%","1%","1%"].map(x=>`<div class="level-box">↗<br>${x}</div>`).join("")}</div><p style="margin:12px 0 0;color:rgba(255,255,255,.75)">From every USDT top-up</p></div>
    <div class="card" style="margin-top:17px"><h2 style="margin-bottom:5px">Your referrals</h2><div class="muted">Sorted by levels</div><div class="ref-tabs"><span class="active">All · ${count}</span><span>L1 · ${count}</span><span>L2 · 0</span><span>L3 · 0</span><span>L4 · 0</span><span>L5 · 0</span></div><div id="refs" class="empty">Loading referrals...</div></div>
  `)
}
async function fillRefs(){if(state.page!=="friends")return;try{const d=await api("/api/referrals");const el=document.getElementById("refs");if(!el)return;el.innerHTML=d.direct.length?d.direct.map(x=>`<div class="account-row"><div><b>${escapeHtml(x.name)}</b><div class="muted" style="font-size:12px;margin-top:4px">${escapeHtml(x.username?"@"+x.username:"Telegram user")}</div></div><b class="profit">+0.00 USDT</b></div>`).join(""):"No referrals yet"}catch(e){const el=document.getElementById("refs");if(el)el.textContent="Unable to load referrals"}}

function farm(){return shell(`
  <h1 class="hero-title">Your trading-bot dashboard</h1><p class="hero-sub">Track your active bot, balance and recent trading performance in one smooth mobile view.</p>
  <div class="farm-hero"><div class="farm-head"><b>Total balance</b><b class="active-badge">● ACTIVE</b></div><div class="farm-balance">${money(state.user.coins,0)} <small style="font-size:19px;color:#a8b0c0">USDT</small></div><div class="chart"><svg viewBox="0 0 500 200" preserveAspectRatio="none"><polyline points="0,150 50,130 100,145 160,80 220,105 280,60 340,85 400,25 500,55" fill="none" stroke="#4ce59a" stroke-width="4"/></svg></div><div class="farm-grid"><div><b>Coins</b><div class="profit">${money(state.user.coins,0)}</div></div><div><b>Active</b><div>1 bot</div></div><div><b>USDT</b><div>$${money(state.user.usdt,4)}</div></div><div><b>Income</b><div class="profit">+0.00%</div></div></div></div>
  <div class="farm-grid"><div class="farm-stat"><div class="muted">Successful trades</div><b style="font-size:25px">72.19%</b></div><div class="farm-stat"><div class="muted">Total income</div><b style="font-size:25px">0.00 USDT</b></div><div class="farm-stat"><div class="muted">Bots</div><b style="font-size:25px">BTC</b></div><div class="farm-stat"><div class="muted">Updated</div><b style="font-size:16px">${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</b></div></div>
  <h2 class="section-title">How the bot works</h2><p class="hero-sub">Each trade is tracked automatically. Use the chart and reports to review recent activity and performance.</p>
  <div class="chart-card"><div style="display:flex;justify-content:space-between;gap:10px"><b>BTC/USDT · GRID Bot</b><span class="profit">77,680 +0.64%</span></div><div class="chart" style="margin-top:15px"><svg viewBox="0 0 500 280" preserveAspectRatio="none"><polyline points="0,175 20,150 40,180 60,125 80,160 100,130 120,210 140,245 160,220 180,250 200,170 220,190 240,150 260,120 280,160 300,105 320,75 340,120 360,90 380,115 400,100 420,115 440,95 460,110 500,75" fill="none" stroke="#48e68a" stroke-width="3"/></svg></div><div class="trade-list">${["+0.32%","+0.32%","+0.32%","+0.60%","+0.98%","+0.26%","+0.32%","+0.20%"].map((p,i)=>`<div class="trade-item"><span>23/08/2026 · ${["19:15","18:30","17:45","16:30","14:30","10:15","08:45","07:45"][i]}</span><span class="profit">${p}</span></div>`).join("")}</div></div>
`) }

function gifts(){return shell(`<div class="gift-empty"><h1 class="hero-title">Open gifts and get free coins</h1><div class="gift-card"><div class="gift-head"><div class="gift-icon">♔</div><div><h2 style="margin:0 0 5px">Get +1 gift for every invite</h2><div class="muted">${Number(state.user.gifts||0)} gift(s) available</div></div></div><div class="actions"><button class="btn btn-ghost" onclick="copyRef()">▣ &nbsp;Copy</button><button class="btn btn-blue" onclick="shareRef()">➤ &nbsp;Invite</button></div></div></div>`) }

function account(){
  const u=state.user;
  return shell(`
    <div class="balance-row"><img class="avatar" src="${u.photoUrl||"/assets/assistant-logo.jpg"}" alt=""><div class="name-badge">${escapeHtml(u.name)}</div><div class="level">★ Level 1</div></div>
    <div class="total-line"><span class="usdt-dot">₮</span><b>${money(u.coins,0)}</b><b style="font-size:22px;color:#9ea6b8">USDT</b></div>
    <h1 class="hero-title" style="margin-top:10px">Account</h1>
    <div class="card"><div class="account-row"><b>Name</b><span>${escapeHtml(u.name)}</span></div><div class="account-row"><b>Username</b><span>@${escapeHtml(u.username||"not set")}</span></div><div class="account-row"><b>Coins</b><span>${money(u.coins,0)}</span></div><div class="account-row"><b>USDT</b><span>$${money(u.usdt,8)}</span></div><div class="account-row"><b>Referrals</b><span>${u.referralCount}</span></div></div>
    <div class="settings-grid"><div class="card setting-card"><div class="setting-icon">◎</div><div><div class="muted">Language</div><div class="setting-value">🇬🇧 English</div></div></div><div class="card setting-card"><div class="setting-icon">☼</div><div><div class="muted">Theme</div><div class="setting-value" style="display:flex;justify-content:space-between;align-items:center">Dark <button id="themeSwitch" class="switch on" onclick="toggleTheme()" aria-label="Toggle theme"></button></div></div></div><div class="card setting-card"><div class="setting-icon">⇄</div><div><div class="muted">Operations</div><div class="setting-value">History</div></div></div><div class="card setting-card"><div class="setting-icon">?</div><div><div class="muted">FAQ</div><div class="setting-value">18 answers</div></div></div><div class="card setting-card"><div class="setting-icon">♡</div><div><div class="muted">Help</div><div class="setting-value"><span class="profit">●</span> Operators online</div></div></div></div>
    <div class="card" style="margin-top:15px"><h3>Wallet & withdrawals</h3><p class="muted" style="line-height:1.6">Withdrawal requests stay pending until an administrator/payment provider processes them.</p><button class="btn btn-lime" onclick="withdraw()">Withdraw USDT</button></div>
  `)
}

function howEarn(){
  modal("How to earn",`<div class="earn-section"><div class="earn-icon">↗</div><h3>Earn by investing</h3><p>Top up your USDT balance and your AI agent will automatically use it to run the trading bot.</p><p>Funds start generating profit right after the top-up.</p><p>Withdraw earned USDT to your wallet anytime or reinvest for more income!</p><button class="btn btn-blue" onclick="document.getElementById('modal').remove();topup()">⇧ &nbsp;Top up balance</button></div><div class="earn-section"><div class="earn-icon" style="background:rgba(34,215,119,.12);color:#36d980">♧</div><h3>Earn by inviting</h3><p>Send invites to friends: you get coins for each registration, which greatly increases your hourly income!</p><p>The five-level referral program credits USDT to your balance from every top-up in your structure.</p><p>You also get +1 crypto gift for every invite!</p><button class="btn btn-lime" onclick="document.getElementById('modal').remove();shareRef()">➤ &nbsp;Invite</button></div>`,"Close")
  const submit=document.getElementById("modalSubmit");if(submit)submit.remove();const cancel=document.querySelector("#modal .modal-actions .btn");if(cancel)cancel.textContent="Close ×"
}

function modal(title,body,submit){const old=document.querySelector(".modal");if(old)old.remove();document.body.insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modal-box"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h2 style="margin:0">${title}</h2><button class="btn btn-ghost" style="flex:0 0 auto;min-height:46px;padding:0 16px" onclick="document.getElementById('modal').remove()">Close ×</button></div>${body}${submit?`<div class="modal-actions"><button class="btn btn-ghost" onclick="document.getElementById('modal').remove()">Cancel</button><button class="btn btn-lime" id="modalSubmit">${submit}</button></div>`:""}</div></div>`)}
function topup(){modal("Top up USDT",`<p class="muted">Enter the amount. This creates a pending top-up request for your configured payment flow.</p><input id="amount" type="number" min="1" step="0.01" placeholder="Amount in USDT">`,"Create request");document.getElementById("modalSubmit").onclick=async()=>{try{const amount=Number(document.getElementById("amount").value);const d=await api("/api/topup",{method:"POST",body:{amount}});document.getElementById("modal").remove();toast(d.message)}catch(e){toast(e.message)}}}
function withdraw(){modal("Withdraw USDT",`<p class="muted">Choose the amount and provide your USDT wallet address.</p><input id="amount" type="number" min="1" step="0.01" placeholder="Amount in USDT"><input id="wallet" placeholder="USDT wallet address">`,"Submit withdrawal");document.getElementById("modalSubmit").onclick=async()=>{try{const amount=Number(document.getElementById("amount").value);const wallet=document.getElementById("wallet").value;const d=await api("/api/withdraw",{method:"POST",body:{amount,wallet}});state.user=d.user;document.getElementById("modal").remove();toast("Withdrawal request submitted");render()}catch(e){toast(e.message)}}}
function copyRef(){const id=state.user.telegramId;const text=`https://t.me/${encodeURIComponent(window.BOT_USERNAME||"YOUR_BOT_USERNAME")}?start=ref_${id}`;navigator.clipboard?.writeText(text);toast("Referral link copied")}
function shareRef(){const id=state.user.telegramId;const bot=window.BOT_USERNAME||"YOUR_BOT_USERNAME";const link=`https://t.me/${bot}?start=ref_${id}`;const share=`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join my AI agent and start earning!")}`;if(tg?.openTelegramLink)tg.openTelegramLink(share);else location.href=share}
function toggleTheme(){document.body.classList.toggle("light-preview");toast(document.body.classList.contains("light-preview")?"Light preview enabled":"Dark theme enabled")}
function startPayoutTicker(){if(window.__payoutTimer)return;const names=["@mo***93","@ho***on","@Cr***li","@ra***27"];const amounts=["$0.1 USDT","$0.3 USDT","$0.1 USDT","$0.5 USDT"];let i=0;const show=()=>{const t=document.getElementById("payoutToast");if(!t)return;document.getElementById("payoutName").textContent=names[i%names.length];document.getElementById("payoutAmount").textContent=amounts[i%amounts.length];t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3300);i++};setTimeout(show,2400);window.__payoutTimer=setInterval(show,9000)}

document.querySelectorAll(".bottom-nav button").forEach(b=>b.onclick=()=>{state.page=b.dataset.page;render();fillRefs();window.scrollTo({top:0,behavior:"smooth"})});
document.getElementById("closeBtn").onclick=()=>{try{tg?.close()}catch(e){}};
document.getElementById("collapseBtn").onclick=()=>toast("Navigation menu");
document.getElementById("menuBtn").onclick=()=>toast("NOVUM.AI VIP");
load();
