// Presentation only: never change a user's role, grants, or a control's disabled state.
const $ = id => document.getElementById(id);
const setText = (node, value) => {
  if (node && node.textContent !== value) node.textContent = value;
};
let summaryRequest = null;
let summaryIdentity = '';

function requestSummary() {
  const cloud = window.HAMVARA_MRP_CLOUD;
  const key = `${cloud?.actor?.workspace?.id}/${cloud?.actor?.user?.id}`;
  if (!cloud?.rolePolicy || typeof cloud.request !== 'function') {
    return Promise.reject(new Error('Receipt summary unavailable.'));
  }
  if (!summaryRequest || summaryIdentity !== key) {
    summaryIdentity = key;
    const request = cloud.request('/api/mrp/receipt-console/summary', {
      signal: AbortSignal.timeout(10000)
    });
    summaryRequest = request;
    request.finally(() => {
      if (summaryRequest === request) summaryRequest = null;
    }).catch(() => {});
  }
  return summaryRequest;
}

export async function refreshReceiptSummary() {
  const value = $('rolePendingReceiptCount');
  const status = $('roleReceiptSummaryStatus');
  const button = $('roleReceiptSummaryRefresh');
  if (!value || !status || !button) return;
  button.disabled = true;
  value.setAttribute('aria-busy', 'true');
  setText(value, 'Loading…');
  setText(status, 'Checking receipts in your permitted warehouses…');
  try {
    const summary = await requestSummary();
    if (!Number.isSafeInteger(summary.pendingCount) || summary.pendingCount < 0) {
      throw new Error('Invalid summary.');
    }
    if (!value.isConnected) return;
    setText(value, String(summary.pendingCount));
    setText(status, `${summary.pendingCount} pending receipt(s), including submitted and held receipts. Updated ${new Date().toLocaleTimeString()}.`);
  } catch {
    if (!value.isConnected) return;
    setText(value, 'Unavailable');
    setText(status, 'Receipt count could not be refreshed. Open the receipt inbox or try Refresh; zero has not been assumed.');
  } finally {
    value.removeAttribute('aria-busy');
    button.disabled = false;
  }
}

export function renderReceiptSummaryControls() {
  const alerts = $('alerts');
  if (!alerts) return;
  const row = document.createElement('div');
  row.className = 'role-receipt-summary';
  const status = document.createElement('p');
  status.id = 'roleReceiptSummaryStatus';
  status.setAttribute('role', 'status');
  const link = document.createElement('a');
  link.href = 'mobile-receipts.html#computer';
  link.textContent = 'Open receipt inbox';
  const button = document.createElement('button');
  button.id = 'roleReceiptSummaryRefresh';
  button.type = 'button';
  button.textContent = 'Refresh receipt count';
  button.onclick = refreshReceiptSummary;
  row.append(status, link, button);
  alerts.append(row);
  void refreshReceiptSummary();
}

// A denied metric keeps its title, but never a value or a visible placeholder.
// Accessible state is explicit; authorization still belongs to the existing policy/server.
export function muteRoleMetric(card, label) {
  if (!card) return;
  if (!card.classList.contains('role-kpi-disabled')) card.classList.add('role-kpi-disabled');
  if (card.getAttribute('aria-disabled') !== 'true') card.setAttribute('aria-disabled', 'true');
  if (card.getAttribute('role') !== 'group') card.setAttribute('role', 'group');
  const accessibleLabel = `${label}: not available for this role`;
  if (card.getAttribute('aria-label') !== accessibleLabel) card.setAttribute('aria-label', accessibleLabel);
  const value = card.querySelector('b');
  if (value) {
    setText(value, '');
    if (!value.hidden) value.hidden = true;
  }
}

export function syncRolePresentation(role) {
  // Native disabled stays authoritative. Reflect it on the visible file label.
  for (const label of document.querySelectorAll('label.button')) {
    const input = label.querySelector('input[type="file"]');
    if (!input) continue;
    const disabled = input.matches(':disabled');
    if (label.classList.contains('role-file-disabled') !== disabled) {
      label.classList.toggle('role-file-disabled', disabled);
    }
    if (disabled) {
      if (label.getAttribute('aria-disabled') !== 'true') label.setAttribute('aria-disabled', 'true');
      if (label.title !== 'Unavailable for this role or workflow') label.title = 'Unavailable for this role or workflow';
    } else if (label.getAttribute('aria-disabled') === 'true') {
      label.removeAttribute('aria-disabled');
      if (label.title === 'Unavailable for this role or workflow') label.removeAttribute('title');
    }
  }
  if (role !== 'CEO') {
    // The server omits costs for these roles. Never present the fallback 0 as a valuation.
    const card = document.querySelector('#warehouseKpis .kpi:nth-child(4)');
    muteRoleMetric(card, 'Inventory value');
  }
}

export function installRolePresentation(role) {
  if (document.body.classList.contains('role-policy-presentation')) return;
  document.body.classList.add('role-policy-presentation');
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('./role-presentation.css', import.meta.url).href;
  document.head.append(css);

  // Keep #cloudAccount inside .top-actions: cloud.js uses that ownership to avoid duplicates.
  const actions = document.querySelector('.top-actions');
  if (actions) {
    const tools = document.createElement('div');
    tools.className = 'role-header-tools';
    tools.setAttribute('role', 'group');
    tools.setAttribute('aria-label', 'Workspace tools');
    for (const child of [...actions.children]) {
      if (child.id !== 'cloudAccount') tools.append(child);
    }
    actions.append(tools);
  }
  // Retire the redundant legacy link only for enabled role-policy workspaces.
  // The three explicit computer/mobile/USB links and unflagged workspaces are unchanged.
  for (const link of document.querySelectorAll('#receipts > p > a[href="mobile-receipts.html"]')) {
    if (!link.closest('.role-notice')) {
      const parent = link.parentElement;
      link.remove();
      if (!parent.textContent.trim() && !parent.children.length) parent.remove();
    }
  }
  const header = document.querySelector('.topbar');
  if (header) {
    const measure = () => {
      const height = `${Math.ceil(header.getBoundingClientRect().height)}px`;
      if (document.documentElement.style.getPropertyValue('--role-header-height') !== height) {
        document.documentElement.style.setProperty('--role-header-height', height);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    measure();
  }
  document.addEventListener('click', event => {
    const label = event.target.closest?.('label.role-file-disabled');
    if (label) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#nav [data-page="dashboard"]');
    if (button && !button.disabled) void refreshReceiptSummary();
  });
  syncRolePresentation(role);
}
