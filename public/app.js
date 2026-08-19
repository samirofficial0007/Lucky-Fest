(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  // The raw initData string is the ONLY thing that proves who the user is.
  // It is sent on every API call in the X-Telegram-Init-Data header.
  const initData = tg ? tg.initData : '';

  const state = {
    lang: 'en',
    strings: {},
    profile: null,
    tab: 'merge',
    tasks: [],
    raffles: [],
  };

  // ---------- API helper ----------
  async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': initData,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), { data, status: res.status });
    return data;
  }

  // ---------- i18n ----------
  async function loadLocale(lang) {
    try {
      const res = await fetch(`/api/locales/${lang}`);
      state.strings = res.ok ? await res.json() : {};
    } catch (e) {
      state.strings = {};
    }
    state.lang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    applyStaticI18n();
  }

  function t(key, vars = {}) {
    let s = state.strings[key] || key;
    Object.entries(vars).forEach(([k, v]) => {
      s = s.replace(`{${k}}`, v);
    });
    return s;
  }

  function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
  }

  // ---------- toast ----------
  function toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  // ---------- header stats ----------
  function renderStats() {
    if (!state.profile) return;
    document.getElementById('levelPill').textContent = `${t('level')} ${state.profile.level}`;
    document.getElementById('xpPill').textContent = `${state.profile.xp} ${t('xp')}`;
  }

  // ---------- views ----------
  async function renderMerge() {
    const view = document.getElementById('view');
    let gameState;
    try {
      gameState = await api('/game/state');
    } catch (e) {
      view.innerHTML = `<div class="empty-state">${t('error_generic')}</div>`;
      return;
    }
    const inv = gameState.inventory || [];
    view.innerHTML = `
      <div class="card">
        <div class="section-title">${t('tab_merge')}</div>
        <div class="merge-board">
          ${inv.length
            ? inv
                .map(
                  (i) => `
            <div class="merge-tile" data-item="${i.itemKey}" data-tier="${i.tier}">
              🎁<span class="qty">×${i.qty}</span>
            </div>`
                )
                .join('')
            : `<div class="empty-state" style="grid-column: 1/-1;">${t('loading')}</div>`}
        </div>
      </div>
    `;
    view.querySelectorAll('.merge-tile').forEach((tile) => {
      tile.addEventListener('click', async () => {
        const itemKey = tile.dataset.item;
        const tier = Number(tile.dataset.tier);
        try {
          const result = await api('/game/merge', { method: 'POST', body: { itemKey, tier } });
          state.profile.xp = result.xp;
          state.profile.level = result.level;
          renderStats();
          renderMerge();
        } catch (e) {
          toast(t('error_generic'), true);
        }
      });
    });
  }

  async function renderTasks() {
    const view = document.getElementById('view');
    let tasks;
    try {
      tasks = await api('/tasks');
    } catch (e) {
      view.innerHTML = `<div class="empty-state">${t('error_generic')}</div>`;
      return;
    }
    view.innerHTML = `
      <div class="card">
        <div class="section-title">${t('tab_tasks')}</div>
        ${
          tasks.length
            ? tasks
                .map(
                  (task) => `
          <div class="task-row">
            <div class="task-title">${(task.titleI18n && task.titleI18n[state.lang]) || task.key}</div>
            <button class="btn ${task.completed ? 'btn-outline' : 'btn-gold'}" style="width:auto;"
              data-key="${task.key}" ${task.completed ? 'disabled' : ''}>
              ${task.completed ? t('claimed') : t('claim')}
            </button>
          </div>`
                )
                .join('')
            : `<div class="empty-state">${t('loading')}</div>`
        }
      </div>
    `;
    view.querySelectorAll('button[data-key]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const result = await api('/tasks/claim', { method: 'POST', body: { key: btn.dataset.key } });
          state.profile.xp = result.xp;
          state.profile.level = result.level;
          renderStats();
          renderTasks();
        } catch (e) {
          toast(t('error_generic'), true);
        }
      });
    });
  }

  async function renderRaffles() {
    const view = document.getElementById('view');
    let raffles;
    try {
      raffles = await api('/raffles');
    } catch (e) {
      view.innerHTML = `<div class="empty-state">${t('error_generic')}</div>`;
      return;
    }
    view.innerHTML = `
      <div class="card">
        <div class="section-title">${t('tab_raffles')}</div>
        ${
          raffles.length
            ? raffles
                .map(
                  (r) => `
          <div class="raffle-row">
            <div>
              <div class="raffle-title">${(r.titleI18n && r.titleI18n[state.lang]) || 'Raffle'}</div>
              <div class="raffle-meta">${t('ends_in')}: ${new Date(r.endsAt).toLocaleDateString()} · ${t('level_required', { level: r.minLevel })}</div>
            </div>
            <button class="btn ${r.alreadyEntered ? 'btn-outline' : 'btn-primary'}" style="width:auto;"
              data-id="${r.id}" ${r.alreadyEntered || !r.eligible ? 'disabled' : ''}>
              ${r.alreadyEntered ? t('entered') : t('enter_raffle')}
            </button>
          </div>`
                )
                .join('')
            : `<div class="empty-state">${t('loading')}</div>`
        }
      </div>
    `;
    view.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (state.profile && !state.profile.walletAddress) {
          toast(t('wallet_required_notice'), true);
          return;
        }
        try {
          await api(`/raffles/${btn.dataset.id}/enter`, { method: 'POST' });
          renderRaffles();
        } catch (e) {
          toast(t('error_generic'), true);
        }
      });
    });
  }

  // ---------- TON Connect wallet tab ----------
  let tonConnect = null;
  function getTonConnect() {
    if (tonConnect) return tonConnect;
    // Requires a tonconnect-manifest.json hosted at your app's public URL.
    // Replace the manifestUrl below with your real deployed URL before going live.
    const SDK = window.TON_CONNECT_SDK || window.TonConnectSDK;
    if (!SDK) return null;
    tonConnect = new SDK.TonConnect({
      manifestUrl: `${window.location.origin}/tonconnect-manifest.json`,
    });
    return tonConnect;
  }

  async function renderWallet() {
    const view = document.getElementById('view');
    const connected = state.profile && state.profile.walletAddress;
    view.innerHTML = `
      <div class="card">
        <div class="section-title">${t('tab_wallet')}</div>
        ${
          connected
            ? `<p>${t('wallet_connected')}</p>
               <p style="font-family:monospace;font-size:12px;color:var(--text-dim);word-break:break-all;">${state.profile.walletAddress}</p>
               <button class="btn btn-outline" id="walletBtn">${t('disconnect')}</button>`
            : `<button class="btn btn-primary" id="walletBtn">${t('connect_wallet')}</button>`
        }
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
      if (!connector) {
        toast('TON Connect SDK not loaded', true);
        return;
      }
      connector.onStatusChange(async (walletInfo) => {
        if (walletInfo && walletInfo.account) {
          try {
            const result = await api('/wallet/connect', {
              method: 'POST',
              body: { address: walletInfo.account.address },
            });
            state.profile.walletAddress = result.walletAddress;
            renderWallet();
          } catch (e) {
            toast(t('error_generic'), true);
          }
        }
      });
      const wallets = await connector.getWallets();
      const walletsList = await connector.connect({ universalLink: wallets[0]?.universalLink, bridgeUrl: wallets[0]?.bridgeUrl });
      if (typeof walletsList === 'string' && tg) {
        tg.openLink(walletsList);
      }
    });
  }

  const renderers = { merge: renderMerge, tasks: renderTasks, raffles: renderRaffles, wallet: renderWallet };

  function switchTab(tabName) {
    state.tab = tabName;
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    renderers[tabName]();
  }

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ---------- boot ----------
  async function boot() {
    if (!initData) {
      document.getElementById('view').innerHTML = `<div class="empty-state">Open this app from inside Telegram.</div>`;
      return;
    }
    try {
      state.profile = await api('/auth/login', { method: 'POST' });
    } catch (e) {
      document.getElementById('view').innerHTML = `<div class="empty-state">${t('error_generic')}</div>`;
      return;
    }
    await loadLocale(state.profile.languageCode || 'en');
    renderStats();
    switchTab('merge');
  }

  boot();
})();
