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
          const session = await request('/api/mrp/session');
          actor = { workspace: session.workspace, user: session.user };
          renderAccount();
          renderTrialStatus(session.trial);
          if (session.trial && !session.trial.canWrite) {
            await showTrialGate(session.trial);
            return;
          }
          const payload = await request('/api/mrp/state');
          revision = Number(payload.revision || 0);
          actor = { workspace: payload.workspace, user: payload.user };
          renderAccount();
          if (payload.state) return payload.state;
          const initial = await fetch('initial-data.json', { cache: 'no-store' }).then(response => response.json());
          await this.save(initial);
          return initial;
        } catch (error) {
          if (error.status === 401) {
            clearCredentials();
            credentials = await showLogin(error.message);
          } else {
            await showTrialGate(null, error.message);
          }
        }
      }
    },
    async save(state) {
      let payload;
      try { payload = await request('/api/mrp/state', {
        method: 'PUT',
        body: JSON.stringify({ state, expectedRevision: revision })
      }); } catch (error) {
        if (error.status === 403) {
          try {
            const status = await request('/api/mrp/trial');
            if (!status.trial.canWrite) { showTrialGate(status.trial).catch(()=>{}); }
          } catch {}
        }
        throw error;
      }
      for(const seal of payload.auditSeals||[]){const run=(state.mrpRuns||[]).find(item=>item.id===seal.runId);if(run)run.serverAuditSeal=seal}
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


  function formatTrialDate(value, timezone = 'UTC') {
    return value == null ? '—' : new Date(value).toLocaleString(undefined, {timeZone:timezone, timeZoneName:'short'});
  }
  function renderTrialStatus(trial) {
    if (!trial || trial.status === 'LEGACY') return;
    let banner = document.querySelector('#trialStatus');
    if (!banner) { banner = document.createElement('p'); banner.id='trialStatus'; banner.setAttribute('role','status'); document.body.prepend(banner); }
    banner.textContent = `Pilot: ${trial.status} · Trial ends: ${formatTrialDate(trial.endsAt,trial.timezone)} · Read/export until: ${formatTrialDate(trial.readUntil,trial.timezone)}. No automatic charge.`;
  }
  async function showTrialGate(trial, message = '') {
    let dialog = document.querySelector('#trialAccessGate');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id='trialAccessGate'; dialog.className='cloud-login';
      dialog.addEventListener('cancel',event=>event.preventDefault()); document.body.append(dialog);
    }
    dialog.replaceChildren();
    const card=document.createElement('div'); card.className='cloud-login-card'; dialog.append(card);
    const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;card.append(node);return node;};
    text('h2',trial?.status==='GRACE'?'Trial ended — view and export':'Company access');
    text('p',message || (trial?.status==='GRACE'?'New changes cannot be saved. You can view and download your saved company data during the export period.':'Your pilot has not started or its access period has ended. Contact Hamvara to arrange access.'));
    if(trial) text('p',`Status: ${trial.status} · Start: ${formatTrialDate(trial.startsAt,trial.timezone)} · End: ${formatTrialDate(trial.endsAt,trial.timezone)} · Export deadline: ${formatTrialDate(trial.readUntil,trial.timezone)}`);
    const feedback=text('p',''); feedback.setAttribute('role','status');
    const button=(label,fn)=>{const b=text('button',label);b.type='button';b.onclick=()=>{b.disabled=true;Promise.resolve().then(fn).catch(e=>{feedback.textContent=e.message;}).finally(()=>{b.disabled=false;});};return b;};
    if(trial?.canRead) {
      const view=text('pre','');view.style.cssText='max-height:45vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere';
      button('View saved data',async()=>{const result=await request('/api/mrp/state');view.textContent=JSON.stringify(result.state,null,2);});
      button('Download saved company data (JSON)',async()=>{
        const result=await request('/api/mrp/state');
        const blob=new Blob([JSON.stringify(result.state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=url;a.download='hamvara-company-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      });
    }
    const contact=text('a','Contact Hamvara');contact.href='mailto:info@hamvara.com';
    button('Refresh access',()=>location.reload());
    button('Sign out',()=>{clearCredentials();location.reload();});
    if(!dialog.open)dialog.showModal();
    // Keep the operational application paused; the gate provides explicit read/export actions.
    return new Promise(()=>{});
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
