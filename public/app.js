const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try { tg.setHeaderColor("#09142f"); tg.setBackgroundColor("#09142f"); } catch(e){}
}

const BOT_USERNAME = ""; window.BOT_USERNAME = BOT_USERNAME;
const state={user:null,page:"trade"};
async function heartbeat(){try{const d=await api("/api/presence",{method:"POST"});const e=document.querySelector(".online span");if(e)e.textContent=`${Number(d.online||0).toLocaleString()} online`;}catch(e){}}
setInterval(heartbeat,1000);

function money(n, d=4){ return Number(n || 0).toFixed(d); }
function toast(msg){
  const el=document.getElementById("toast"); el.textContent=msg; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2600);
}
async function api(url, options={}){
  options.headers={...(options.headers||{}),"x-telegram-init-data":tg?.initData||""};
  if(options.body && typeof options.body!=="string"){
    options.headers["Content-Type"]="application/json"; options.body=JSON.stringify(options.body);
  }
  const r=await fetch(url,options); const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||"Request failed"); return data;
}
async function load(){
  try { state.user=await api("/api/me"); render(); }
  catch(e){ document.getElementById("content").innerHTML=`<div class="page"><h1>Telegram authorization required</h1><p class="muted">Open this page from your Telegram bot's Mini App button.</p></div>`; }
}
function shell(inner,title=""){
  return `<div class="page">${title?`<h1 class="hero-title">${title}</h1>`:""}${inner}</div>`;
}
function nav(){
  document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===state.page));
}
function render(){
  nav();
  const c=document.getElementById("content");
  if(state.page==="trade") c.innerHTML=dashboard();
  if(state.page==="friends") c.innerHTML=friends();
  if(state.page==="farm") c.innerHTML=farm();
  if(state.page==="gifts") c.innerHTML=gifts();
  if(state.page==="account") c.innerHTML=account();
}
function dashboard(){
  const u=state.user;
  return shell(`
    <div class="balance-row">
      <img class="avatar" src="${u.photoUrl||"/assets/assistant-logo.jpg"}">
      <div class="name-badge">${escapeHtml(u.name)}</div>
      <div class="level">★ Level 1</div>
    </div>
    <div class="income"><b>◉ Income</b><span>◷ $0.0005 hr</span><span>▣ $0.01 day</span><span>▣ $0.34 month</span></div>
    <div class="big-income">$<span>0.0008${String(Math.random()).slice(2,8)}</span></div>
    <div class="actions"><button class="btn lime" onclick="claim()">↗ Claim profit</button><button class="btn" style="background:#192235;color:#aab3c7" onclick="howEarn()">❔ How to earn?</button></div>
    <p class="muted">Top up to 3 USDT or grow with invites to raise income to 2.7% per day.</p>
    <div class="cards">
      <div class="card coin-bg"><h3>Coins</h3><div class="number">${money(u.coins,0)} ≈$${money(u.coins,2)}</div><div class="profit" style="margin-top:18px">0.02% <span class="muted">Per day</span></div></div>
      <div class="card usdt-bg"><h3>USDT balance</h3><div class="number">$${money(u.usdt,4)}</div><div style="margin-top:18px;color:#ef6464">0% <span class="muted">Per day</span></div></div>
    </div>
    <div class="actions"><button class="btn blue" onclick="topup()">⇧ Top up</button><button class="btn lime" onclick="withdraw()">⇩ Withdraw</button></div>
    <div class="invite-card">
      <h2 style="margin-top:0">Get +50 coins for an invite</h2>
      <div class="muted">⚡ Your hourly income will increase by +50%!</div>
      <div class="muted" style="margin-top:8px">★ Automatic 5-level USDT income</div>
      <div class="invite-row"><div class="mini-avatars"><img src="/assets/assistant-logo.jpg"><i>V</i></div><button class="btn" style="background:#1b2230;color:#fff" onclick="copyRef()">▣ Copy</button><button class="btn blue" onclick="shareRef()">➤ Invite</button></div>
    </div>
    <div class="subscribe"><div class="tg-icon">➤</div><div><b>Subscribe to the channel</b><div class="muted">Get +10 coins on your balance</div></div><button onclick="subscribe()">Subscribe →</button></div>
    <div class="review">⭐ ⭐ ⭐ ⭐ ⭐ &nbsp; <b>Payout reviews</b></div>
  `);
}
function friends(){
  return shell(`
    <h1 class="hero-title">Invite friends and raise<br>your hourly income</h1>
    <div class="invite-card" style="margin-top:20px"><div class="actions"><button class="btn" style="background:#1b2230;color:#fff" onclick="copyRef()">▣ Copy</button><button class="btn blue" onclick="shareRef()">➤ Invite</button></div></div>
    <div class="green-panel section"><h2>Reward for each friend</h2>
      ${[
        ["+50 coins and 10% USDT","First invite"],
        ["+30 coins and 10% USDT","Second invite"],
        ["+20 coins and 10% USDT","Third invite"],
        ["+10 coins and 10% USDT","Fourth invite"],
        ["+10 coins and 10% USDT","Further invites"]
      ].map(x=>`<div class="reward"><img src="/assets/assistant-logo.jpg"><div><b>${x[0]}</b><div class="muted">${x[1]}</div></div></div>`).join("")}
    </div>
    <div class="blue-panel"><h2>🎁 +1 gift for every invite</h2></div>
    <div class="orange-panel"><h2>🔥 Five-level program</h2><div class="levels">${["10%","3%","2%","1%","1%"].map(x=>`<div class="level-box">${x}</div>`).join("")}</div><p>From every USDT top-up</p></div>
    <div class="card section"><h2>Your referrals</h2><div class="muted">Sorted by levels</div><div class="ref-tabs"><span class="active">All · ${state.user.referralCount}</span><span>L1 · ${state.user.referralCount}</span><span>L2 · 0</span><span>L3 · 0</span><span>L4 · 0</span><span>L5 · 0</span></div><div id="refs" class="empty">Loading referrals...</div></div>
  `);
}
async function fillRefs(){ if(state.page!=="friends")return; try{const d=await api("/api/referrals");const el=document.getElementById("refs");el.innerHTML=d.direct.length?d.direct.map(x=>`<div class="account-row"><span>${escapeHtml(x.name)}</span><span class="muted">@${escapeHtml(x.username||"user")}</span></div>`).join(""):"No referrals yet";}catch(e){} }
function farm(){
  return shell(`
    <h1 class="hero-title">Your trading-bot dashboard</h1>
    <p class="muted">Top up from 10 USDT to unlock extra bots and raise income</p>
    <div class="farm-hero"><div style="display:flex;justify-content:space-between"><span>Total balance</span><b>🟢 ACTIVE</b></div><div style="font-size:52px;font-weight:900;margin-top:12px">${money(state.user.coins,0)} <small>USDT</small></div><div class="chart"><svg class="chart-svg" viewBox="0 0 500 200" preserveAspectRatio="none"><polyline points="0,150 50,130 100,145 160,80 220,105 280,60 340,85 400,25 500,55" fill="none" stroke="#a9c7ff" stroke-width="3"/></svg></div><div class="farm-grid" style="margin-top:0"><div><b>Coins</b><div class="profit">${money(state.user.coins,0)}</div></div><div><b>Active</b><div>1 bots</div></div><div><b>USDT</b><div>$${money(state.user.usdt,4)}</div></div></div></div>
    <div class="farm-grid"><div class="farm-stat"><div class="muted">Successful trades</div><b style="font-size:25px">72.19%</b></div><div class="farm-stat"><div class="muted">Total income</div><b style="font-size:25px">0.00 USDT</b></div><div class="farm-stat"><div class="muted">Bots</div><b style="font-size:25px">BTC</b></div><div class="farm-stat"><div class="muted">Updated</div><b style="font-size:25px">${new Date().toLocaleTimeString()}</b></div></div>
    <h2>How to read the chart and reports</h2><p class="muted">Each line on the chart is a limit buy/sell order. “B” is a buy at that point, “S” is a sell. Long and short trades can be open at the same time.</p>
    <div class="chart-card"><div style="display:flex;justify-content:space-between"><b>BTC/USDT · GRID Bot</b><span class="profit">77,680 +0.64%</span></div><div class="chart" style="margin-top:15px"><div class="line price-line"></div><div class="line two"></div><svg class="chart-svg" viewBox="0 0 500 280" preserveAspectRatio="none"><polyline points="0,175 20,150 40,180 60,125 80,160 100,130 120,210 140,245 160,220 180,250 200,170 220,190 240,150 260,120 280,160 300,105 320,75 340,120 360,90 380,115 400,100 420,115 440,95 460,110 500,75" fill="none" stroke="#48e68a" stroke-width="3"/></svg></div><div class="trade-list">${["+0.32%","+0.32%","+0.32%","+0.60%","+0.98%","+0.26%","+0.32%","+0.20%"].map((p,i)=>`<div class="trade-item"><span>23/08/2026 · ${["19:15","18:30","17:45","16:30","14:30","10:15","08:45","07:45"][i]}</span><span class="profit">${p}</span></div>`).join("")}</div>
  `);
}
function gifts(){return shell(`<h1 class="hero-title">Open gifts and get free coins</h1><div class="invite-card"><h2>🎁 Get +1 gift for every invite</h2><p class="muted">${state.user.gifts} gift(s) available</p><div class="actions"><button class="btn" style="background:#1b2230;color:#fff" onclick="copyRef()">Copy</button><button class="btn blue" onclick="shareRef()">Invite</button></div></div>`);}
function account(){
  return shell(`<h1 class="hero-title">Account</h1><div class="card"><div class="account-row"><b>Name</b><span>${escapeHtml(state.user.name)}</span></div><div class="account-row"><b>Username</b><span>@${escapeHtml(state.user.username||"not set")}</span></div><div class="account-row"><b>Coins</b><span>${money(state.user.coins,0)}</span></div><div class="account-row"><b>USDT</b><span>$${money(state.user.usdt,8)}</span></div><div class="account-row"><b>Referrals</b><span>${state.user.referralCount}</span></div></div><div class="card section"><h3>Wallet & withdrawals</h3><p class="muted">Withdrawal requests are held as pending until an administrator/payment provider processes them.</p><button class="btn lime" onclick="withdraw()">Withdraw USDT</button></div>`);
}
async function claim(){try{const d=await api("/api/claim",{method:"POST"});state.user=d.user;toast("Profit claimed: $0.0005");render()}catch(e){toast(e.message)}}
async function subscribe(){try{const d=await api("/api/subscribe",{method:"POST"});state.user=d.user;toast(d.message||"+10 coins added");render()}catch(e){toast(e.message)}}
function modal(title,body,submit){
  const old=document.querySelector(".modal"); if(old)old.remove();
  document.body.insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modal-box"><h2>${title}</h2>${body}<div class="modal-actions"><button class="btn" style="background:#222b3b;color:#fff" onclick="document.getElementById('modal').remove()">Cancel</button><button class="btn lime" id="modalSubmit">${submit}</button></div></div></div>`);
}
function topup(){modal("Top up USDT",`<p class="muted">Enter the amount. This creates a pending top-up request for your configured payment flow.</p><input id="amount" type="number" min="1" step="0.01" placeholder="Amount in USDT">`,"Create request");document.getElementById("modalSubmit").onclick=async()=>{try{const amount=Number(document.getElementById("amount").value);const d=await api("/api/topup",{method:"POST",body:{amount}});document.getElementById("modal").remove();toast(d.message)}catch(e){toast(e.message)}}}
function withdraw(){modal("Withdraw USDT",`<input id="amount" type="number" min="1" step="0.01" placeholder="Amount in USDT"><input id="wallet" placeholder="USDT wallet address">`,"Submit withdrawal");document.getElementById("modalSubmit").onclick=async()=>{try{const amount=Number(document.getElementById("amount").value);const wallet=document.getElementById("wallet").value;const d=await api("/api/withdraw",{method:"POST",body:{amount,wallet}});state.user=d.user;document.getElementById("modal").remove();toast("Withdrawal request submitted");render()}catch(e){toast(e.message)}}}
function copyRef(){const id=state.user.telegramId;const u=location.origin;const text=`https://t.me/${encodeURIComponent(window.BOT_USERNAME||"YOUR_BOT_USERNAME")}?start=ref_${id}`;navigator.clipboard?.writeText(text);toast("Referral link copied");}
function shareRef(){const id=state.user.telegramId;const bot=window.BOT_USERNAME||"YOUR_BOT_USERNAME";const link=`https://t.me/${bot}?start=ref_${id}`;const share=`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join my AI agent and start earning!")}`;if(tg?.openTelegramLink)tg.openTelegramLink(share);else location.href=share}
function howEarn(){toast("Use invites, channel tasks, claims and configured top-ups to grow your account.");}
function escapeHtml(s){return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
document.querySelectorAll(".bottom-nav button").forEach(b=>b.onclick=()=>{state.page=b.dataset.page;render();fillRefs()});
document.getElementById("closeBtn").onclick=()=>{try{tg?.close()}catch(e){}};
load();
