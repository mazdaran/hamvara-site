(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const base = String(window.HAMVARA_TARIFF_CONFIG?.apiBase || '').replace(/\/$/, '');
  let nextAfter = null;
  let decisionId = null;
  let activeRunId = null;
  let syncing = false;
  let readinessData = null;
  let productionData = null;

  function auth(token) {
    return { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }

  async function call(path, options = {}) {
    if (!base) throw Error('API endpoint is not configured.');
    const response = await fetch(base + path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || `Request failed (${response.status})`);
    $('output').textContent = JSON.stringify(data, null, 2);
    return data;
  }

  async function run(fn) {
    try {
      $('connection').textContent = 'Working…';
      const result = await fn();
      $('connection').textContent = 'Completed.';
      return result;
    } catch (error) {
      $('connection').textContent = error.message;
      $('output').textContent = `ERROR\n${error.message}`;
      throw error;
    }
  }

  function showProgress(data) {
    const current = Number(data.progressCurrent ?? data.sync?.progress_current ?? 0);
    const total = Number(data.progressTotal ?? data.sync?.progress_total ?? 97);
    $('progress').hidden = false;
    $('progress').max = total;
    $('progress').value = current;
    $('connection').textContent = `${data.status || data.sync?.status || 'RUNNING'} · chapter ${current} of ${total}`;
  }

  async function continueSync(runId) {
    if (syncing) return;
    syncing = true;
    activeRunId = runId;
    $('sync').disabled = true;
    $('resume').disabled = true;
    try {
      for (;;) {
        const data = await call(`/api/tariff/admin/sync-runs/${encodeURIComponent(runId)}/step`, {
          method: 'POST', headers: syncHeaders(), body: '{}'
        });
        showProgress(data);
        if (data.status === 'STAGED') {
          await loadRuns();
          $('runId').value = runId;
          await loadChanges();
          return data;
        }
        if (data.busy) await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } finally {
      syncing = false;
      $('sync').disabled = false;
      $('resume').disabled = false;
    }
  }

  function reviewHeaders() {
    const token = $('reviewToken').value.trim();
    if (!token) throw Error('Reviewer credential is required.');
    return auth(token);
  }

  function syncHeaders() {
    const token = $('syncToken').value.trim();
    if (!token) throw Error('Sync credential is required.');
    return auth(token);
  }

  function publisherHeaders() {
    const token = $('publisherToken').value.trim();
    if (!token) throw Error('Publisher credential is required.');
    return auth(token);
  }

  function selectedRun() {
    const id = $('runId').value.trim();
    if (!id) throw Error('Select a staged candidate run.');
    return id;
  }

  function requiredPublisherReason() {
    const reason = $('publicationReason').value.trim();
    if (!reason) throw Error('A publisher reason is required.');
    return reason;
  }

  function formatUnits(value) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed.join(', ') : String(parsed || '');
    } catch {
      return String(value || '');
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function valueCard(value) {
    if (!value) return '<span class="muted">—</span>';
    const fields = [
      ['Description', value.description], ['General', value.general_rate_raw],
      ['Special', value.special_rate_raw], ['Units', formatUnits(value.units_json)]
    ];
    return fields.filter(([, item]) => item).map(([key, item]) =>
      `<span><b>${escapeHtml(key)}</b>${escapeHtml(item)}</span>`
    ).join('') || '<span class="muted">—</span>';
  }

  function renderChanges(changes, append = false) {
    const body = $('candidateRows');
    if (!append) body.innerHTML = '';
    for (const item of changes) {
      const row = document.createElement('tr');
      row.innerHTML = `<td><code>${escapeHtml(item.hts10)}</code></td><td><span class="tag ${item.change_type.toLowerCase()}">${escapeHtml(item.change_type)}</span></td><td class="value">${valueCard(item.oldValue)}</td><td class="value">${valueCard(item.newValue)}</td><td><span class="tag">${escapeHtml(item.disposition)}</span><small>${item.acknowledged_at ? 'Acknowledged' : 'Not acknowledged'}</small>${item.disposition_reason ? `<small>${escapeHtml(item.disposition_reason)}</small>` : ''}</td><td><button data-action="ack" data-id="${item.id}" ${item.acknowledged_at ? 'disabled' : ''}>Acknowledge</button><button class="secondary" data-action="decide" data-id="${item.id}" data-hts="${escapeHtml(item.hts10)}">Disposition</button></td>`;
      body.appendChild(row);
    }
    if (!body.children.length) body.innerHTML = '<tr><td colspan="6" class="empty">No candidates match the selected filters.</td></tr>';
  }

  async function loadRuns() {
    const data = await call('/api/tariff/admin/sync-runs?status=STAGED&limit=50', { headers: reviewHeaders() });
    const select = $('runId');
    const current = select.value;
    select.innerHTML = '<option value="">Select a run</option>' + data.runs.map(runItem =>
      `<option value="${escapeHtml(runItem.id)}">${escapeHtml(runItem.started_at)} · ${runItem.rows_added}/${runItem.rows_changed}/${runItem.rows_removed}</option>`
    ).join('');
    if ([...select.options].some(option => option.value === current)) select.value = current;
    return data;
  }

  async function loadChanges(append = false) {
    const runId = selectedRun();
    const params = new URLSearchParams({ limit: '100' });
    if ($('type').value) params.set('type', $('type').value);
    if ($('disposition').value) params.set('disposition', $('disposition').value);
    if (append && nextAfter) params.set('after', nextAfter);
    const data = await call(`/api/tariff/admin/sync-runs/${encodeURIComponent(runId)}/changes?${params}`, { headers: reviewHeaders() });
    renderChanges(data.changes, append);
    nextAfter = data.nextAfter;
    $('more').hidden = !nextAfter;
    return data;
  }

  function renderReadiness(data) {
    const labels = {
      RUN_NOT_STAGED: 'Run is not staged.',
      SNAPSHOT_EVIDENCE_INVALID: 'R2 manifest evidence is missing or invalid.',
      BASELINE_REQUIRES_ZERO_DELTA: 'The first production baseline must be a zero-delta verified snapshot.',
      NO_APPLICABLE_CHANGES: 'No accepted or no-impact changes are available.',
      PENDING_DISPOSITIONS: 'Some candidates still need a disposition.',
      UNACKNOWLEDGED_CHANGES: 'Some candidates have not been acknowledged.',
      DECISION_EVIDENCE_MISSING: 'A recorded disposition is missing audit evidence.',
      PUBLISHER_REVIEWER_SEPARATION_REQUIRED: 'Publisher must be independent from the reviewer.',
      PRODUCTION_HEAD_CHANGED: 'Production changed after this run started; collect a fresh candidate.',
      PRODUCTION_LOCKED: 'The server-side production lock is closed.'
    };
    const blockers = (data.blockers || []).map(code => labels[code] || code);
    if (data.readyForPromotion) {
      $('readinessState').textContent = `Ready (${data.applyMode}). Type exactly: ${data.confirmationText}`;
    } else if (data.reviewReady) {
      $('readinessState').textContent = `Review gate passed (${data.applyMode}), but the server-side production lock is closed.`;
    } else {
      $('readinessState').textContent = `Not ready: ${blockers.join(' ')}`;
    }
    $('promotionConfirmation').placeholder = data.confirmationText || 'Use the exact confirmation phrase';
    $('promote').disabled = !data.readyForPromotion;
  }

  async function checkReadiness() {
    const runId = selectedRun();
    readinessData = await call(`/api/tariff/admin/sync-runs/${encodeURIComponent(runId)}/promotion-readiness`, { headers: publisherHeaders() });
    renderReadiness(readinessData);
    return readinessData;
  }

  async function promoteSelectedRun() {
    const runId = selectedRun();
    if (!readinessData || readinessData.runId !== runId || !readinessData.readyForPromotion) {
      throw Error('Run a successful publication readiness check first.');
    }
    const confirmation = $('promotionConfirmation').value.trim();
    if (confirmation !== readinessData.confirmationText) {
      throw Error(`Type exactly "${readinessData.confirmationText}" to confirm promotion.`);
    }
    const result = await call(`/api/tariff/admin/sync-runs/${encodeURIComponent(runId)}/promote`, {
      method: 'POST', headers: publisherHeaders(),
      body: JSON.stringify({ reason: requiredPublisherReason(), confirmation })
    });
    readinessData = null;
    $('promote').disabled = true;
    $('promotionConfirmation').value = '';
    await loadRuns();
    await loadProductionState();
    return result;
  }

  async function loadProductionState() {
    productionData = await call('/api/tariff/admin/production-state', { headers: publisherHeaders() });
    if (!productionData.active || !productionData.head) {
      $('productionState').textContent = 'No production baseline is active.';
      $('rollback').disabled = true;
      $('rollbackConfirmation').placeholder = 'No active batch';
      return productionData;
    }
    $('productionState').textContent = `Head ${productionData.head.id} · ${productionData.head.mode} · ${productionData.head.applied_count} applied`;
    $('rollbackConfirmation').placeholder = productionData.rollbackConfirmationText;
    $('rollback').disabled = !productionData.productionEnabled;
    return productionData;
  }

  async function rollbackProductionHead() {
    if (!productionData?.active || !productionData.head) throw Error('Load the current production head first.');
    const expected = productionData.rollbackConfirmationText;
    const confirmation = $('rollbackConfirmation').value.trim();
    if (confirmation !== expected) throw Error(`Type exactly "${expected}" to confirm rollback.`);
    const result = await call(`/api/tariff/admin/promotions/${encodeURIComponent(productionData.head.id)}/rollback`, {
      method: 'POST', headers: publisherHeaders(),
      body: JSON.stringify({ reason: requiredPublisherReason(), confirmation })
    });
    $('rollbackConfirmation').value = '';
    await loadProductionState();
    await loadRuns();
    return result;
  }

  $('status').onclick = () => run(async () => {
    const data = await call('/api/tariff/status', { headers: { Accept: 'application/json' } });
    if (data.sync) { activeRunId = data.sync.id; showProgress(data); }
    return data;
  }).catch(() => {});
  $('sync').onclick = () => run(async () => {
    const data = await call('/api/tariff/admin/sync', { method: 'POST', headers: syncHeaders(), body: '{}' });
    showProgress(data);
    return continueSync(data.runId);
  }).catch(() => {});
  $('resume').onclick = () => run(async () => {
    if (!activeRunId) {
      const status = await call('/api/tariff/status', { headers: { Accept: 'application/json' } });
      activeRunId = status.sync?.id;
    }
    if (!activeRunId) throw Error('No interrupted run is available.');
    return continueSync(activeRunId);
  }).catch(() => {});
  $('runs').onclick = () => run(loadRuns).catch(() => {});
  $('changes').onclick = () => run(() => loadChanges(false)).catch(() => {});
  $('readiness').onclick = () => run(checkReadiness).catch(() => {});
  $('promote').onclick = () => run(promoteSelectedRun).catch(() => {});
  $('production').onclick = () => run(loadProductionState).catch(() => {});
  $('rollback').onclick = () => run(rollbackProductionHead).catch(() => {});
  $('more').onclick = () => run(() => loadChanges(true)).catch(() => {});

  $('runId').onchange = () => {
    readinessData = null;
    $('promote').disabled = true;
    $('promotionConfirmation').value = '';
    $('readinessState').textContent = 'Check readiness before attempting a controlled promotion.';
  };
  $('type').onchange = $('disposition').onchange = () => {
    if ($('runId').value) run(() => loadChanges(false)).catch(() => {});
  };

  $('candidateRows').onclick = event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    if (button.dataset.action === 'ack') {
      run(async () => {
        await call(`/api/tariff/admin/changes/${id}/acknowledge`, { method: 'POST', headers: reviewHeaders(), body: '{}' });
        await loadChanges(false);
      }).catch(() => {});
      return;
    }
    decisionId = id;
    $('decisionTarget').textContent = `HTS ${button.dataset.hts} · candidate ${id}`;
    $('reason').value = '';
    $('decisionDialog').showModal();
  };

  $('saveDecision').onclick = event => {
    event.preventDefault();
    const reason = $('reason').value.trim();
    if (!reason) { $('reason').reportValidity(); return; }
    run(async () => {
      await call(`/api/tariff/admin/changes/${decisionId}/disposition`, {
        method: 'POST', headers: reviewHeaders(),
        body: JSON.stringify({ disposition: $('decision').value, reason })
      });
      $('decisionDialog').close();
      await loadChanges(false);
    }).catch(() => {});
  };
})();
