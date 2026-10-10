const DAY = 86400000;
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
export function trialAccess(row, now = Date.now()) {
  if (!row) return {status:'LEGACY',canRead:true,canWrite:true};
  const base = {planVersion:row.plan_version,startsAt:row.starts_at,endsAt:row.ends_at,readUntil:row.read_until,serverNow:now,timezone:row.timezone || 'UTC'};
  if (row.starts_at === null) return {...base,status:'PREPARED',canRead:false,canWrite:false};
  if (![row.starts_at,row.ends_at,row.read_until].every(Number.isFinite) || row.ends_at !== row.starts_at + 30*DAY || row.read_until !== row.ends_at + 14*DAY) fail(503,'Invalid trial configuration. Contact support.');
  const status = now < row.starts_at ? 'SCHEDULED' : now < row.ends_at ? 'ACTIVE' : now < row.read_until ? 'GRACE' : 'EXPIRED';
  return {...base,status,canRead:['ACTIVE','GRACE'].includes(status),canWrite:status==='ACTIVE'};
}
export async function getTrialAccess(DB, workspaceId) {
  const row = await DB.prepare('SELECT t.plan_version,t.starts_at,t.ends_at,t.read_until,p.timezone FROM mrp_trials t LEFT JOIN mrp_workspace_profiles p ON p.workspace_id=t.workspace_id WHERE t.workspace_id=?').bind(workspaceId).first();
  return trialAccess(row);
}
export function enforceTrial(access, request, path) {
  if (access.status === 'LEGACY' || access.status === 'ACTIVE') return;
  // Session/status and credential revocation remain available after expiry.
  if (request.method === 'GET' && ['/api/mrp/session','/api/mrp/trial'].includes(path)) return;
  if (request.method === 'POST' && (/^\/api\/mrp\/members\/[^/]+\/disable$/.test(path) || /^\/api\/mrp\/scan-sessions\/[^/]+\/close$/.test(path))) return;
  // Preparing named users and regional settings must not start the trial clock.
  if (['PREPARED','SCHEDULED'].includes(access.status) && ['/api/mrp/company-profile','/api/mrp/members'].includes(path)) return;
  if (request.method === 'GET' && access.canRead) return;
  fail(403, access.status === 'GRACE' ? 'Trial ended. Your company is read-only during the 14-day export period.' : 'Trial access is not active. Contact Hamvara to agree activation or continued access.');
}
export async function activateTrial(request, env, slug) {
  let input; try { input = await request.json(); } catch { fail(400,'Invalid JSON payload.'); }
  if (input?.ready !== true || input?.customerAgreed !== true) fail(400,'Confirm workspace readiness and customer agreement.');
  const now = Date.now();
  const explicit = input.startsAt !== undefined;
  const starts = explicit && typeof input.startsAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(input.startsAt) ? Date.parse(input.startsAt) : explicit ? NaN : now;
  if (!Number.isFinite(starts) || (explicit && new Date(starts).toISOString() !== input.startsAt.replace(/(?<!\.\d{3})Z$/, '.000Z'))) fail(400,'Use an explicit UTC start timestamp, for example 2026-10-12T09:00:00Z.');
  const row = await env.DB.prepare(`SELECT t.*,w.slug FROM mrp_trials t JOIN mrp_workspaces w ON w.id=t.workspace_id WHERE w.slug=? AND w.active=1`).bind(slug).first();
  if (!row) fail(404,'Prepared pilot not found.');
  if (row.starts_at !== null) {
    if (explicit && row.starts_at !== starts) fail(409,'This trial is already scheduled or activated; its clock cannot be reset.');
    return trialAccess(row,now);
  }
  if (starts < now - 60000 || starts > now + 90*DAY) fail(400,'Start must be now or within the next 90 days; backdating is not allowed.');
  await env.DB.batch([
    env.DB.prepare(`UPDATE mrp_trials SET starts_at=?,ends_at=?,read_until=?,activated_at=? WHERE workspace_id=? AND starts_at IS NULL`).bind(starts,starts+30*DAY,starts+44*DAY,now,row.workspace_id),
    env.DB.prepare(`INSERT INTO mrp_audit_log (workspace_id,user_id,action,details_json) SELECT ?,NULL,'trial.activated',? WHERE changes()=1`).bind(row.workspace_id,JSON.stringify({startsAt:starts,endsAt:starts+30*DAY,readUntil:starts+44*DAY,ready:true,customerAgreed:true}))
  ]);
  const access = await getTrialAccess(env.DB,row.workspace_id);
  if (explicit && access.startsAt !== starts) fail(409,'Another activation set this trial start.');
  return access;
}
