(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }
  const initData = tg ? tg.initData : '';

  async function api(path, options = {}) {
    const res = await fetch(`/api/admin${path}`, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), { data, status: res.status });
    return data;
  }

  const viewEl = document.getElementById('admin-view');

  function showError(msg) {
    viewEl.innerHTML = `<div class="error-box">⚠️ ${msg}</div>`;
  }

  // ---------- Dashboard ----------
  async function renderSummary() {
    try {
      const s = await api('/summary');
      viewEl.innerHTML = `
        <div class="grid">
          <div class="stat-card"><div class="num">${s.userCount}</div><div class="label">Total Users</div></div>
          <div class="stat-card"><div class="num">${s.taskCount}</div><div class="label">Active Tasks</div></div>
          <div class="stat-card"><div class="num">${s.openRaffles}</div><div class="label">Open Raffles</div></div>
        </div>
      `;
    } catch (e) {
      showError(e.data && e.data.error === 'admin_only'
        ? 'Your Telegram account is not in ADMIN_IDS. Add your numeric ID to the ADMIN_IDS env var on Render.'
        : 'Failed to load dashboard.');
    }
  }

  // ---------- Tasks ----------
  async function renderTasks() {
    let tasks = [];
    try { tasks = await api('/tasks'); } catch (e) { return showError('Failed to load tasks.'); }
    viewEl.innerHTML = `
      <div class="panel">
        <h3>New Task</h3>
        <div class="form-row"><label>Key (unique, no spaces)</label><input id="tKey" placeholder="join_channel"/></div>
        <div class="form-row"><label>Title (English)</label><input id="tTitleEn" placeholder="Join our channel"/></div>
        <div class="form-row"><label>Title (Bangla)</label><input id="tTitleBn" placeholder="আমাদের চ্যানেলে যোগ দাও"/></div>
        <div class="form-row"><label>Type</label>
          <select id="tType"><option value="link">link</option><option value="daily_checkin">daily_checkin</option><option value="manual">manual</option><option value="invite">invite</option></select>
        </div>
        <div class="form-row"><label>Action URL</label><input id="tUrl" placeholder="https://t.me/yourchannel"/></div>
        <div class="form-row"><label>XP Reward</label><input id="tXp" type="number" value="10"/></div>
        <button class="btn btn-primary" id="createTaskBtn">Create Task</button>
      </div>
      <table>
        <thead><tr><th>Key</th><th>Title (EN)</th><th>XP</th><th>Type</th><th></th></tr></thead>
        <tbody>
          ${tasks.map((t) => `
            <tr>
              <td>${t.key}</td>
              <td>${(t.titleI18n && t.titleI18n.en) || ''}</td>
              <td>${t.xpReward}</td>
              <td>${t.type}</td>
              <td><button class="btn btn-danger" data-del="${t._id}">${t.active ? 'Deactivate' : 'Inactive'}</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
    document.getElementById('createTaskBtn').addEventListener('click', async () => {
      try {
        await api('/tasks', {
          method: 'POST',
          body: {
            key: document.getElementById('tKey').value.trim(),
            titleI18n: {
              en: document.getElementById('tTitleEn').value.trim(),
              bn: document.getElementById('tTitleBn').value.trim(),
            },
            type: document.getElementById('tType').value,
            actionUrl: document.getElementById('tUrl').value.trim(),
            xpReward: Number(document.getElementById('tXp').value) || 10,
          },
        });
        renderTasks();
      } catch (e) { alert('Failed: ' + (e.data?.error || e.message)); }
    });
    viewEl.querySelectorAll('button[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api(`/tasks/${btn.dataset.del}`, { method: 'DELETE' });
        renderTasks();
      });
    });
  }

  // ---------- Raffles ----------
  async function renderRaffles() {
    let raffles = [];
    try { raffles = await api('/raffles'); } catch (e) { return showError('Failed to load raffles.'); }
    viewEl.innerHTML = `
      <div class="panel">
        <h3>New Raffle</h3>
        <div class="form-row"><label>Title (English)</label><input id="rTitleEn" placeholder="Weekly Draw"/></div>
        <div class="form-row"><label>Title (Bangla)</label><input id="rTitleBn" placeholder="সাপ্তাহিক ড্র"/></div>
        <div class="form-row"><label>Prize description (English)</label><input id="rPrizeEn" placeholder="1000 Telegram Stars"/></div>
        <div class="form-row"><label>Minimum level</label><input id="rMinLevel" type="number" value="1"/></div>
        <div class="form-row"><label>Ends at</label><input id="rEndsAt" type="datetime-local"/></div>
        <div class="form-row"><label>Number of winners</label><input id="rWinners" type="number" value="1"/></div>
        <button class="btn btn-primary" id="createRaffleBtn">Create Raffle</button>
      </div>
      <table>
        <thead><tr><th>Title</th><th>Status</th><th>Entries</th><th>Ends</th><th></th></tr></thead>
        <tbody>
          ${raffles.map((r) => `
            <tr>
              <td>${(r.titleI18n && r.titleI18n.en) || ''}</td>
              <td>${r.status}</td>
              <td>${(r.entries || []).length}</td>
              <td>${new Date(r.endsAt).toLocaleString()}</td>
              <td>
                ${r.status === 'open' ? `<button class="btn btn-outline" data-close="${r._id}">Close</button>` : ''}
                ${r.status === 'closed' ? `<button class="btn btn-ok" data-draw="${r._id}">Draw Winners</button>` : ''}
                ${r.status === 'drawn' ? `<span style="color:var(--ok)">✔ Drawn</span>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
    document.getElementById('createRaffleBtn').addEventListener('click', async () => {
      try {
        await api('/raffles', {
          method: 'POST',
          body: {
            titleI18n: { en: document.getElementById('rTitleEn').value.trim(), bn: document.getElementById('rTitleBn').value.trim() },
            prizeDescriptionI18n: { en: document.getElementById('rPrizeEn').value.trim() },
            minLevel: Number(document.getElementById('rMinLevel').value) || 1,
            endsAt: document.getElementById('rEndsAt').value,
            winnersCount: Number(document.getElementById('rWinners').value) || 1,
          },
        });
        renderRaffles();
      } catch (e) { alert('Failed: ' + (e.data?.error || e.message)); }
    });
    viewEl.querySelectorAll('button[data-close]').forEach((btn) => {
      btn.addEventListener('click', async () => { await api(`/raffles/${btn.dataset.close}/close`, { method: 'POST' }); renderRaffles(); });
    });
    viewEl.querySelectorAll('button[data-draw]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Draw winners now? This cannot be undone.')) return;
        const res = await api(`/raffles/${btn.dataset.draw}/draw`, { method: 'POST' });
        alert('Winners: ' + res.winners.map((w) => w.telegramId).join(', '));
        renderRaffles();
      });
    });
  }

  // ---------- Users ----------
  async function renderUsers() {
    let users = [];
    try { users = await api('/users'); } catch (e) { return showError('Failed to load users.'); }
    viewEl.innerHTML = `
      <div class="form-row" style="max-width:300px;"><input id="userSearch" placeholder="Search by ID or username"/></div>
      <table>
        <thead><tr><th>Telegram ID</th><th>Username</th><th>Level</th><th>Wallet</th><th>Status</th><th></th></tr></thead>
        <tbody id="userRows">
          ${users.map(userRowHtml).join('')}
        </tbody>
      </table>
    `;
    bindUserRowEvents();
    document.getElementById('userSearch').addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const found = await api(`/users?search=${encodeURIComponent(e.target.value)}`);
      document.getElementById('userRows').innerHTML = found.map(userRowHtml).join('');
      bindUserRowEvents();
    });
  }

  function userRowHtml(u) {
    return `
      <tr>
        <td>${u.telegramId}</td>
        <td>${u.username || '-'}</td>
        <td>${u.level}</td>
        <td>${u.walletAddress ? u.walletAddress.slice(0, 8) + '…' : '-'}</td>
        <td>${u.banned ? '🚫 Banned' : '✅ Active'}</td>
        <td>
          ${u.banned
            ? `<button class="btn btn-ok" data-unban="${u.telegramId}">Unban</button>`
            : `<button class="btn btn-danger" data-ban="${u.telegramId}">Ban</button>`}
        </td>
      </tr>`;
  }

  function bindUserRowEvents() {
    document.querySelectorAll('button[data-ban]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const reason = prompt('Ban reason (optional):') || '';
        await api(`/users/${btn.dataset.ban}/ban`, { method: 'POST', body: { reason } });
        renderUsers();
      });
    });
    document.querySelectorAll('button[data-unban]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api(`/users/${btn.dataset.unban}/unban`, { method: 'POST' });
        renderUsers();
      });
    });
  }

  const views = { summary: renderSummary, tasks: renderTasks, raffles: renderRaffles, users: renderUsers };

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      views[btn.dataset.view]();
    });
  });

  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    document.getElementById('adminIdBadge').textContent = `ID: ${tg.initDataUnsafe.user.id}`;
  }

  if (!initData) {
    showError('Open this admin panel from inside Telegram (via the bot), not a plain browser tab — Telegram identity is required to authenticate.');
  } else {
    renderSummary();
  }
})();
