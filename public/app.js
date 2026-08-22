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

  // Cosmetic-only level badge — mirrors src/utils/gameLogic.js levelBand()
  function levelBadge(level) {
    let name, tier;
    if (level <= 100) { name = 'Classic'; tier = 1; }
    else if (level <= 200) { name = 'Premium'; tier = 2; }
    else if (level <= 300) { name = 'Elite'; tier = 3; }
    else { tier = Math.floor((level - 1) / 100) + 1; name = `Tier ${tier}`; }
    return `<span class="level-badge tier-${Math.min(tier, 4)}">${name}</span>`;
  }

  function renderStats() {
    if (!state.profile) return;
    document.getElementById('levelPill').innerHTML = `${t('level')} ${state.profile.level} ${levelBadge(state.profile.level)}`;
    document.getElementById('xpPill').innerHTML = `<img src="assets/ui/xp_gem.png" class="pill-icon"/> ${state.profile.xp} ${t('xp')}`;
    document.getElementById('adminTabBtn').style.display = state.profile.isAdmin ? '' : 'none';
  }

  function itemIcon(tier) { return `assets/items/gift_tier${Math.min(tier, 12)}.png`; }

  // ---------- Merge board (ghost-based drag & drop — fixes touchcancel bug) ----------
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
        // Silent on failure (cooldown/energy hiccups from fast tapping aren't
        // worth interrupting the player with an error toast).
      }
    });
  }

  function renderBoard(board) {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;
    boardEl.innerHTML = board.map((cell, i) => {
      if (cell === -1) return `<div class="merge-cell locked-cell" data-index="${i}">🔒</div>`;
      if (!cell) return `<div class="merge-cell" data-index="${i}"></div>`;
      return `<div class="merge-cell" data-index="${i}"><div class="merge-tile" data-tier="${cell}" data-index="${i}"><img src="${itemIcon(cell)}" draggable="false"/></div></div>`;
    }).join('');
    bindDrag(boardEl);
  }

  // Drag implementation: NEVER moves the real tile node out of its cell
  // (that triggers touchcancel in Telegram's in-app browser mid-gesture,
  // which silently kills the whole interaction). Instead we hide the real
  // tile and drag a floating "ghost" clone; the real tile only actually
  // changes once the server confirms the merge and we re-render the board.
  function bindDrag(boardEl) {
    let ghost = null, sourceTile = null, fromIndex = null, offsetX = 0, offsetY = 0, moved = false;

    function pointFromEvent(e) {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }

    function startDrag(tile, e) {
      sourceTile = tile;
      fromIndex = Number(tile.dataset.index);
      moved = false;
      const rect = tile.getBoundingClientRect();
      offsetX = rect.width / 2;
      offsetY = rect.height / 2;
      const p = pointFromEvent(e);

      ghost = tile.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.style.left = `${p.x - offsetX}px`;
      ghost.style.top = `${p.y - offsetY}px`;
      document.body.appendChild(ghost);
      tile.classList.add('drag-source-hidden');
    }

    function moveDrag(e) {
      if (!ghost) return;
      moved = true;
      const p = pointFromEvent(e);
      ghost.style.left = `${p.x - offsetX}px`;
      ghost.style.top = `${p.y - offsetY}px`;
      boardEl.querySelectorAll('.merge-cell').forEach((c) => c.classList.remove('drop-target'));
      ghost.style.display = 'none';
      const target = document.elementFromPoint(p.x, p.y);
      ghost.style.display = '';
      const cell = target && target.closest('.merge-cell');
      if (cell) cell.classList.add('drop-target');
    }

    async function endDrag(e) {
      if (!ghost) return;
      const p = pointFromEvent(e);
      ghost.style.display = 'none';
      const target = document.elementFromPoint(p.x, p.y);
      const cell = target && target.closest('.merge-cell');
      boardEl.querySelectorAll('.merge-cell').forEach((c) => c.classList.remove('drop-target'));
      ghost.remove();
      ghost = null;
      if (sourceTile) sourceTile.classList.remove('drag-source-hidden');

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
          // Silent on failure — merges are free now, so a failure here is
          // just a stale-board race or a rapid double-tap, not something
          // worth showing the player an error for.
        }
      }
      sourceTile = null;
    }

    boardEl.querySelectorAll('.merge-tile').forEach((tile) => {
      tile.addEventListener('touchstart', (e) => { e.preventDefault(); startDrag(tile, e); }, { passive: false });
      tile.addEventListener('touchmove', (e) => { e.preventDefault(); moveDrag(e); }, { passive: false });
      tile.addEventListener('touchend', (e) => { e.preventDefault(); endDrag(e); }, { passive: false });
      tile.addEventListener('mousedown', (e) => { startDrag(tile, e); });
    });
    document.addEventListener('mousemove', (e) => { if (ghost) moveDrag(e); });
    document.addEventListener('mouseup', (e) => { if (ghost) endDrag(e); });
  }

  // ---------- Lucky Vault spin visual ----------
  // Reusable spin-and-reveal animation. `promise` must resolve to an object
  // containing an `energyGranted` number — the actual grant always happens
  // server-side (Level roadmap claim or task claim); this is purely the
  // presentation layer, cycling through icons for suspense before landing
  // on the real energy amount.
  const VAULT_ICONS = ['⭐', '💎', '🪙', '🖼️', '⚡'];
  function playVaultSpin(promise, onDone) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-box">
        <div class="vault-wheel spinning" id="vaultWheel">${VAULT_ICONS[0]}</div>
        <div class="level-up-banner" id="vaultLabel" style="opacity:0;"></div>
        <button class="btn btn-primary" id="vaultClose" style="margin-top:16px;display:none;">${t('claim')}</button>
      </div>
    `;
    document.body.appendChild(modal);
    const wheel = document.getElementById('vaultWheel');
    let i = 0;
    const cycle = setInterval(() => { wheel.textContent = VAULT_ICONS[i % VAULT_ICONS.length]; i++; }, 120);

    promise.then((res) => {
      setTimeout(() => {
        clearInterval(cycle);
        wheel.classList.remove('spinning');
        wheel.textContent = '⚡';
        document.getElementById('vaultLabel').style.opacity = '1';
        document.getElementById('vaultLabel').textContent = `+${res.energyGranted} Energy!`;
        const closeBtn = document.getElementById('vaultClose');
        closeBtn.style.display = 'inline-flex';
        closeBtn.addEventListener('click', () => { modal.remove(); if (onDone) onDone(res); });
      }, 1400);
    }).catch(() => {
      clearInterval(cycle);
      modal.remove();
      // Silent on failure — see the no-error-toast policy noted elsewhere.
    });

    modal.addEventListener('click', (e) => { if (e.target === modal) { clearInterval(cycle); modal.remove(); } });
  }

  // ---------- Tasks ----------
  async function renderTasks() {
    const view = document.getElementById('view');
    let tasks;
    try { tasks = await api('/tasks'); } catch (e) { view.innerHTML = `<div class="empty-state">${t('error_generic')}</div>`; return; }
    view.innerHTML = `
      <div class="card">
        <div class="section-title">${t('tab_tasks')}</div>
        ${tasks.length ? tasks.map((task) => {
          const isAd = task.type === 'watch_ad';
          const rewardLabel = isAd ? '🎰 Random Energy' : `+${task.energyReward || 0} Energy${task.xpReward ? ` · +${task.xpReward} XP` : ''}`;
          return `
          <div class="task-row">
            <div class="task-title">${(task.titleI18n && task.titleI18n[state.lang]) || task.key}<br/><span style="color:var(--gold);font-size:11px;">${rewardLabel}</span></div>
            <button class="btn ${task.completed ? 'btn-outline' : 'btn-gold'}" style="width:auto;" data-key="${task.key}" data-type="${task.type}" ${task.completed ? 'disabled' : ''}>
              ${task.completed ? t('claimed') : (isAd ? '▶️' : t('claim'))}
            </button>
          </div>`;
        }).join('') : `<div class="empty-state">No tasks yet.</div>`}
      </div>
    `;
    view.querySelectorAll('button[data-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.type === 'watch_ad') {
          playWatchAdCountdown(btn.dataset.key);
        } else {
          claimTask(btn.dataset.key);
        }
      });
    });
  }

  async function claimTask(key) {
    try {
      const result = await api('/tasks/claim', { method: 'POST', body: { key } });
      state.profile.xp = result.xp; state.profile.level = result.level;
      renderStats();
      if (result.energyGained) toast(`+${result.energyGained} Energy`);
      renderTasks();
    } catch (e) { /* silent */ }
  }

  // "Watch Ad" tasks: no real ad SDK is wired up (needs a third-party ad
  // network account — see README), so this simulates the wait with a short
  // countdown, then reveals the random energy grant via the same spin visual
  // as the Level tab's Lucky Vault.
  function playWatchAdCountdown(key) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `<div class="modal-box"><div class="watch-ad-countdown" id="adCountdown">3</div></div>`;
    document.body.appendChild(modal);
    let n = 3;
    const el = document.getElementById('adCountdown');
    const interval = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(interval);
        modal.remove();
        playVaultSpin(
          api('/tasks/claim', { method: 'POST', body: { key } }).then((res) => ({ ...res, energyGranted: res.energyGained })),
          () => renderTasks()
        );
      } else {
        el.textContent = n;
      }
    }, 700);
  }

  // ---------- Level (roadmap) ----------
  async function renderRoadmap() {
    const view = document.getElementById('view');
    let data, settings;
    try {
      data = await api('/levels/roadmap');
      settings = await api('/settings');
    } catch (e) { view.innerHTML = `<div class="empty-state">${t('error_generic')}</div>`; return; }

    const levels = data.levels || [];
    view.innerHTML = `
      <div class="card">
        <div class="section-title">${t('tab_roadmap')} <span style="font-size:11px;color:var(--text-dim);font-weight:500;">(1 – ${data.upperBound})</span></div>
        <div class="roadmap-track">
          ${levels.map((r) => {
            if (!r.hasReward) {
              // Plain level, no configured reward — compact single-line row.
              const done = r.unlocked;
              return `
                <div class="roadmap-plain-row ${done ? 'done' : 'locked'}">
                  <span class="roadmap-plain-badge">${r.level}</span>
                  <span class="roadmap-plain-status">${done ? '✔' : '🔒'}</span>
                </div>`;
            }
            const status = r.claimed ? 'done' : r.unlocked ? 'claimable' : 'locked';
            const icon = r.type === 'lootbox' ? 'assets/ui/lootbox_closed.png' : r.type === 'giveaway' ? 'assets/ui/prize_coin.png' : 'assets/ui/energy.png';
            const title = (r.titleI18n && r.titleI18n[state.lang]) || (r.type === 'energy' ? `+${r.amount} Energy` : r.type === 'lootbox' ? t('lucky_vault') : 'Giveaway');
            let actionHtml = '';
            if (status === 'locked') actionHtml = `<span style="font-size:11px;color:var(--text-dim)">🔒</span>`;
            else if (status === 'done') actionHtml = `<span style="color:var(--green);font-size:16px;">✔</span>`;
            else if (r.type === 'giveaway') actionHtml = `<button class="btn btn-gold" style="width:auto;" data-participate="${r.level}" data-raffle="${r.raffleId || ''}">${t('participate')}</button>`;
            else actionHtml = `<button class="btn btn-gold" style="width:auto;" data-claim="${r.level}">${t('claim')}</button>`;
            return `
              <div class="roadmap-item ${status === 'locked' ? 'locked' : ''} ${status === 'claimable' ? 'claimable' : ''}" data-type="${r.type}">
                <div class="roadmap-badge">${r.level}</div>
                <div class="roadmap-icon"><img src="${icon}"/></div>
                <div class="roadmap-info">
                  <div class="roadmap-title">${title}</div>
                  <div class="roadmap-sub">${status === 'locked' ? t('level_required', { level: r.level }) : (r.type === 'giveaway' ? (settings.giveawayChannelLink ? `<a href="${settings.giveawayChannelLink}" target="_blank" style="color:var(--violet)">📢 Channel</a>` : '📢 Coming Soon') : '')}</div>
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
        const rewardType = btn.closest('.roadmap-item').dataset.type;
        if (rewardType === 'lootbox') {
          playVaultSpin(
            api(`/levels/${level}/claim`, { method: 'POST' }).then((res) => ({ ...res, energyGranted: res.amount })),
            () => renderRoadmap()
          );
        } else {
          try {
            const res = await api(`/levels/${level}/claim`, { method: 'POST' });
            toast(`+${res.amount} Energy`);
            renderRoadmap();
          } catch (e) { /* silent */ }
        }
      });
    });
    view.querySelectorAll('button[data-participate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const level = btn.dataset.participate, raffleId = btn.dataset.raffle;
        try {
          await api(`/levels/${level}/claim`, { method: 'POST' }).catch(() => {});
          if (raffleId) { await api(`/raffles/${raffleId}/enter`, { method: 'POST' }); toast(t('entered')); }
          else toast(settings.giveawayChannelLink ? 'Check the channel for details!' : 'Coming soon — channel not set yet.');
          renderRoadmap();
        } catch (e) {
          toast(e.data && e.data.error === 'wallet_required' ? t('wallet_required_notice') : t('error_generic'), true);
        }
      });
    });
  }

  // ---------- Friends ----------
  async function renderFriends() {
    const view = document.getElementById('view');
    let status;
    try { status = await api('/friends/status'); } catch (e) { view.innerHTML = `<div class="empty-state">${t('error_generic')}</div>`; return; }

    const cellLabels = { 12: '#13', 13: '#14', 14: '#15', 15: '#16' };
    view.innerHTML = `
      <div class="card">
        <div class="section-title">${t('tab_friend')}</div>
        <p style="font-size:12px;color:var(--text-dim);">${t('invite_friends')}</p>
        ${status.inviteLink ? `<div class="invite-link-box">${status.inviteLink}</div><button class="btn btn-primary" id="copyLinkBtn">📋 Copy Link</button>` : `<div class="empty-state">Invite link not configured yet.</div>`}
        <p style="margin-top:14px;font-weight:700;">${t('invited_count')}: <span style="color:var(--gold);">${status.invitedCount}</span></p>
        <div style="margin-top:8px;">
          ${Object.entries(status.thresholds).map(([idx, need]) => {
            const unlocked = status.unlockedExtraCells.includes(Number(idx));
            return `<div class="friend-progress-row">
              <span>${t('locked_cell')} ${cellLabels[idx] || idx}</span>
              <span style="color:${unlocked ? 'var(--green)' : 'var(--text-dim)'}">${unlocked ? '✔ Unlocked' : `${Math.min(status.invitedCount, need)}/${need}`}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="friend-list-title">Invited by you</div>
        <div class="friend-list">
          ${status.invitedUsers && status.invitedUsers.length
            ? status.invitedUsers.map((f) => `
              <div class="friend-list-row">
                <span class="friend-avatar">${(f.displayName || '?').charAt(0).toUpperCase()}</span>
                <span class="friend-name">${f.displayName}${f.username ? ` <span class="friend-username">@${f.username}</span>` : ''}</span>
              </div>`).join('')
            : `<div class="empty-state">No one yet — share your link!</div>`}
        </div>
      </div>
    `;
    const copyBtn = document.getElementById('copyLinkBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (navigator.clipboard) navigator.clipboard.writeText(status.inviteLink).then(() => toast('Link copied!'));
        else if (tg) tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(status.inviteLink)}`);
      });
    }
  }

  // ---------- Wallet ----------
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
          <button data-v="roadmap">Level</button>
          <button data-v="raffles">Raffles</button>
          <button data-v="users">Users</button>
          <button data-v="settings">Settings</button>
          ${state.profile.isOwner ? '<button data-v="admins">Admins</button>' : ''}
        </div>
        <div id="adminBody"></div>
      </div>
    `;
    const body = document.getElementById('adminBody');
    const views = { dash: adminDash, tasks: adminTasks, roadmap: adminRoadmap, raffles: adminRaffles, users: adminUsers, settings: adminSettings, admins: adminAdmins };
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
          <label>Type</label><select id="aType"><option value="link">link</option><option value="daily_checkin">daily_checkin</option><option value="manual">manual</option><option value="invite">invite</option><option value="watch_ad">watch_ad (random energy)</option></select>
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

    async function adminSettings(el) {
      const s = await adminApi('/settings');
      el.innerHTML = `
        <div class="admin-mini-form">
          <label>Giveaway Announcement Channel Link</label>
          <input id="sChannel" value="${s.giveawayChannelLink || ''}" placeholder="https://t.me/yourchannel"/>
          <button class="btn btn-primary" id="sSave">Save</button>
        </div>
        <p style="font-size:11px;color:var(--text-dim);">Leave empty to show "Coming Soon" in the app instead of a link.</p>
      `;
      el.querySelector('#sSave').addEventListener('click', async () => {
        await adminApi('/settings', { method: 'PUT', body: { giveawayChannelLink: el.querySelector('#sChannel').value.trim() } });
        toast('Saved');
      });
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

  const renderers = { merge: renderMerge, tasks: renderTasks, roadmap: renderRoadmap, friends: renderFriends, wallet: renderWallet, admin: renderAdmin };

  function switchTab(tabName) {
    state.tab = tabName;
    document.querySelectorAll('.tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
    const renderPromise = renderers[tabName]();
    if (tabName === 'roadmap' && renderPromise && renderPromise.then) {
      renderPromise.then(() => maybeShowTutorialStep2());
    }
  }

  document.querySelectorAll('.tab').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  // ---------- First-run tutorial (2 steps: "tap Level" -> "tap Claim") ----------
  function clearTutorialOverlay() {
    const overlay = document.getElementById('tutorialOverlay');
    overlay.style.display = 'none';
    overlay.innerHTML = '';
    if (overlay._bubbleEl) { overlay._bubbleEl.remove(); overlay._bubbleEl = null; }
  }

  function highlightElement(el, bubbleText) {
    clearTutorialOverlay();
    const overlay = document.getElementById('tutorialOverlay');
    overlay.style.display = 'block';
    const rect = el.getBoundingClientRect();
    const ring = document.createElement('div');
    ring.className = 'tutorial-highlight-ring';
    ring.style.left = `${rect.left - 6}px`;
    ring.style.top = `${rect.top - 6}px`;
    ring.style.width = `${rect.width + 12}px`;
    ring.style.height = `${rect.height + 12}px`;
    overlay.appendChild(ring);

    const bubble = document.createElement('div');
    bubble.className = 'tutorial-bubble';
    bubble.textContent = bubbleText;
    document.body.appendChild(bubble); // outside overlay (overlay is pointer-events:none)
    const bubbleTop = rect.top - 60;
    bubble.style.left = `${Math.max(10, Math.min(window.innerWidth - 230, rect.left - 60))}px`;
    bubble.style.top = `${bubbleTop < 10 ? rect.bottom + 12 : bubbleTop}px`;
    overlay._bubbleEl = bubble;
  }

  function maybeShowTutorialStep1() {
    if (!state.profile || state.profile.tutorialCompleted) return;
    highlightElement(document.getElementById('levelTabBtn'), '👉 Tap "Level" to see your rewards!');
  }

  function maybeShowTutorialStep2() {
    if (!state.profile || state.profile.tutorialCompleted) return;
    setTimeout(() => {
      const claimBtn = document.querySelector('#view button[data-claim]');
      if (claimBtn) {
        highlightElement(claimBtn, '👉 Tap "Claim" to get your first reward!');
        claimBtn.addEventListener('click', finishTutorial, { once: true });
      } else {
        clearTutorialOverlay();
      }
    }, 50);
  }

  async function finishTutorial() {
    clearTutorialOverlay();
    if (state.profile) state.profile.tutorialCompleted = true;
    try { await api('/auth/complete-tutorial', { method: 'POST' }); } catch (e) { /* non-critical */ }
  }

  async function boot() {
    const splash = document.getElementById('splash');
    const splashFill = document.getElementById('splashFill');
    requestAnimationFrame(() => { splashFill.style.width = '100%'; });
    const minSplashTime = new Promise((resolve) => setTimeout(resolve, 3000));

    if (!initData) {
      await minSplashTime;
      splash.classList.add('hide');
      document.getElementById('view').innerHTML = `<div class="empty-state">Open this app from inside Telegram.</div>`;
      return;
    }

    let loginError = null;
    try {
      state.profile = await api('/auth/login', { method: 'POST' });
      await loadLocale(state.profile.languageCode || 'en');
    } catch (e) { loginError = e; }

    await minSplashTime; // always show the splash for at least ~3s; loading happens behind it
    splash.classList.add('hide');

    if (loginError) {
      document.getElementById('view').innerHTML = `<div class="empty-state">${t('error_generic')}</div>`;
      return;
    }

    renderStats();
    switchTab('merge');

    if (!state.profile.tutorialCompleted) {
      setTimeout(maybeShowTutorialStep1, 400);
    }
  }

  boot();
})();
