(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }
  const initData = tg ? tg.initData : '';

  const state = { lang: 'en', strings: {}, profile: null, tab: 'merge' };

  async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), { data, status: res.status });
    return data;
  }
  async function adminApi(path, options = {}) { return api(`/admin${path}`, options); }

  async function loadLocale(lang) {
    try {
      const res = await fetch(`/api/locales/${lang}`);
      state.strings = res.ok ? await res.json() : {};
    } catch (e) { state.strings = {}; }
    state.lang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    applyStaticI18n();
  }

  function t(key, vars = {}) {
    let s = state.strings[key] || key;
    Object.entries(vars).forEach(([k, v]) => { s = s.replace(`{${k}}`, v); });
    return s;
  }

  function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
  }

  function toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function floatXp(amount, atX, atY) {
    const el = document.createElement('div');
    el.className = 'xp-float';
    el.textContent = `+${amount} XP`;
    el.style.left = `${atX}px`;
    el.style.top = `${atY}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  function renderStats() {
    if (!state.profile) return;
    document.getElementById('levelPill').textContent = `${t('level')} ${state.profile.level}`;
    document.getElementById('xpPill').innerHTML = `<img src="assets/ui/xp_gem.png" class="pill-icon"/> ${state.profile.xp} ${t('xp')}`;
    document.getElementById('adminTabBtn').style.display = state.profile.isAdmin ? '' : 'none';
  }

  function itemIcon(tier) { return `assets/items/gift_tier${Math.min(tier, 8)}.png`; }

  // ---------- Merge board (touch drag & drop) ----------
  async function renderMerge() {
    const view = document.getElementById('view');
    let gs;
    try { gs = await api('/game/state'); } catch (e) { view.innerHTML = `<div class="empty-state">${t('error_generic')}</div>`; return; }

    view.innerHTML = `
      <div class="card">
        <div class="section-title">${t('tab_merge')}</div>
        <div class="merge-board" id="board"></div>
        <div class="energy-row"><img src="assets/ui/energy.png"/><span id="energyText">${gs.energy} Energy</span></div>
        <button class="btn btn-gold get-gift-btn" id="getGiftBtn">🎁 ${t('get_gift')}</button>
      </div>
    `;
    renderBoard(gs.board);
    document.getElementById('getGiftBtn').addEventListener('click', async () => {
      try {
        const res = await api('/game/new-gift', { method: 'POST' });
        renderBoard(res.board);
        document.getElementById('energyText').textContent = `${res.energy} Energy`;
      } catch (e) {
        toast(e.data && e.data.error === 'not_enough_energy' ? 'Not enough energy' : t('error_generic'), true);
      }
    });
  }

  function renderBoard(board) {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;
    boardEl.innerHTML = board.map((tier, i) => `
      <div class="merge-cell" data-index="${i}">
        ${tier ? `<div class="merge-tile" data-tier="${tier}" data-index="${i}"><img src="${itemIcon(tier)}" draggable="false"/></div>` : ''}
      </div>
    `).join('');
    bindDrag(boardEl);
  }

  function bindDrag(boardEl) {
    let dragEl = null, fromIndex = null, originalParent = null, offsetX = 0, offsetY = 0, moved = false;

    function pointFromEvent(e) {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }

    function startDrag(tile, e) {
      dragEl = tile;
      fromIndex = Number(tile.dataset.index);
      originalParent = tile.parentElement;
      moved = false;
      const rect = tile.getBoundingClientRect();
      offsetX = rect.width / 2;
      offsetY = rect.height / 2;
      const p = pointFromEvent(e);
      tile.classList.add('dragging');
      tile.style.left = `${p.x - offsetX}px`;
      tile.style.top = `${p.y - offsetY}px`;
      document.body.appendChild(tile);
    }

    function moveDrag(e) {
      if (!dragEl) return;
      moved = true;
      const p = pointFromEvent(e);
      dragEl.style.left = `${p.x - offsetX}px`;
      dragEl.style.top = `${p.y - offsetY}px`;
      boardEl.querySelectorAll('.merge-cell').forEach((c) => c.classList.remove('drop-target'));
      dragEl.style.display = 'none';
      const target = document.elementFromPoint(p.x, p.y);
      dragEl.style.display = '';
      const cell = target && target.closest('.merge-cell');
      if (cell) cell.classList.add('drop-target');
    }

    async function endDrag(e) {
      if (!dragEl) return;
      const tile = dragEl;
      tile.classList.remove('dragging');
      tile.style.left = ''; tile.style.top = '';
      const p = pointFromEvent(e);
      tile.style.display = 'none';
      const target = document.elementFromPoint(p.x, p.y);
      tile.style.display = '';
      const cell = target && target.closest('.merge-cell');
      boardEl.querySelectorAll('.merge-cell').forEach((c) => c.classList.remove('drop-target'));

      if (cell && moved && Number(cell.dataset.index) !== fromIndex) {
        const toIndex = Number(cell.dataset.index);
        try {
          const res = await api('/game/merge-cell', { method: 'POST', body: { fromIndex, toIndex } });
          state.profile.xp = res.xp;
          state.profile.level = res.level;
          renderStats();
          renderBoard(res.board);
          const energyText = document.getElementById('energyText');
          if (energyText) energyText.textContent = `${res.energy} Energy`;
          floatXp(res.xpGained, p.x, p.y - 30);
        } catch (err) {
          originalParent.appendChild(tile);
          const msg = err.data && err.data.error;
          if (msg === 'not_enough_energy') toast('Not enough energy', true);
          else if (msg && msg !== 'cannot_merge') toast(t('error_generic'), true);
        }
      } else {
        originalParent.appendChild(tile);
      }
      dragEl = null;
    }

    boardEl.querySelectorAll('.merge-tile').forEach((tile) => {
      tile.addEventListener('touchstart', (e) => { e.preventDefault(); startDrag(tile, e); }, { passive: false });
      tile.addEventListener('touchmove', (e) => { e.preventDefault(); moveDrag(e); }, { passive: false });
      tile.addEventListener('touchend', (e) => { e.preventDefault(); endDrag(e); }, { passive: false });

      // Mouse fallback (desktop testing)
      tile.addEventListener('mousedown', (e) => { startDrag(tile, e); });
    });
    document.addEventListener('mousemove', (e) => { if (dragEl) moveDrag(e); });
    document.addEventListener('mouseup', (e) => { if (dragEl) endDrag(e); });
  }

  // ---------- Tasks ----------
  async function renderTasks() {
    const view = document.getElementById('view');
    let tasks;
    try { tasks = await api('/tasks'); } catch (e) { view.innerHTML = `<div class="empty-state">${t('error_generic')}</div>`; return; }
    view.innerHTML = `
      <div class="card">
        <div class="section-title">${t('tab_tasks')}</div>
        ${tasks.length ? tasks.map((task) => `
          <div class="task-row">
            <div class="task-title">${(task.titleI18n && task.titleI18n[state.lang]) || task.key}<br/><span style="color:var(--gold);font-size:11px;">+${task.energyReward || 0} Energy${task.xpReward ? ` · +${task.xpReward} XP` : ''}</span></div>
            <button class="btn ${task.completed ? 'btn-outline' : 'btn-gold'}" style="width:auto;" data-key="${task.key}" ${task.completed ? 'disabled' : ''}>
              ${task.completed ? t('claimed') : t('claim')}
            </button>
          </div>`).join('') : `<div class="empty-state">No tasks yet.</div>`}
      </div>
    `;
    view.querySelectorAll('button[data-key]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        try {
          const result = await api('/tasks/claim', { method: 'POST', body: { key: btn.dataset.key } });
          state.profile.xp = result.xp; state.profile.level = result.level;
          renderStats();
          if (result.energyGained) toast(`+${result.energyGained} Energy`);
          renderTasks();
        } catch (e) { toast(t('error_generic'), true); }
      });
    });
  }

  // ---------- Roadmap ----------
  async function renderRoadmap() {
    const view = document.getElementById('view');
    let roadmap;
    try { roadmap = await api('/levels/roadmap'); } catch (e) { view.innerHTML = `<div class="empty-state">${t('error_generic')}</div>`; return; }
    if (!roadmap.length) {
      view.innerHTML = `<div class="card"><div class="section-title">${t('tab_roadmap')}</div><div class="empty-state">No roadmap configured yet.</div></div>`;
      return;
    }
    view.innerHTML = `
      <div class="card">
        <div class="section-title">${t('tab_roadmap')}</div>
        <div class="roadmap-track">
          ${roadmap.map((r) => {
            const status = r.claimed ? 'done' : r.unlocked ? 'claimable' : 'locked';
            const icon = r.type === 'lootbox' ? 'assets/ui/lootbox_closed.png' : r.type === 'giveaway' ? 'assets/ui/prize_coin.png' : 'assets/ui/energy.png';
            const title = (r.titleI18n && r.titleI18n[state.lang]) || (r.type === 'energy' ? `+${r.amount} Energy` : r.type === 'lootbox' ? 'Mystery Gift' : 'Giveaway');
            let actionHtml = '';
            if (status === 'locked') actionHtml = `<span style="font-size:11px;color:var(--text-dim)">🔒</span>`;
            else if (status === 'done') actionHtml = `<span style="color:var(--green);font-size:16px;">✔</span>`;
            else if (r.type === 'giveaway') actionHtml = `<button class="btn btn-gold" style="width:auto;" data-participate="${r.level}" data-raffle="${r.raffleId || ''}">${t('participate')}</button>`;
            else actionHtml = `<button class="btn btn-gold" style="width:auto;" data-claim="${r.level}">${t('claim')}</button>`;
            return `
              <div class="roadmap-item ${status === 'locked' ? 'locked' : ''} ${status === 'claimable' ? 'claimable' : ''}">
                <div class="roadmap-badge">${r.level}</div>
                <div class="roadmap-icon"><img src="${icon}"/></div>
                <div class="roadmap-info">
                  <div class="roadmap-title">${title}</div>
                  <div class="roadmap-sub">${status === 'locked' ? t('level_required', { level: r.level }) : ''}</div>
                </div>
                ${actionHtml}
              </div>`;
          }).join('')}
        </div>
      </div>
    `;
    view.querySelectorAll('button[data-claim]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await api(`/levels/${btn.dataset.claim}/claim`, { method: 'POST' });
          if (res.type === 'lootbox') showLootboxModal(res.lootedTier);
          else toast(`+${res.amount} Energy`);
          renderRoadmap();
        } catch (e) { toast(t('error_generic'), true); }
      });
    });
    view.querySelectorAll('button[data-participate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const level = btn.dataset.participate, raffleId = btn.dataset.raffle;
        try {
          await api(`/levels/${level}/claim`, { method: 'POST' }).catch(() => {});
          if (raffleId) { await api(`/raffles/${raffleId}/enter`, { method: 'POST' }); toast(t('entered')); }
          renderRoadmap();
        } catch (e) {
          toast(e.data && e.data.error === 'wallet_required' ? t('wallet_required_notice') : t('error_generic'), true);
        }
      });
    });
  }

  function showLootboxModal(lootedTier) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-box">
        <img class="lootbox-img shaking" id="lbImg" src="assets/ui/lootbox_closed.png"/>
        <img class="lootbox-reveal-item" id="lbItem" src="${itemIcon(lootedTier || 1)}"/>
        <div class="level-up-banner" id="lbLabel" style="opacity:0;">🎉 ${t('claimed')}!</div>
        <button class="btn btn-primary" id="lbClose" style="margin-top:16px;display:none;">${t('claim')}</button>
      </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => {
      const img = document.getElementById('lbImg');
      img.src = 'assets/ui/lootbox_open.png';
      img.classList.remove('shaking');
      document.getElementById('lbItem').classList.add('show');
      document.getElementById('lbLabel').style.opacity = '1';
      const closeBtn = document.getElementById('lbClose');
      closeBtn.style.display = 'inline-flex';
      closeBtn.addEventListener('click', () => modal.remove());
    }, 1300);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  // ---------- Raffles ----------
  async function renderRaffles() {
    const view = document.getElementById('view');
    let raffles;
    try { raffles = await api('/raffles'); } catch (e) { view.innerHTML = `<div class="empty-state">${t('error_generic')}</div>`; return; }
    view.innerHTML = `
      <div class="card">
        <div class="section-title">${t('tab_raffles')}</div>
        ${raffles.length ? raffles.map((r) => `
          <div class="raffle-row">
            <div>
              <div class="raffle-title">${(r.titleI18n && r.titleI18n[state.lang]) || 'Raffle'}</div>
              <div class="raffle-meta">${t('ends_in')}: ${new Date(r.endsAt).toLocaleDateString()} · ${t('level_required', { level: r.minLevel })}</div>
            </div>
            <button class="btn ${r.alreadyEntered ? 'btn-outline' : 'btn-primary'}" style="width:auto;" data-id="${r.id}" ${r.alreadyEntered || !r.eligible ? 'disabled' : ''}>
              ${r.alreadyEntered ? t('entered') : t('enter_raffle')}
            </button>
          </div>`).join('') : `<div class="empty-state">No raffles open right now.</div>`}
      </div>
    `;
    view.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (state.profile && !state.profile.walletAddress) { toast(t('wallet_required_notice'), true); return; }
        try { await api(`/raffles/${btn.dataset.id}/enter`, { method: 'POST' }); renderRaffles(); }
        catch (e) { toast(t('error_generic'), true); }
      });
    });
  }

  // ---------- Wallet (TON Connect UI — real wallet picker) ----------
  let tonConnectUI = null;
  function getTonConnectUI() {
    if (tonConnectUI) return tonConnectUI;
    if (!window.TON_CONNECT_UI) return null;
    tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({ manifestUrl: `${window.location.origin}/tonconnect-manifest.json` });
    tonConnectUI.onStatusChange(async (wallet) => {
      if (wallet && wallet.account) {
        try {
          const result = await api('/wallet/connect', { method: 'POST', body: { address: wallet.account.address } });
          state.profile.walletAddress = result.walletAddress;
          if (state.tab === 'wallet') renderWallet();
        } catch (e) { toast(t('error_generic'), true); }
      }
    });
    return tonConnectUI;
  }

  async function renderWallet() {
    const view = document.getElementById('view');
    const connected = state.profile && state.profile.walletAddress;
    view.innerHTML = `
      <div class="card">
        <div class="section-title">${t('tab_wallet')}</div>
        ${connected
          ? `<p>${t('wallet_connected')}</p><p style="font-family:monospace;font-size:12px;color:var(--text-dim);word-break:break-all;">${state.profile.walletAddress}</p><button class="btn btn-outline" id="walletBtn">${t('disconnect')}</button>`
          : `<button class="btn btn-primary" id="walletBtn">${t('connect_wallet')}</button>`}
      </div>
    `;
    document.getElementById('walletBtn').addEventListener('click', async () => {
      const ui = getTonConnectUI();
      if (!ui) { toast('TON Connect not loaded', true); return; }
      if (connected) {
        await ui.disconnect();
        await api('/wallet/disconnect', { method: 'POST' });
        state.profile.walletAddress = null;
        renderWallet();
        return;
      }
      ui.openModal();
    });
  }

  // ---------- Admin (in-app) ----------
  async function renderAdmin() {
    const view = document.getElementById('view');
    view.innerHTML = `
      <div class="card">
        <div class="admin-nav-mini" id="adminNav">
          <button data-v="dash" class="active">Dashboard</button>
          <button data-v="tasks">Tasks</button>
          <button data-v="roadmap">Roadmap</button>
          <button data-v="raffles">Raffles</button>
          <button data-v="users">Users</button>
          ${state.profile.isOwner ? '<button data-v="admins">Admins</button>' : ''}
        </div>
        <div id="adminBody"></div>
      </div>
    `;
    const body = document.getElementById('adminBody');
    const views = {
      dash: adminDash, tasks: adminTasks, roadmap: adminRoadmap, raffles: adminRaffles, users: adminUsers, admins: adminAdmins,
    };
    document.querySelectorAll('#adminNav button').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#adminNav button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        views[b.dataset.v](body);
      });
    });
    adminDash(body);

    async function adminDash(el) {
      try {
        const s = await adminApi('/summary');
        el.innerHTML = `<p>👤 Users: <b>${s.userCount}</b></p><p>✅ Active tasks: <b>${s.taskCount}</b></p><p>🎟️ Open raffles: <b>${s.openRaffles}</b></p>`;
      } catch (e) { el.innerHTML = `<div class="empty-state">${t('error_generic')}</div>`; }
    }

    async function adminTasks(el) {
      const tasks = await adminApi('/tasks');
      el.innerHTML = `
        <div class="admin-mini-form">
          <label>Key</label><input id="aKey" placeholder="join_channel"/>
          <label>Title (EN)</label><input id="aTitleEn"/>
          <label>Title (BN)</label><input id="aTitleBn"/>
          <label>Type</label><select id="aType"><option value="link">link</option><option value="daily_checkin">daily_checkin</option><option value="manual">manual</option><option value="invite">invite</option></select>
          <label>Action URL</label><input id="aUrl"/>
          <label>Energy Reward</label><input id="aEnergy" type="number" value="10"/>
          <label>XP Reward (optional)</label><input id="aXp" type="number" value="0"/>
          <button class="btn btn-primary" id="aCreate">Create Task</button>
        </div>
        <table class="admin-mini-table"><thead><tr><th>Key</th><th>Energy</th><th></th></tr></thead>
        <tbody>${tasks.map((tk) => `<tr><td>${tk.key}</td><td>${tk.energyReward}</td><td><button class="btn btn-danger" data-del="${tk._id}">Del</button></td></tr>`).join('')}</tbody></table>
      `;
      el.querySelector('#aCreate').addEventListener('click', async () => {
        try {
          await adminApi('/tasks', { method: 'POST', body: {
            key: el.querySelector('#aKey').value.trim(),
            titleI18n: { en: el.querySelector('#aTitleEn').value.trim(), bn: el.querySelector('#aTitleBn').value.trim() },
            type: el.querySelector('#aType').value,
            actionUrl: el.querySelector('#aUrl').value.trim(),
            energyReward: Number(el.querySelector('#aEnergy').value) || 0,
            xpReward: Number(el.querySelector('#aXp').value) || 0,
          }});
          adminTasks(el);
        } catch (e) { alert('Failed: ' + (e.data?.error || e.message)); }
      });
      el.querySelectorAll('button[data-del]').forEach((b) => b.addEventListener('click', async () => { await adminApi(`/tasks/${b.dataset.del}`, { method: 'DELETE' }); adminTasks(el); }));
    }

    async function adminRoadmap(el) {
      const [rewards, raffles] = [await adminApi('/level-rewards'), await adminApi('/raffles')];
      el.innerHTML = `
        <div class="admin-mini-form">
          <label>Level</label><input id="rLevel" type="number"/>
          <label>Type</label><select id="rType"><option value="energy">energy</option><option value="lootbox">lootbox</option><option value="giveaway">giveaway</option></select>
          <label>Amount</label><input id="rAmount" type="number" value="10"/>
          <label>Raffle (for giveaway)</label><select id="rRaffle"><option value="">— none —</option>${raffles.map((r) => `<option value="${r._id}">${(r.titleI18n && r.titleI18n.en) || r._id}</option>`).join('')}</select>
          <label>Title (EN)</label><input id="rTitleEn"/>
          <button class="btn btn-primary" id="rCreate">Add to Roadmap</button>
        </div>
        <table class="admin-mini-table"><thead><tr><th>Lvl</th><th>Type</th><th></th></tr></thead>
        <tbody>${rewards.map((r) => `<tr><td>${r.level}</td><td>${r.type}</td><td><button class="btn btn-danger" data-del="${r._id}">Del</button></td></tr>`).join('')}</tbody></table>
      `;
      el.querySelector('#rCreate').addEventListener('click', async () => {
        try {
          await adminApi('/level-rewards', { method: 'POST', body: {
            level: Number(el.querySelector('#rLevel').value),
            type: el.querySelector('#rType').value,
            amount: Number(el.querySelector('#rAmount').value) || 0,
            raffleId: el.querySelector('#rRaffle').value || null,
            titleI18n: { en: el.querySelector('#rTitleEn').value.trim() },
          }});
          adminRoadmap(el);
        } catch (e) { alert('Failed: ' + (e.data?.error || e.message)); }
      });
      el.querySelectorAll('button[data-del]').forEach((b) => b.addEventListener('click', async () => { await adminApi(`/level-rewards/${b.dataset.del}`, { method: 'DELETE' }); adminRoadmap(el); }));
    }

    async function adminRaffles(el) {
      const raffles = await adminApi('/raffles');
      el.innerHTML = `
        <div class="admin-mini-form">
          <label>Title (EN)</label><input id="fTitleEn"/>
          <label>Prize (EN)</label><input id="fPrize"/>
          <label>Min level</label><input id="fMinLevel" type="number" value="1"/>
          <label>Ends at</label><input id="fEndsAt" type="datetime-local"/>
          <label>Winners</label><input id="fWinners" type="number" value="1"/>
          <button class="btn btn-primary" id="fCreate">Create Raffle</button>
        </div>
        <table class="admin-mini-table"><thead><tr><th>Title</th><th>Status</th><th></th></tr></thead>
        <tbody>${raffles.map((r) => `<tr><td>${(r.titleI18n && r.titleI18n.en) || ''}</td><td>${r.status}</td><td>
          ${r.status === 'open' ? `<button class="btn btn-outline" data-close="${r._id}">Close</button>` : ''}
          ${r.status === 'closed' ? `<button class="btn btn-ok" data-draw="${r._id}">Draw</button>` : ''}
        </td></tr>`).join('')}</tbody></table>
      `;
      el.querySelector('#fCreate').addEventListener('click', async () => {
        try {
          await adminApi('/raffles', { method: 'POST', body: {
            titleI18n: { en: el.querySelector('#fTitleEn').value.trim() },
            prizeDescriptionI18n: { en: el.querySelector('#fPrize').value.trim() },
            minLevel: Number(el.querySelector('#fMinLevel').value) || 1,
            endsAt: el.querySelector('#fEndsAt').value,
            winnersCount: Number(el.querySelector('#fWinners').value) || 1,
          }});
          adminRaffles(el);
        } catch (e) { alert('Failed: ' + (e.data?.error || e.message)); }
      });
      el.querySelectorAll('button[data-close]').forEach((b) => b.addEventListener('click', async () => { await adminApi(`/raffles/${b.dataset.close}/close`, { method: 'POST' }); adminRaffles(el); }));
      el.querySelectorAll('button[data-draw]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Draw winners now?')) return;
        const res = await adminApi(`/raffles/${b.dataset.draw}/draw`, { method: 'POST' });
        alert('Winners: ' + res.winners.map((w) => w.telegramId).join(', '));
        adminRaffles(el);
      }));
    }

    async function adminUsers(el) {
      const users = await adminApi('/users');
      el.innerHTML = `<table class="admin-mini-table"><thead><tr><th>ID</th><th>Lvl</th><th>Status</th><th></th></tr></thead>
        <tbody>${users.map((u) => `<tr><td>${u.telegramId}</td><td>${u.level}</td><td>${u.banned ? '🚫' : '✅'}</td><td>
          ${u.banned ? `<button class="btn btn-ok" data-unban="${u.telegramId}">Unban</button>` : `<button class="btn btn-danger" data-ban="${u.telegramId}">Ban</button>`}
        </td></tr>`).join('')}</tbody></table>`;
      el.querySelectorAll('button[data-ban]').forEach((b) => b.addEventListener('click', async () => { await adminApi(`/users/${b.dataset.ban}/ban`, { method: 'POST', body: {} }); adminUsers(el); }));
      el.querySelectorAll('button[data-unban]').forEach((b) => b.addEventListener('click', async () => { await adminApi(`/users/${b.dataset.unban}/unban`, { method: 'POST' }); adminUsers(el); }));
    }

    async function adminAdmins(el) {
      const admins = await adminApi('/admins');
      el.innerHTML = `
        <div class="admin-mini-form">
          <label>Add admin — Telegram numeric ID</label><input id="adId" placeholder="123456789"/>
          <button class="btn btn-primary" id="adCreate">Add Admin</button>
        </div>
        <table class="admin-mini-table"><thead><tr><th>ID</th><th>Role</th><th></th></tr></thead>
        <tbody>${admins.map((a) => `<tr><td>${a.telegramId}</td><td>${a.isOwner ? '👑 Owner' : 'Admin'}</td><td>${!a.isOwner ? `<button class="btn btn-danger" data-rm="${a.telegramId}">Remove</button>` : ''}</td></tr>`).join('')}</tbody></table>
      `;
      el.querySelector('#adCreate').addEventListener('click', async () => {
        try { await adminApi('/admins', { method: 'POST', body: { telegramId: el.querySelector('#adId').value.trim() } }); adminAdmins(el); }
        catch (e) { alert('Failed: ' + (e.data?.error || e.message)); }
      });
      el.querySelectorAll('button[data-rm]').forEach((b) => b.addEventListener('click', async () => { await adminApi(`/admins/${b.dataset.rm}`, { method: 'DELETE' }); adminAdmins(el); }));
    }
  }

  const renderers = { merge: renderMerge, tasks: renderTasks, roadmap: renderRoadmap, raffles: renderRaffles, wallet: renderWallet, admin: renderAdmin };

  function switchTab(tabName) {
    state.tab = tabName;
    document.querySelectorAll('.tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
    renderers[tabName]();
  }

  document.querySelectorAll('.tab').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  async function boot() {
    if (!initData) {
      document.getElementById('view').innerHTML = `<div class="empty-state">Open this app from inside Telegram.</div>`;
      return;
    }
    try { state.profile = await api('/auth/login', { method: 'POST' }); }
    catch (e) { document.getElementById('view').innerHTML = `<div class="empty-state">${t('error_generic')}</div>`; return; }
    await loadLocale(state.profile.languageCode || 'en');
    renderStats();
    switchTab('merge');
  }

  boot();
})();
