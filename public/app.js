(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }
  const initData = tg ? tg.initData : '';

  const state = { lang: 'en', strings: {}, profile: null, tab: 'merge', gameState: null };

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

  function renderStats() {
    if (!state.profile) return;
    document.getElementById('levelPill').textContent = `${t('level')} ${state.profile.level}`;
    document.getElementById('xpPill').textContent = `${state.profile.xp} ${t('xp')}`;
  }

  function itemIcon(tier) {
    return `assets/items/gift_tier${Math.min(tier, 8)}.png`;
  }

  // ---------- Merge board (drag & drop) ----------
  async function renderMerge() {
    const view = document.getElementById('view');
    let gs;
    try { gs = await api('/game/state'); } catch (e) { view.innerHTML = `<div class="empty-state">${t('error_generic')}</div>`; return; }
    state.gameState = gs;

    view.innerHTML = `
      <div class="card">
        <div class="section-title">${t('tab_merge')}</div>
        <div class="merge-board" id="board"></div>
        <div class="energy-row"><img src="assets/ui/energy.png"/><span>${gs.energy} ${t('xp') === 'XP' ? 'Energy' : 'এনার্জি'}</span></div>
        <button class="btn btn-gold get-gift-btn" id="getGiftBtn">🎁 ${t('get_gift')}</button>
      </div>
    `;
    renderBoard(gs.board);
    document.getElementById('getGiftBtn').addEventListener('click', async () => {
      try {
        const res = await api('/game/new-gift', { method: 'POST' });
        state.gameState.board = res.board;
        state.gameState.energy = res.energy;
        renderBoard(res.board);
        const energyEl = document.querySelector('.energy-row span');
        if (energyEl) energyEl.textContent = `${res.energy} Energy`;
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
    let dragTile = null;
    let dragFromIndex = null;
    let originalParent = null;
    let offsetX = 0, offsetY = 0;

    boardEl.querySelectorAll('.merge-tile').forEach((tile) => {
      tile.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        dragTile = tile;
        dragFromIndex = Number(tile.dataset.index);
        originalParent = tile.parentElement;
        const rect = tile.getBoundingClientRect();
        offsetX = rect.width / 2;
        offsetY = rect.height / 2;

        tile.classList.add('dragging');
        tile.style.left = `${e.clientX - offsetX}px`;
        tile.style.top = `${e.clientY - offsetY}px`;
        document.body.appendChild(tile);

        tile.setPointerCapture(e.pointerId);
      });

      tile.addEventListener('pointermove', (e) => {
        if (!dragTile) return;
        dragTile.style.left = `${e.clientX - offsetX}px`;
        dragTile.style.top = `${e.clientY - offsetY}px`;

        boardEl.querySelectorAll('.merge-cell').forEach((c) => c.classList.remove('drop-target'));
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const cell = target && target.closest('.merge-cell');
        if (cell) cell.classList.add('drop-target');
      });

      tile.addEventListener('pointerup', async (e) => {
        if (!dragTile) return;
        dragTile.classList.remove('dragging');
        dragTile.style.left = '';
        dragTile.style.top = '';

        const target = document.elementFromPoint(e.clientX, e.clientY);
        const cell = target && target.closest('.merge-cell');
        boardEl.querySelectorAll('.merge-cell').forEach((c) => c.classList.remove('drop-target'));

        if (cell && Number(cell.dataset.index) !== dragFromIndex) {
          const toIndex = Number(cell.dataset.index);
          try {
            const res = await api('/game/merge-cell', { method: 'POST', body: { fromIndex: dragFromIndex, toIndex } });
            state.profile.xp = res.xp;
            state.profile.level = res.level;
            renderStats();
            renderBoard(res.board);
          } catch (err) {
            originalParent.appendChild(dragTile); // snap back
            if (err.data && err.data.error !== 'cannot_merge') toast(t('error_generic'), true);
          }
        } else {
          originalParent.appendChild(dragTile); // snap back to original cell
        }
        dragTile = null;
      });
    });
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
            <div class="task-title">${(task.titleI18n && task.titleI18n[state.lang]) || task.key}</div>
            <button class="btn ${task.completed ? 'btn-outline' : 'btn-gold'}" style="width:auto;" data-key="${task.key}" ${task.completed ? 'disabled' : ''}>
              ${task.completed ? t('claimed') : t('claim')}
            </button>
          </div>`).join('') : `<div class="empty-state">${t('loading')}</div>`}
      </div>
    `;
    view.querySelectorAll('button[data-key]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const result = await api('/tasks/claim', { method: 'POST', body: { key: btn.dataset.key } });
          state.profile.xp = result.xp; state.profile.level = result.level;
          renderStats(); renderTasks();
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
      view.innerHTML = `<div class="card"><div class="section-title">${t('tab_roadmap')}</div><div class="empty-state">No roadmap configured yet — add levels from the admin panel.</div></div>`;
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
        const level = btn.dataset.claim;
        try {
          const res = await api(`/levels/${level}/claim`, { method: 'POST' });
          if (res.type === 'lootbox') showLootboxModal(res.lootedTier);
          else toast(`+${res.amount} Energy`);
          renderRoadmap();
        } catch (e) { toast(t('error_generic'), true); }
      });
    });
    view.querySelectorAll('button[data-participate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const level = btn.dataset.participate;
        const raffleId = btn.dataset.raffle;
        try {
          await api(`/levels/${level}/claim`, { method: 'POST' }).catch(() => {}); // mark seen if not already
          if (raffleId) {
            await api(`/raffles/${raffleId}/enter`, { method: 'POST' });
            toast(t('entered'));
          }
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
      const item = document.getElementById('lbItem');
      const label = document.getElementById('lbLabel');
      const closeBtn = document.getElementById('lbClose');
      img.src = 'assets/ui/lootbox_open.png';
      img.classList.remove('shaking');
      item.classList.add('show');
      label.style.opacity = '1';
      closeBtn.style.display = 'inline-flex';
    }, 1300);
    modal.querySelector('#lbClose')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    setTimeout(() => {
      const btn = modal.querySelector('#lbClose');
      if (btn) btn.addEventListener('click', () => modal.remove());
    }, 1350);
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
          </div>`).join('') : `<div class="empty-state">${t('loading')}</div>`}
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

  // ---------- Wallet ----------
  let tonConnect = null;
  function getTonConnect() {
    if (tonConnect) return tonConnect;
    const SDK = window.TON_CONNECT_SDK || window.TonConnectSDK;
    if (!SDK) return null;
    tonConnect = new SDK.TonConnect({ manifestUrl: `${window.location.origin}/tonconnect-manifest.json` });
    return tonConnect;
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
      if (connected) {
        await api('/wallet/disconnect', { method: 'POST' });
        state.profile.walletAddress = null;
        renderWallet();
        return;
      }
      const connector = getTonConnect();
      if (!connector) { toast('TON Connect SDK not loaded', true); return; }
      connector.onStatusChange(async (walletInfo) => {
        if (walletInfo && walletInfo.account) {
          try {
            const result = await api('/wallet/connect', { method: 'POST', body: { address: walletInfo.account.address } });
            state.profile.walletAddress = result.walletAddress;
            renderWallet();
          } catch (e) { toast(t('error_generic'), true); }
        }
      });
      const wallets = await connector.getWallets();
      const walletsList = await connector.connect({ universalLink: wallets[0]?.universalLink, bridgeUrl: wallets[0]?.bridgeUrl });
      if (typeof walletsList === 'string' && tg) tg.openLink(walletsList);
    });
  }

  const renderers = { merge: renderMerge, tasks: renderTasks, roadmap: renderRoadmap, raffles: renderRaffles, wallet: renderWallet };

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
