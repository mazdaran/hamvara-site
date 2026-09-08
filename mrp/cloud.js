(function () {
  'use strict';
  const config = window.HAMVARA_MRP_CONFIG || {};
  const apiBase = String(config.apiBase || '').replace(/\/$/, '');
  const SESSION_KEY = 'hamvara.mrp.cloud.session.v1';
  let credentials = readCredentials();
  let revision = 0;
  let actor = null;

  if (!apiBase) return;

  window.HAMVARA_MRP_CLOUD = {
    enabled: true,
    request,
    async load() {
      while (true) {
        if (!credentials) credentials = await showLogin();
        try {
          const payload = await request('/api/mrp/state');
          revision = Number(payload.revision || 0);
          actor = { workspace: payload.workspace, user: payload.user };
          renderAccount();
          if (payload.state) return payload.state;
          const initial = await fetch('initial-data.json', { cache: 'no-store' }).then(response => response.json());
          await this.save(initial);
          return initial;
        } catch (error) {
          if (error.status === 401) clearCredentials();
          credentials = await showLogin(error.message);
        }
      }
    },
    async save(state) {
      const payload = await request('/api/mrp/state', {
        method: 'PUT',
        body: JSON.stringify({ state, expectedRevision: revision })
      });
      revision = Number(payload.revision);
      updateCloudBadge('Cloud saved', 'ok');
      return payload;
    }
  };

  async function request(path, options = {}) {
    const response = await fetch(apiBase + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Hamvara-Workspace': credentials?.workspace || '',
        'X-Hamvara-User': credentials?.username || '',
        'X-Hamvara-Key': credentials?.accessKey || '',
        ...(options.headers || {})
      }
    });
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(payload.error || `Cloud request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function readCredentials() {
    try {
      const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      return value?.workspace && value?.username && value?.accessKey ? value : null;
    } catch { return null; }
  }

  function clearCredentials() {
    credentials = null;
    actor = null;
    sessionStorage.removeItem(SESSION_KEY);
  }

  function showLogin(message = '') {
    return new Promise(resolve => {
      let dialog = document.querySelector('#cloudLogin');
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'cloudLogin';
        dialog.className = 'cloud-login';
        dialog.innerHTML = `
          <form method="dialog" class="cloud-login-card">
            <span class="cloud-kicker">HAMVARA MRP · SAAS</span>
            <h2>Sign in to your workspace</h2>
            <p>Company data is isolated and stored securely in the Hamvara cloud.</p>
            <label>Workspace<input name="workspace" autocomplete="organization" required placeholder="company-name"></label>
            <label>Username<input name="username" autocomplete="username" required value="owner"></label>
            <label>Access Key<input name="accessKey" type="password" autocomplete="current-password" required></label>
            <div class="cloud-login-error" role="alert"></div>
            <button class="primary" value="login">Sign in</button>
          </form>`;
        document.body.appendChild(dialog);
      }
      const form = dialog.querySelector('form');
      const errorBox = dialog.querySelector('.cloud-login-error');
      errorBox.textContent = message;
      form.onsubmit = event => {
        event.preventDefault();
        const data = new FormData(form);
        const next = {
          workspace: String(data.get('workspace') || '').trim().toLowerCase(),
          username: String(data.get('username') || '').trim().toLowerCase(),
          accessKey: String(data.get('accessKey') || '')
        };
        if (!next.workspace || !next.username || !next.accessKey) return;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
        dialog.close();
        resolve(next);
      };
      dialog.showModal();
    });
  }

  function renderAccount() {
    const actions = document.querySelector('.top-actions');
    if (!actions || actions.querySelector('#cloudAccount')) return;
    const box = document.createElement('div');
    box.id = 'cloudAccount';
    box.className = 'cloud-account';
    box.innerHTML = `<span id="cloudBadge" class="badge ok">Cloud connected</span><span>${escapeHtml(actor.workspace.name)} · ${escapeHtml(actor.user.username)} · ${escapeHtml(actor.user.role)}</span><button type="button">Sign out</button>`;
    box.querySelector('button').onclick = () => { clearCredentials(); location.reload(); };
    actions.prepend(box);
  }

  function updateCloudBadge(text, tone) {
    const badge = document.querySelector('#cloudBadge');
    if (!badge) return;
    badge.textContent = text;
    badge.className = `badge ${tone}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>\"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[character]));
  }
})();
