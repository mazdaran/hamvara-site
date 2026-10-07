(function () {
  'use strict';
  let access = null, generation = 0, exporting = false;
  const text = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  const L = (en,tr) => document.documentElement?.lang === 'tr' ? tr : en;
  const errors = {
    test_login_required: 'Sign in on the test checkout page, then return here.',
    verified_sku_payment_required: 'Export is locked. A verified SKU Bridge payment is required.',
    invalid_export_format: 'Choose Excel (.xlsx) or CSV.',
    xlsx_number_range: 'A number is too small for Excel to preserve. Review it or choose CSV.',
    csrf_failed: 'Your session changed. Refresh access and try again.',
    rows_need_review: 'Review SKU, numeric fields, stock limits, currency and barcodes before export.',
    row_approval_required: 'Approve the READY rows before export.',
    invalid_cell: 'A cell is invalid or too long. Review the file.',
    body_too_large: 'This local test accepts requests up to 1 MiB. Export a smaller batch.',
    invalid_export_rows: 'Select between 1 and 10,000 approved rows.'
  };
  const errorsTR = {
    test_login_required:'Test ödeme sayfasında giriş yapıp buraya dönün.',
    verified_sku_payment_required:'Dışa aktarma kilitli. Doğrulanmış SKU Bridge ödemesi gerekli.',
    invalid_export_format:'Excel (.xlsx) veya CSV seçin.',
    xlsx_number_range:'Excel’in koruyamayacağı kadar küçük bir sayı var. Kontrol edin veya CSV seçin.',
    csrf_failed:'Oturum değişti. Erişimi yenileyip tekrar deneyin.',
    rows_need_review:'SKU, sayısal alanlar, stok sınırları, para birimi ve barkodları kontrol edin.',
    row_approval_required:'Dışa aktarmadan önce hazır satırları onaylayın.',
    invalid_cell:'Geçersiz veya fazla uzun hücre var. Dosyayı kontrol edin.',
    body_too_large:'Bu yerel test en fazla 1 MiB istek kabul eder. Daha küçük grup indirin.',
    invalid_export_rows:'1 ile 10.000 arasında onaylı satır seçin.'
  };
  async function request(path, options = {}) {
    return fetch('/api/sandbox/' + path, {credentials: 'same-origin', cache: 'no-store',
      signal: AbortSignal.timeout(10000), ...options});
  }
  async function refresh() {
    const version = ++generation;
    try {
      const response = await request('sku/access');
      if (!response.ok) throw Error('access_unavailable');
      const result = await response.json();
      if (version !== generation) return access;
      access = result;
      text('sku-access-status', L(result.exportAllowed
        ? `${result.username} · Paid export enabled · ${result.reason}. Local batch cap: ${result.batchRows.toLocaleString()} rows / 1 MiB.`
        : `${result.username} · Free preview: ${result.previewRows} rows · Export locked · ${result.reason}.`,
        result.exportAllowed ? `${result.username} · Dışa aktarma açık. Yerel sınır: ${result.batchRows.toLocaleString()} satır / 1 MiB.` : `${result.username} · ${result.previewRows} satırlık ücretsiz önizleme · Dışa aktarma kilitli.`));
    } catch {
      if (version !== generation) return access;
      access = null;
      text('sku-access-status', L('Free preview: 200 rows · Export locked. Sign in or reconnect the local server.','200 satırlık ücretsiz önizleme · Dışa aktarma kilitli. Giriş yapın veya yerel sunucuyu yeniden bağlayın.'));
    }
    return access;
  }
  function preview(rows) {
    const limit = access?.exportAllowed ? access.batchRows : (access?.previewRows || 200);
    text('sku-export-message', rows.length > limit
      ? `Showing ${limit.toLocaleString()} of ${rows.length.toLocaleString()} rows. ${access?.exportAllowed ? 'Split larger files into batches.' : 'After payment, refresh access and analyze again for the full batch.'}`
      : 'Review and approve rows before export.');
    return rows.slice(0, limit);
  }
  async function exportRows(rows, format = 'csv') {
    if (exporting) return false;
    exporting = true;
    try {
      if (!['csv', 'xlsx'].includes(format)) throw Error('invalid_export_format');
      const sessionResponse = await request('session');
      if (!sessionResponse.ok) throw Error('test_login_required');
      const current = await sessionResponse.json();
      const response = await request('sku/export', {method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-Sandbox-CSRF': current.csrf}, body: JSON.stringify(format === 'csv' ? {rows} : {rows, format})});
      if (!response.ok) { const body = await response.json(); throw Error(body.error || 'export_failed'); }
      const blob = await response.blob(), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `Hamvara-approved-SKU.${format}`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      await refresh();
      text('sku-export-message', L(`Downloaded ${rows.length} approved rows. Payment was verified by the local server.`,`${rows.length} onaylı satır indirildi. Ödeme yerel sunucuda doğrulandı.`));
      return true;
    } catch (error) {
      await refresh();
      text('sku-export-message', L(errors[error.message] || 'Export could not be verified. Check the local server and retry.',errorsTR[error.message] || 'Dışa aktarma doğrulanamadı. Yerel sunucuyu kontrol edip tekrar deneyin.'));
      return false;
    } finally { exporting = false; }
  }
  window.SkuSandbox = Object.freeze({refresh, preview, exportRows});
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); }, 30000);
})();
