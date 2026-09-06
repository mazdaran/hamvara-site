const MAX_STATE_BYTES = 5 * 1024 * 1024;

export async function handleMrpRequest(request, env, url) {
  if (!env.DB) throw httpError(503, 'MRP database is not configured.');

  if (url.pathname === '/api/mrp/workspaces' && request.method === 'POST') {
    return provisionWorkspace(request, env);
  }

  if (url.pathname === '/api/mrp/rotate-key' && request.method === 'POST') {
    return rotateWorkspaceAccessKey(request, env);
  }

  const rotateMatch = /^\/api\/mrp\/workspaces\/([a-z0-9-]+)\/rotate-key\/?$/.exec(url.pathname);
  if (rotateMatch && request.method === 'POST') {
    return rotateWorkspaceAccessKey(request, env, rotateMatch[1]);
  }

  const actor = await authenticate(request, env);
  if (url.pathname === '/api/mrp/session' && request.method === 'GET') {
    return json({ ok: true, workspace: actor.workspace, user: actor.user });
  }
  if (url.pathname === '/api/mrp/state' && request.method === 'GET') {
    return loadState(env, actor);
  }
  if (url.pathname === '/api/mrp/state' && request.method === 'PUT') {
    return saveState(request, env, actor);
  }
  throw httpError(404, 'MRP endpoint not found.');
}

async function provisionWorkspace(request, env) {
  requireAdministrator(request, env);

  const body = await request.json();
  const slug = normalizeSlug(body.workspace);
  const name = clean(body.name, 120);
  const username = normalizeUsername(body.username || 'owner');
  const role = normalizeRole(body.role || 'CEO');
  if (!slug || !name || !username) throw httpError(400, 'Workspace, company name and username are required.');

  const existing = await env.DB.prepare('SELECT id FROM mrp_workspaces WHERE slug = ?').bind(slug).first();
  if (existing) throw httpError(409, 'Workspace already exists.');

  const workspaceId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const accessKey = generateAccessKey();
  const keyHash = await sha256(accessKey);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO mrp_workspaces (id, slug, name, active, created_at, updated_at) VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))").bind(workspaceId, slug, name),
    env.DB.prepare("INSERT INTO mrp_users (id, workspace_id, username, access_key_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))").bind(userId, workspaceId, username, keyHash, role),
    env.DB.prepare("INSERT INTO mrp_state (workspace_id, state_json, revision, updated_by, updated_at) VALUES (?, NULL, 0, ?, datetime('now'))").bind(workspaceId, userId),
    env.DB.prepare("INSERT INTO mrp_audit_log (workspace_id, user_id, action, details_json, created_at) VALUES (?, ?, 'workspace.created', ?, datetime('now'))").bind(workspaceId, userId, JSON.stringify({ slug, role }))
  ]);

  return json({
    workspace: { slug, name },
    user: { username, role },
    accessKey,
    warning: 'Store this access key securely. It is shown only once.'
  }, 201);
}

async function rotateWorkspaceAccessKey(request, env, pathSlug) {
  requireAdministrator(request, env);

  let body;
  try { body = await request.json(); }
  catch { throw httpError(400, 'Invalid JSON payload.'); }
  const slug = normalizeSlug(pathSlug || body.workspace);
  const username = normalizeUsername(body.username || 'owner');
  if (!slug || !username) throw httpError(400, 'A valid workspace and username are required.');

  const actor = await env.DB.prepare(`
    SELECT w.id AS workspace_id, w.slug, w.name, u.id AS user_id, u.username, u.role
    FROM mrp_workspaces w
    JOIN mrp_users u ON u.workspace_id = w.id
    WHERE w.slug = ? AND u.username = ? AND w.active = 1 AND u.active = 1
  `).bind(slug, username).first();
  if (!actor) throw httpError(404, 'Active workspace user not found.');

  const accessKey = generateAccessKey();
  const keyHash = await sha256(accessKey);
  const result = await env.DB.prepare(`
    UPDATE mrp_users
    SET access_key_hash = ?, updated_at = datetime('now')
    WHERE id = ? AND workspace_id = ? AND active = 1
  `).bind(keyHash, actor.user_id, actor.workspace_id).run();
  if (!result.meta?.changes) throw httpError(409, 'Workspace access key was not changed.');

  await env.DB.prepare("INSERT INTO mrp_audit_log (workspace_id, user_id, action, details_json, created_at) VALUES (?, ?, 'access_key.rotated', ?, datetime('now'))")
    .bind(actor.workspace_id, actor.user_id, JSON.stringify({ username: actor.username })).run();

  return json({
    workspace: { slug: actor.slug, name: actor.name },
    user: { username: actor.username, role: actor.role },
    accessKey,
    warning: 'The previous access key is now invalid. Store this new key securely; it is shown only once.'
  });
}

function requireAdministrator(request, env) {
  if (!env.MRP_ADMIN_TOKEN) throw httpError(503, 'MRP administration is not configured.');
  const supplied = bearerToken(request.headers.get('Authorization'));
  if (!supplied || !constantTimeEqual(supplied, env.MRP_ADMIN_TOKEN)) throw httpError(401, 'Invalid administrator token.');
}

async function authenticate(request, env) {
  const slug = normalizeSlug(request.headers.get('X-Hamvara-Workspace'));
  const username = normalizeUsername(request.headers.get('X-Hamvara-User'));
  const accessKey = String(request.headers.get('X-Hamvara-Key') || '');
  if (!slug || !username || !accessKey) throw httpError(401, 'Workspace credentials are required.');

  const row = await env.DB.prepare(`
    SELECT w.id AS workspace_id, w.slug, w.name, u.id AS user_id, u.username, u.role, u.access_key_hash
    FROM mrp_workspaces w
    JOIN mrp_users u ON u.workspace_id = w.id
    WHERE w.slug = ? AND u.username = ? AND w.active = 1 AND u.active = 1
  `).bind(slug, username).first();
  if (!row || !constantTimeEqual(await sha256(accessKey), row.access_key_hash)) throw httpError(401, 'Workspace credentials are invalid.');

  return {
    workspace: { id: row.workspace_id, slug: row.slug, name: row.name },
    user: { id: row.user_id, username: row.username, role: row.role }
  };
}

async function loadState(env, actor) {
  const row = await env.DB.prepare('SELECT state_json, revision, updated_at FROM mrp_state WHERE workspace_id = ?').bind(actor.workspace.id).first();
  let state = null;
  if (row?.state_json) {
    try { state = JSON.parse(row.state_json); }
    catch { throw httpError(500, 'Stored MRP data is invalid.'); }
  }
  return json({ state, revision: Number(row?.revision || 0), updatedAt: row?.updated_at || null, workspace: actor.workspace, user: actor.user });
}

async function saveState(request, env, actor) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_STATE_BYTES) throw httpError(413, 'MRP data exceeds the 5 MB workspace limit.');
  let body;
  try { body = JSON.parse(raw); }
  catch { throw httpError(400, 'Invalid JSON payload.'); }
  if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) throw httpError(400, 'MRP state is required.');
  if (Number(body.state.schemaVersion || 0) < 6) throw httpError(400, 'MRP schema version 6 or newer is required.');
  const expectedRevision = Number(body.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw httpError(400, 'A valid expectedRevision is required.');

  const result = await env.DB.prepare(`
    UPDATE mrp_state
    SET state_json = ?, revision = revision + 1, updated_by = ?, updated_at = datetime('now')
    WHERE workspace_id = ? AND revision = ?
  `).bind(JSON.stringify(body.state), actor.user.id, actor.workspace.id, expectedRevision).run();

  if (!result.meta?.changes) {
    const current = await env.DB.prepare('SELECT revision, updated_at FROM mrp_state WHERE workspace_id = ?').bind(actor.workspace.id).first();
    throw httpError(409, `Data changed in another session. Current revision is ${Number(current?.revision || 0)}.`);
  }

  const revision = expectedRevision + 1;
  await env.DB.prepare("INSERT INTO mrp_audit_log (workspace_id, user_id, action, details_json, created_at) VALUES (?, ?, 'state.saved', ?, datetime('now'))")
    .bind(actor.workspace.id, actor.user.id, JSON.stringify({ revision, schemaVersion: body.state.schemaVersion, appVersion: body.state.appVersion })).run();
  return json({ ok: true, revision, savedAt: new Date().toISOString() });
}

function normalizeSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug) ? slug : '';
}
function normalizeUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(username) ? username : '';
}
function normalizeRole(value) {
  const role = String(value || '').trim().toUpperCase();
  return ['OPERATOR', 'PRODUCTION_MANAGER', 'FACTORY_MANAGER', 'ACCOUNTING', 'CEO'].includes(role) ? role : 'OPERATOR';
}
function clean(value, limit) { return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit); }
function bearerToken(value) { const match = /^Bearer\s+(.+)$/i.exec(String(value || '')); return match?.[1] || ''; }
function generateAccessKey() { const bytes = crypto.getRandomValues(new Uint8Array(24)); return base64url(bytes); }
async function sha256(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return base64url(new Uint8Array(digest)); }
function base64url(bytes) { let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function constantTimeEqual(a, b) { a = String(a || ''); b = String(b || ''); if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
