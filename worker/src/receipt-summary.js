// Read-only summary for the role-policy dashboard. The caller has already
// authenticated the actor, enforced the subscription and checked the feature flag.
// Both sources are read in one SQL snapshot; the inbox's 100-row display limit
// must never become a limit on dashboard counts.
export const RECEIPT_SUMMARY_SQL = `
WITH grants AS (
  SELECT warehouse FROM mrp_mobile_warehouse_grants
  WHERE workspace_id = ?1 AND user_id = ?2
), candidates AS (
  SELECT r.status, json_extract(r.payload_json, '$.destinationWarehouse') AS warehouse,
         NULL AS extra_warehouse
  FROM mrp_mobile_receipts r WHERE r.workspace_id = ?1
  UNION ALL
  SELECT COALESCE(json_extract(j.value, '$.status'), 'UNKNOWN'),
         COALESCE(NULLIF(json_extract(j.value, '$.targetWarehouse'), ''),
                  NULLIF(json_extract(j.value, '$.sourceWarehouse'), ''),
                  NULLIF(json_extract(j.value, '$.warehouse'), '')),
         NULLIF(json_extract(j.value, '$.destinationWarehouse'), '')
  FROM mrp_state s, json_each(s.state_json, '$.receipts') j
  WHERE s.workspace_id = ?1
    AND NOT EXISTS (
      SELECT 1 FROM mrp_mobile_receipts r
      WHERE r.workspace_id = s.workspace_id AND
        (r.id = json_extract(j.value, '$.mobileReceiptId') OR
         'MOB-' || r.id = json_extract(j.value, '$.id'))
    )
)
SELECT status, COUNT(*) AS count FROM candidates
WHERE status NOT IN ('POSTED', 'REJECTED')
  AND (?3 = 'CEO' OR (
    (warehouse IS NULL OR warehouse IN (SELECT warehouse FROM grants)
      OR (?3 IN ('PRODUCTION_MANAGER', 'FACTORY_MANAGER') AND warehouse = 'WH-QA'))
    AND (extra_warehouse IS NULL OR extra_warehouse IN (SELECT warehouse FROM grants)
      OR (?3 IN ('PRODUCTION_MANAGER', 'FACTORY_MANAGER') AND extra_warehouse = 'WH-QA'))
  ))
GROUP BY status ORDER BY status`;

export async function readReceiptSummary(env, actor) {
  const {workspace, user} = actor || {};
  if (!workspace?.id || !user?.id ||
      !['OPERATOR', 'PRODUCTION_MANAGER', 'FACTORY_MANAGER', 'CEO'].includes(user.role)) {
    throw Object.assign(new Error('Warehouse role required.'), {status: 403});
  }
  const result = await env.DB.prepare(RECEIPT_SUMMARY_SQL)
    .bind(workspace.id, user.id, user.role).all();
  if (!Array.isArray(result.results) || result.success === false) {
    throw Object.assign(new Error('Receipt summary unavailable.'), {status: 503});
  }
  const byStatus = Object.create(null);
  let pendingCount = 0;
  for (const row of result.results) {
    const count = Number(row.count);
    if (typeof row.status !== 'string' || !Number.isSafeInteger(count) || count < 0) {
      throw Object.assign(new Error('Receipt summary unavailable.'), {status: 503});
    }
    byStatus[row.status] = count;
    pendingCount += count;
  }
  return {pendingCount, byStatus};
}
