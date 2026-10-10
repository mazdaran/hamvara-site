const roles = ['OPERATOR', 'PRODUCTION_MANAGER', 'FACTORY_MANAGER', 'ACCOUNTING'];
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const hash = async value => {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
async function body(request) { try { return await request.json(); } catch { fail(400, 'Invalid JSON payload.'); } }

export function validateWorkspaceProfile(input) {
  if (!input || typeof input !== 'object') fail(400, 'A company profile is required.');
  const p = { country: String(input.country || '').trim().toUpperCase(), language: String(input.language || '').trim().toLowerCase(), timezone: String(input.timezone || '').trim(), currency: String(input.currency || '').trim().toUpperCase(), contactEmail: String(input.contactEmail || '').trim() };
  if (!/^[A-Z]{2}$/.test(p.country)) fail(400, 'Use a two-letter country code.');
  if (!['en', 'tr', 'fa'].includes(p.language)) fail(400, 'Select English, Turkish or Persian.');
  if (p.timezone.length > 100 || !p.timezone) fail(400, 'A valid timezone is required.');
  try { p.timezone = new Intl.DateTimeFormat('en', { timeZone: p.timezone }).resolvedOptions().timeZone; } catch { fail(400, 'A valid timezone is required.'); }
  if (!Intl.supportedValuesOf('currency').includes(p.currency)) fail(400, 'A supported ISO currency is required.');
  if (p.contactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contactEmail)) fail(400, 'A valid contact email is required.');
  return p;
}
export function insertWorkspaceProfile(DB, id, p, limit = null) {
  return DB.prepare('INSERT INTO mrp_workspace_profiles (workspace_id,country,language,timezone,currency,contact_email,member_limit) VALUES (?,?,?,?,?,?,?)').bind(id,p.country,p.language,p.timezone,p.currency,p.contactEmail,limit);
}
export async function handleWorkspaceManagement(request, env, url, actor) {
  const path = url.pathname;
  if (!['/api/mrp/company-profile','/api/mrp/members'].includes(path) && !/^\/api\/mrp\/members\/[^/]+\/disable$/.test(path)) return null;
  if (actor.user.role !== 'CEO') fail(403, 'Only the company CEO can manage company settings and users.');
  const DB = env.DB, wid = actor.workspace.id;
  const audit = (action, detail) => DB.prepare('INSERT INTO mrp_audit_log (workspace_id,user_id,action,details_json) VALUES (?,?,?,?)').bind(wid,actor.user.id,action,JSON.stringify(detail));
  if (path === '/api/mrp/company-profile' && request.method === 'GET') {
    const p = await DB.prepare('SELECT country,language,timezone,currency,contact_email,member_limit FROM mrp_workspace_profiles WHERE workspace_id=?').bind(wid).first();
    return json({ profile: p ? { country:p.country,language:p.language,timezone:p.timezone,currency:p.currency,contactEmail:p.contact_email,memberLimit:p.member_limit } : null });
  }
  if (path === '/api/mrp/company-profile' && request.method === 'PUT') {
    const p = validateWorkspaceProfile(await body(request));
    await DB.batch([
      DB.prepare(`INSERT INTO mrp_workspace_profiles (workspace_id,country,language,timezone,currency,contact_email) VALUES (?,?,?,?,?,?)
        ON CONFLICT(workspace_id) DO UPDATE SET country=excluded.country,language=excluded.language,timezone=excluded.timezone,currency=excluded.currency,contact_email=excluded.contact_email,updated_at=datetime('now')`).bind(wid,p.country,p.language,p.timezone,p.currency,p.contactEmail),
      audit('workspace.profile.updated', { fields:Object.keys(p) })
    ]);
    return json({ ok:true,profile:p });
  }
  if (path === '/api/mrp/members' && request.method === 'GET') {
    const rows = await DB.prepare('SELECT id,username,role,active,created_at FROM mrp_users WHERE workspace_id=? ORDER BY created_at,id').bind(wid).all();
    const p = await DB.prepare('SELECT member_limit FROM mrp_workspace_profiles WHERE workspace_id=?').bind(wid).first();
    return json({ members:rows.results || [],memberLimit:p?.member_limit ?? null,currentUserId:actor.user.id });
  }
  if (path === '/api/mrp/members' && request.method === 'POST') {
    const input = await body(request), username = String(input.username || '').trim().toLowerCase(), role = String(input.role || '');
    if (!/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(username)) fail(400, 'Username must contain 3–64 letters, numbers, dots, underscores or hyphens.');
    if (!roles.includes(role)) fail(400, 'Select an operational role. Additional CEO accounts require administrator review.');
    const id = crypto.randomUUID(), accessKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_');
    // A single INSERT checks the seat limit atomically, avoiding count-then-insert races.
    const results = await DB.batch([
      DB.prepare(`INSERT INTO mrp_users (id,workspace_id,username,access_key_hash,role)
        SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM mrp_users WHERE workspace_id=? AND username=?)
        AND (SELECT COUNT(*) FROM mrp_users WHERE workspace_id=? AND active=1) < COALESCE((SELECT member_limit FROM mrp_workspace_profiles WHERE workspace_id=?),2147483647)`)
        .bind(id,wid,username,await hash(accessKey),role,wid,username,wid,wid),
      DB.prepare(`INSERT INTO mrp_audit_log (workspace_id,user_id,action,details_json) SELECT ?,?,'member.created',? WHERE EXISTS (SELECT 1 FROM mrp_users WHERE id=? AND workspace_id=?)`).bind(wid,actor.user.id,JSON.stringify({id,username,role}),id,wid)
    ]);
    if (!results[0].meta?.changes) fail(409, 'Username already exists or the active-user limit has been reached.');
    return json({ member:{id,username,role},accessKey,warning:'Shown once. Deliver privately to this named user; no email has been sent.' },201);
  }
  const match = /^\/api\/mrp\/members\/([^/]+)\/disable$/.exec(path);
  if (match && request.method === 'POST') {
    const id = match[1];
    if (id === actor.user.id) fail(409, 'You cannot disable your own account.');
    const target = await DB.prepare('SELECT id,role FROM mrp_users WHERE id=? AND workspace_id=? AND active=1').bind(id,wid).first();
    if (!target) fail(404, 'Active member not found.');
    if (target.role === 'CEO') fail(409, 'CEO account changes require administrator review.');
    await DB.batch([
      DB.prepare("UPDATE mrp_users SET active=0,updated_at=datetime('now') WHERE id=? AND workspace_id=?").bind(id,wid),
      DB.prepare("UPDATE mrp_scan_sessions SET status='CLOSED',closed_at=datetime('now') WHERE terminal_user_id=? AND workspace_id=? AND status='ACTIVE'").bind(id,wid),
      audit('member.disabled',{id})
    ]);
    return json({ok:true});
  }
  fail(405,'Method not allowed.');
}
