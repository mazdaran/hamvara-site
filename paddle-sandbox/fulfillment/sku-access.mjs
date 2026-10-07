import { HttpError } from './auth.mjs';
import { forActor } from './lifecycle.mjs';
import { COLUMNS, reviewRows, serializeCsv } from '../../sku-bridge/core.mjs';

export const FREE_PREVIEW_ROWS = 200;
// Transport/DOM safety cap for this local test, not a commercial plan allowance.
export const MAX_EXPORT_ROWS = 10000;

export function skuAccess(db, actor, now = Date.now()) {
  const records = forActor(db, actor, now).filter(e => e.product === 'sku');
  const entitlement = records.find(e => e.access) || records[0];
  return {mode: entitlement?.access ? 'paid' : 'preview', exportAllowed: Boolean(entitlement?.access),
    previewRows: FREE_PREVIEW_ROWS, batchRows: MAX_EXPORT_ROWS, reason: entitlement?.reason || 'no_verified_payment',
    accessUntil: entitlement?.accessUntil || null, username: actor.username};
}

export function exportSkuCsv(db, actor, body, now = Date.now()) {
  // Always re-project durable payment evidence at the actual export boundary.
  // Browser flags, submitted owner IDs and stale access responses are irrelevant.
  if (!skuAccess(db, actor, now).exportAllowed) throw new HttpError(403, 'verified_sku_payment_required');
  if (!body || !Array.isArray(body.rows) || !body.rows.length || body.rows.length > MAX_EXPORT_ROWS)
    throw new HttpError(400, 'invalid_export_rows');
  const rows = body.rows.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || row.approved !== true)
      throw new HttpError(422, 'row_approval_required');
    const result = {approved:true};
    for (const key of COLUMNS) {
      const value = row[key] ?? '';
      if (typeof value !== 'string' || value.length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))
        throw new HttpError(422, 'invalid_cell');
      result[key] = value.trim();
    }
    return result;
  });
  // Ignore submitted status, exclusions and parsing overrides. Export accepts canonical numbers only.
  if(reviewRows(rows,'canonical').some(row=>row.status!=='READY'))throw new HttpError(422,'rows_need_review');
  return serializeCsv(rows);
}
