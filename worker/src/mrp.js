import {assembleMrpRunArtifacts,chunkMrpRunArtifacts,externalizeMrpRunPayloads,rehydrateMrpRunPayloads} from '../../mrp/mrp-run-artifacts.js';

const MAX_STATE_BYTES = 5 * 1024 * 1024;
const MAX_STATE_REQUEST_BYTES = 32 * 1024 * 1024;
const MRP_ARTIFACT_THRESHOLD_BYTES = 256 * 1024;

export async function handleMrpRequest(request, env, url) {
  if (!env.DB) throw httpError(503, 'MRP database is not configured.');

  if (url.pathname === '/api/mrp/mobile-scan/session' && request.method === 'GET') return mobileScanSession(request, env);
  if (url.pathname === '/api/mrp/mobile-scan/events' && request.method === 'GET') return mobileScanEvents(request, env, url);
  if (url.pathname === '/api/mrp/mobile-scan/events' && request.method === 'POST') return createMobileScanEvent(request, env);

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
  if (url.pathname === '/api/mrp/backups/status' && request.method === 'GET') {
    return backupStatus(env, actor);
  }
  if (url.pathname === '/api/mrp/backups' && request.method === 'POST') {
    return createManualBackup(env, actor);
  }
  if (url.pathname === '/api/mrp/waybill/analyze' && request.method === 'POST') {
    return analyzeWaybill(request, env, actor);
  }
  if (url.pathname === '/api/mrp/scan-sessions' && request.method === 'POST') return createScanSession(env, actor);
  const scanSessionMatch = /^\/api\/mrp\/scan-sessions\/([0-9a-f-]+)(?:\/(events|close))?\/?$/.exec(url.pathname);
  if (scanSessionMatch && request.method === 'GET' && scanSessionMatch[2] === 'events') return scanSessionEvents(env, actor, scanSessionMatch[1], url);
  if (scanSessionMatch && request.method === 'POST' && scanSessionMatch[2] === 'close') return closeScanSession(env, actor, scanSessionMatch[1]);
  const scanEventMatch = /^\/api\/mrp\/scan-events\/([0-9a-f-]+)\/confirm\/?$/.exec(url.pathname);
  if (scanEventMatch && request.method === 'POST') return confirmScanEvent(request, env, actor, scanEventMatch[1]);
  throw httpError(404, 'MRP endpoint not found.');
}

const SCAN_SESSION_MINUTES = 15;

async function createScanSession(env, actor) {
  const id = crypto.randomUUID(), token = base64url(crypto.getRandomValues(new Uint8Array(32))), tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SCAN_SESSION_MINUTES * 60000).toISOString();
  await env.DB.prepare(`INSERT INTO mrp_scan_sessions (id,workspace_id,terminal_user_id,token_hash,status,expires_at,created_at)
    VALUES (?,?,?,?,'ACTIVE',?,datetime('now'))`).bind(id,actor.workspace.id,actor.user.id,tokenHash,expiresAt).run();
  await env.DB.prepare("INSERT INTO mrp_audit_log (workspace_id,user_id,action,details_json,created_at) VALUES (?,?,'mobile_scan.paired',?,datetime('now'))")
    .bind(actor.workspace.id,actor.user.id,JSON.stringify({sessionId:id,expiresAt})).run();
  return json({id,token,expiresAt,expiresInSeconds:SCAN_SESSION_MINUTES*60},201);
}

async function scanSessionEvents(env, actor, id, url) {
  const session = await terminalScanSession(env,actor,id); const after=Math.max(0,Number(url.searchParams.get('after'))||0);
  const result=await env.DB.prepare(`SELECT id,sequence,raw_code,status,result_json,created_at,confirmed_at FROM mrp_scan_events
    WHERE session_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT 50`).bind(id,after).all();
  return json({session:publicScanSession(session),events:(result.results||[]).map(publicScanEvent)});
}

async function closeScanSession(env, actor, id) {
  await terminalScanSession(env,actor,id,false);
  await env.DB.prepare("UPDATE mrp_scan_sessions SET status='CLOSED',closed_at=datetime('now') WHERE id=? AND workspace_id=?").bind(id,actor.workspace.id).run();
  return json({ok:true});
}

async function confirmScanEvent(request, env, actor, eventId) {
  const body=await safeJson(request),status=body.status==='REVIEWED'?'REVIEWED':'CONFIRMED',result=body.result&&typeof body.result==='object'?JSON.stringify(body.result).slice(0,4000):null;
  const event=await env.DB.prepare(`SELECT e.id,e.session_id FROM mrp_scan_events e JOIN mrp_scan_sessions s ON s.id=e.session_id
    WHERE e.id=? AND s.workspace_id=?`).bind(eventId,actor.workspace.id).first();
  if(!event)throw httpError(404,'Scan event not found.');
  await env.DB.prepare("UPDATE mrp_scan_events SET status=?,result_json=?,confirmed_at=CASE WHEN ?='CONFIRMED' THEN datetime('now') ELSE confirmed_at END WHERE id=?").bind(status,result,status,eventId).run();
  return json({ok:true,status});
}

async function mobileScanSession(request,env){const session=await authenticateMobileScanner(request,env);return json({session:publicScanSession(session)});}
async function mobileScanEvents(request,env,url){const session=await authenticateMobileScanner(request,env),after=Math.max(0,Number(url.searchParams.get('after'))||0);const result=await env.DB.prepare('SELECT id,sequence,raw_code,status,result_json,created_at,confirmed_at FROM mrp_scan_events WHERE session_id=? AND sequence>? ORDER BY sequence ASC LIMIT 50').bind(session.id,after).all();return json({session:publicScanSession(session),events:(result.results||[]).map(publicScanEvent)});}

async function createMobileScanEvent(request,env){
  const session=await authenticateMobileScanner(request,env),body=await safeJson(request),rawCode=clean(body.code,256);
  if(!rawCode)throw httpError(400,'A barcode value is required.');
  const count=await env.DB.prepare('SELECT COUNT(*) AS count FROM mrp_scan_events WHERE session_id=?').bind(session.id).first();
  if(Number(count?.count||0)>=250)throw httpError(429,'This scan session has reached its event limit.');
  const sequence=Number(count?.count||0)+1,id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO mrp_scan_events (id,session_id,sequence,raw_code,status,created_at) VALUES (?,?,?,?,'PENDING',datetime('now'))").bind(id,session.id,sequence,rawCode).run();
  return json({event:{id,sequence,code:rawCode,status:'PENDING',createdAt:new Date().toISOString()}},201);
}

async function authenticateMobileScanner(request,env){
  const token=String(request.headers.get('X-Hamvara-Scan-Token')||''),device=String(request.headers.get('X-Hamvara-Scan-Device')||'');
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)||!/^[-A-Za-z0-9]{16,80}$/.test(device))throw httpError(401,'Mobile scan credentials are required.');
  const tokenHash=await sha256(token),deviceHash=await sha256(device);
  const row=await env.DB.prepare('SELECT id,workspace_id,status,expires_at,device_hash FROM mrp_scan_sessions WHERE token_hash=?').bind(tokenHash).first();
  if(!row)throw httpError(401,'Mobile scan session is invalid.');
  if(row.status!=='ACTIVE'||Date.parse(row.expires_at)<=Date.now()){await env.DB.prepare("UPDATE mrp_scan_sessions SET status='EXPIRED' WHERE id=? AND status='ACTIVE'").bind(row.id).run();throw httpError(410,'Mobile scan session has expired.');}
  if(row.device_hash&&!constantTimeEqual(row.device_hash,deviceHash))throw httpError(403,'This pairing is already bound to another device.');
  if(!row.device_hash)await env.DB.prepare('UPDATE mrp_scan_sessions SET device_hash=? WHERE id=? AND device_hash IS NULL').bind(deviceHash,row.id).run();
  return {...row,device_hash:deviceHash};
}

async function terminalScanSession(env,actor,id,requireActive=true){const row=await env.DB.prepare('SELECT id,workspace_id,status,expires_at,device_hash FROM mrp_scan_sessions WHERE id=? AND workspace_id=?').bind(id,actor.workspace.id).first();if(!row)throw httpError(404,'Scan session not found.');if(requireActive&&(row.status!=='ACTIVE'||Date.parse(row.expires_at)<=Date.now()))throw httpError(410,'Mobile scan session has expired.');return row;}
function publicScanSession(row){return{id:row.id,status:row.status,expiresAt:row.expires_at,connected:Boolean(row.device_hash)}}
function publicScanEvent(row){let result=null;try{result=row.result_json?JSON.parse(row.result_json):null}catch{}return{id:row.id,sequence:Number(row.sequence),code:row.raw_code,status:row.status,result,createdAt:row.created_at,confirmedAt:row.confirmed_at}}
async function safeJson(request){try{return await request.json()}catch{throw httpError(400,'Invalid JSON payload.')}}

export async function runScheduledMrpBackups(env, scheduledAt = new Date().toISOString()) {
  if (!env.DB) throw new Error('MRP database is not configured.');
  await ensureBackupTable(env);
  await env.DB.prepare(`INSERT INTO mrp_state_backups (id, workspace_id, state_json, revision, source, status, created_at)
    SELECT lower(hex(randomblob(16))), workspace_id, state_json, revision, 'SCHEDULED', 'PENDING', ? FROM mrp_state WHERE state_json IS NOT NULL`).bind(scheduledAt).run();
  const created=await env.DB.prepare("SELECT id,workspace_id,state_json FROM mrp_state_backups WHERE source='SCHEDULED' AND created_at=?").bind(scheduledAt).all();
  let complete=0,failed=0;
  for(const backup of created.results||[]){try{const result=await snapshotMrpArtifactsForBackup(env,backup.id,backup.workspace_id,backup.state_json);await markMrpBackupComplete(env,backup.id,result.artifacts);complete++}catch(error){await markMrpBackupFailed(env,backup.id,error);failed++}}
  await env.DB.prepare("DELETE FROM mrp_state_backups WHERE created_at < datetime('now','-90 days')").run();
  await cleanupOrphanedMrpArtifacts(env);
  return { ok: failed===0, scheduledAt, created:(created.results||[]).length, complete, failed };
}

async function backupStatus(env, actor) {
  await ensureBackupTable(env);
  const row = await env.DB.prepare("SELECT SUM(CASE WHEN status='COMPLETE' THEN 1 ELSE 0 END) AS count, MAX(CASE WHEN status='COMPLETE' THEN completed_at END) AS last_backup_at, SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS failed_count, SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) AS pending_count FROM mrp_state_backups WHERE workspace_id = ?").bind(actor.workspace.id).first();
  return json({ count: Number(row?.count || 0), lastBackupAt: row?.last_backup_at || null, failedCount:Number(row?.failed_count||0),pendingCount:Number(row?.pending_count||0),scheduleUtc: ['06:00','18:00'], retentionDays: 90 });
}

async function createManualBackup(env,actor){await ensureBackupTable(env);const row=await env.DB.prepare('SELECT state_json, revision FROM mrp_state WHERE workspace_id = ?').bind(actor.workspace.id).first();if(!row?.state_json)throw httpError(409,'No workspace state is available to back up.');const id=crypto.randomUUID(),createdAt=new Date().toISOString();await env.DB.prepare("INSERT INTO mrp_state_backups (id,workspace_id,state_json,revision,source,status,created_at) VALUES (?,?,?,?, 'MANUAL','PENDING',?)").bind(id,actor.workspace.id,row.state_json,Number(row.revision||0),createdAt).run();try{const result=await snapshotMrpArtifactsForBackup(env,id,actor.workspace.id,row.state_json);await markMrpBackupComplete(env,id,result.artifacts);return json({ok:true,id,createdAt,revision:Number(row.revision||0),artifactCount:result.artifacts,status:'COMPLETE'})}catch(error){await markMrpBackupFailed(env,id,error);throw error}}

async function markMrpBackupComplete(env,backupId,artifactCount){await env.DB.prepare("UPDATE mrp_state_backups SET status='COMPLETE',artifact_count=?,completed_at=datetime('now'),failure_reason=NULL WHERE id=? AND status='PENDING'").bind(artifactCount,backupId).run()}
async function markMrpBackupFailed(env,backupId,error){const reason=String(error?.message||'MRP artifact snapshot failed.').slice(0,500);await env.DB.prepare("UPDATE mrp_state_backups SET status='FAILED',failure_reason=?,completed_at=NULL WHERE id=? AND status='PENDING'").bind(reason,backupId).run()}

export async function snapshotMrpArtifactsForBackup(env,backupId,workspaceId,stateJson){
  let state;try{state=JSON.parse(stateJson||'{}')}catch{throw httpError(500,'MRP backup source state is invalid.')}
  const references=(state.mrpRuns||[]).map(run=>run.storageArtifact).filter(Boolean);
  for(const reference of references){
    const databaseId=storedArtifactId(workspaceId,reference.artifactId),manifest=await env.DB.prepare('SELECT * FROM mrp_run_artifacts WHERE id=? AND workspace_id=?').bind(databaseId,workspaceId).first();
    if(!manifest)throw httpError(500,`MRP backup artifact is missing: ${reference.artifactId}.`);
    const chunkResult=await env.DB.prepare('SELECT * FROM mrp_run_artifact_chunks WHERE artifact_id=? ORDER BY chunk_index ASC').bind(databaseId).all(),manifestValue=artifactManifest(manifest,reference.artifactId),chunkValues=(chunkResult.results||[]).map(item=>artifactChunk(item,reference.artifactId));
    try{assembleMrpRunArtifacts([manifestValue],chunkValues)}catch(error){throw httpError(500,error.message||'MRP backup artifact integrity failed.')}
    await env.DB.prepare('INSERT OR REPLACE INTO mrp_run_artifact_backups (backup_id,original_artifact_id,manifest_json) VALUES (?,?,?)').bind(backupId,databaseId,JSON.stringify(manifestValue)).run();
    const statements=chunkValues.map(chunk=>env.DB.prepare('INSERT OR REPLACE INTO mrp_run_artifact_chunk_backups (backup_id,original_artifact_id,chunk_index,chunk_json) VALUES (?,?,?,?)').bind(backupId,databaseId,chunk.index,JSON.stringify(chunk)));
    for(let offset=0;offset<statements.length;offset+=50){const batch=statements.slice(offset,offset+50);if(typeof env.DB.batch==='function')await env.DB.batch(batch);else for(const statement of batch)await statement.run()}
  }
  return{artifacts:references.length};
}

export async function cleanupOrphanedMrpArtifacts(env){
  const states=await env.DB.prepare('SELECT workspace_id,state_json FROM mrp_state WHERE state_json IS NOT NULL').all(),referenced=new Set();
  for(const row of states.results||[]){let state;try{state=JSON.parse(row.state_json)}catch{continue}for(const run of state.mrpRuns||[])if(run.storageArtifact?.artifactId)referenced.add(storedArtifactId(row.workspace_id,run.storageArtifact.artifactId))}
  const candidates=await env.DB.prepare("SELECT id FROM mrp_run_artifacts WHERE created_at < datetime('now','-7 days')").all();let removed=0;
  for(const row of candidates.results||[])if(!referenced.has(row.id)){const result=await env.DB.prepare('DELETE FROM mrp_run_artifacts WHERE id=?').bind(row.id).run();removed+=Number(result.meta?.changes||0)}
  return{removed};
}

async function ensureBackupTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mrp_state_backups (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, state_json TEXT NOT NULL, revision INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'SCHEDULED', status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETE','FAILED','LEGACY_UNVERIFIED')), artifact_count INTEGER NOT NULL DEFAULT 0 CHECK (artifact_count >= 0), completed_at TEXT, failure_reason TEXT, created_at TEXT NOT NULL, FOREIGN KEY (workspace_id) REFERENCES mrp_workspaces(id) ON DELETE CASCADE)`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mrp_backups_workspace_created ON mrp_state_backups(workspace_id, created_at DESC)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mrp_backups_workspace_status_created ON mrp_state_backups(workspace_id, status, created_at DESC)').run();
}

async function analyzeWaybill(request, env, actor) {
  if (!env.AI) throw httpError(503, 'Waybill recognition is not configured.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 7 * 1024 * 1024) throw httpError(413, 'Waybill image is too large. Maximum request size is 7 MB.');
  let body;try { body = JSON.parse(raw); } catch { throw httpError(400, 'Invalid JSON payload.'); }
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image || ''));
  if (!match) throw httpError(400, 'A PNG, JPEG or WebP waybill image is required.');
  const binary = atob(match[2]);if (binary.length > 5 * 1024 * 1024) throw httpError(413, 'Waybill image exceeds 5 MB.');
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const fileName = clean(body.fileName,120) || 'waybill-image';
  let conversion;
  try {
    conversion = await env.AI.toMarkdown({ name:fileName, blob:new Blob([bytes],{type:match[1]}) });
  } catch { throw httpError(502, 'The waybill image could not be read. Use a clear, upright PNG or JPEG image.'); }
  const converted = Array.isArray(conversion) ? conversion[0] : conversion;
  if (!converted || converted.format === 'error' || !String(converted.data || '').trim()) throw httpError(502, clean(converted?.error,240) || 'No readable text was found in the waybill image.');
  const ocrText = String(converted.data).slice(0,24000);
  const prompt = `Convert the OCR text below from a supplier waybill into strict JSON only. Use exactly this shape: {"documentNo":"","supplier":"","rows":[{"description":"","sku":"","qty":1,"unit":"","batchNo":"","expiryDate":"YYYY-MM-DD or empty"}]}. Preserve one row per physical line item. Never invent an SKU; leave sku empty unless visibly present in the OCR text. Quantities must be numeric. Maximum 50 rows.\n\nOCR TEXT:\n${ocrText}`;
  const model = '@cf/qwen/qwen3-30b-a3b-fp8';
  const result = await env.AI.run(model, {
    messages: [
      {role:'system',content:'You extract structured purchasing data. Return valid JSON only, without markdown.'},
      {role:'user',content:prompt}
    ],
    stream: false,
    max_tokens: 2200,
    temperature: 0
  });
  const response = typeof result === 'string' ? result : (result.response || result.result?.response || result.choices?.[0]?.message?.content || '');
  let parsed;try { parsed = JSON.parse(extractJson(response)); } catch { throw httpError(502, 'The image could not be converted to a valid waybill. Try a clearer photo.'); }
  const stateRow = await env.DB.prepare('SELECT state_json FROM mrp_state WHERE workspace_id = ?').bind(actor.workspace.id).first();let skus=[];try { skus=JSON.parse(stateRow?.state_json||'{}').skus||[]; } catch {}
  const exact = new Map(skus.map(item=>[String(item.code||'').toUpperCase(),item.code]));
  const rows=(Array.isArray(parsed.rows)?parsed.rows:[]).slice(0,50).map(row=>({description:clean(row.description,180),sku:exact.get(String(row.sku||'').toUpperCase())||'',qty:Math.max(0,Number(row.qty)||0),unit:clean(row.unit,30),batchNo:clean(row.batchNo,80),expiryDate:/^\d{4}-\d{2}-\d{2}$/.test(row.expiryDate)?row.expiryDate:''})).filter(row=>row.description||row.sku||row.qty);
  await env.DB.prepare("INSERT INTO mrp_audit_log (workspace_id,user_id,action,details_json,created_at) VALUES (?,?,'waybill.analyzed',?,datetime('now'))").bind(actor.workspace.id,actor.user.id,JSON.stringify({fileName,rows:rows.length,model,ocr:'markdown-conversion'})).run();
  return json({ documentNo:clean(parsed.documentNo,100),supplier:clean(parsed.supplier,120),rows,model,ocr:'markdown-conversion',analyzedAt:new Date().toISOString(),requiresHumanApproval:true });
}

function extractJson(value){const text=String(value||'').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim(),start=text.indexOf('{'),end=text.lastIndexOf('}');if(start<0||end<=start)throw new Error('No JSON object.');return text.slice(start,end+1)}

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

  const requestedAccessKey = String(body.newAccessKey || '');
  if (requestedAccessKey && !isValidAccessKey(requestedAccessKey)) {
    throw httpError(400, 'newAccessKey must contain 32 to 128 printable non-space characters.');
  }
  const accessKey = requestedAccessKey || generateAccessKey();
  const keyHash = await sha256(accessKey);
  const result = await env.DB.prepare(`
    UPDATE mrp_users
    SET access_key_hash = ?, updated_at = datetime('now')
    WHERE id = ? AND workspace_id = ? AND active = 1
  `).bind(keyHash, actor.user_id, actor.workspace_id).run();
  if (!result.meta?.changes) throw httpError(409, 'Workspace access key was not changed.');

  await env.DB.prepare("INSERT INTO mrp_audit_log (workspace_id, user_id, action, details_json, created_at) VALUES (?, ?, 'access_key.rotated', ?, datetime('now'))")
    .bind(actor.workspace_id, actor.user_id, JSON.stringify({ username: actor.username })).run();

  const response = {
    workspace: { slug: actor.slug, name: actor.name },
    user: { username: actor.username, role: actor.role },
    ok: true,
    warning: requestedAccessKey
      ? 'The previous access key is now invalid. The supplied key is active.'
      : 'The previous access key is now invalid. Store this new key securely; it is shown only once.'
  };
  if (!requestedAccessKey) response.accessKey = accessKey;
  return json(response);
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

const storedArtifactId=(workspaceId,artifactId)=>`${workspaceId}:${artifactId}`;
const artifactManifest=(row,artifactId)=>({artifactId,runId:row.run_id,resultFingerprint:row.result_fingerprint,schemaVersion:Number(row.schema_version),byteLength:Number(row.byte_length),rowCount:Number(row.row_count),checkpointRecordCount:Number(row.checkpoint_record_count),chunkCount:Number(row.chunk_count),hashAlgorithm:row.hash_algorithm,headHash:row.head_hash,createdAt:row.created_at});
const artifactChunk=(row,artifactId)=>({artifactId,index:Number(row.chunk_index),count:Number(row.chunk_count),byteLength:Number(row.byte_length),payloadBase64:row.payload_base64,payloadHash:row.payload_hash,previousHash:row.previous_hash,hash:row.chain_hash});

export async function hydrateStoredState(env,workspaceId,storedState){
  const references=(storedState?.mrpRuns||[]).map(run=>run.storageArtifact).filter(Boolean);
  if(!references.length)return storedState;
  const manifests=[],chunks=[];
  for(const reference of references){
    const databaseId=storedArtifactId(workspaceId,reference.artifactId),row=await env.DB.prepare('SELECT * FROM mrp_run_artifacts WHERE id=? AND workspace_id=?').bind(databaseId,workspaceId).first();
    if(!row)throw httpError(500,`Stored MRP artifact is missing: ${reference.artifactId}.`);
    manifests.push(artifactManifest(row,reference.artifactId));
    const result=await env.DB.prepare('SELECT * FROM mrp_run_artifact_chunks WHERE artifact_id=? ORDER BY chunk_index ASC').bind(databaseId).all();
    chunks.push(...(result.results||[]).map(item=>artifactChunk(item,reference.artifactId)));
  }
  try{return rehydrateMrpRunPayloads(storedState,assembleMrpRunArtifacts(manifests,chunks))}
  catch(error){throw httpError(500,error.message||'Stored MRP artifact integrity failed.')}
}

export async function persistMrpArtifacts(env,actor,manifests,chunks){
  const createdAt=new Date().toISOString();
  for(const manifest of manifests){
    const databaseId=storedArtifactId(actor.workspace.id,manifest.artifactId),existing=await env.DB.prepare('SELECT head_hash,byte_length,chunk_count FROM mrp_run_artifacts WHERE id=? AND workspace_id=?').bind(databaseId,actor.workspace.id).first();
    if(existing&&(existing.head_hash!==manifest.headHash||Number(existing.byte_length)!==manifest.byteLength||Number(existing.chunk_count)!==manifest.chunkCount))throw httpError(409,`MRP artifact identity collision: ${manifest.artifactId}.`);
    await env.DB.prepare(`INSERT OR IGNORE INTO mrp_run_artifacts (id,workspace_id,run_id,result_fingerprint,schema_version,byte_length,row_count,checkpoint_record_count,chunk_count,hash_algorithm,head_hash,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(databaseId,actor.workspace.id,manifest.runId,manifest.resultFingerprint,manifest.schemaVersion,manifest.byteLength,manifest.rowCount,manifest.checkpointRecordCount,manifest.chunkCount,manifest.hashAlgorithm,manifest.headHash,actor.user.id,createdAt).run();
  }
  const statements=chunks.map(chunk=>env.DB.prepare(`INSERT OR IGNORE INTO mrp_run_artifact_chunks (artifact_id,chunk_index,chunk_count,byte_length,payload_base64,payload_hash,previous_hash,chain_hash) VALUES (?,?,?,?,?,?,?,?)`).bind(storedArtifactId(actor.workspace.id,chunk.artifactId),chunk.index,chunk.count,chunk.byteLength,chunk.payloadBase64,chunk.payloadHash,chunk.previousHash,chunk.hash));
  for(let offset=0;offset<statements.length;offset+=50){const batch=statements.slice(offset,offset+50);if(typeof env.DB.batch==='function')await env.DB.batch(batch);else for(const statement of batch)await statement.run()}
}

async function loadState(env, actor) {
  const row = await env.DB.prepare('SELECT state_json, revision, updated_at FROM mrp_state WHERE workspace_id = ?').bind(actor.workspace.id).first();
  let state = null;
  if (row?.state_json) {
    try { state = JSON.parse(row.state_json); }
    catch { throw httpError(500, 'Stored MRP data is invalid.'); }
    state=await hydrateStoredState(env,actor.workspace.id,state);
  }
  return json({ state, revision: Number(row?.revision || 0), updatedAt: row?.updated_at || null, workspace: actor.workspace, user: actor.user });
}

async function saveState(request, env, actor) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_STATE_REQUEST_BYTES) throw httpError(413, 'MRP data exceeds the 32 MB request limit.');
  let body;
  try { body = JSON.parse(raw); }
  catch { throw httpError(400, 'Invalid JSON payload.'); }
  if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) throw httpError(400, 'MRP state is required.');
  if (Number(body.state.schemaVersion || 0) < 6) throw httpError(400, 'MRP schema version 6 or newer is required.');
  const expectedRevision = Number(body.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw httpError(400, 'A valid expectedRevision is required.');
  const stored=await env.DB.prepare('SELECT state_json FROM mrp_state WHERE workspace_id = ?').bind(actor.workspace.id).first();let previousState={};try{previousState=JSON.parse(stored?.state_json||'{}');previousState=await hydrateStoredState(env,actor.workspace.id,previousState)}catch(error){if(error?.status)throw error}
  const priorReleased=new Set((previousState.mrpRuns||[]).filter(item=>item.status==='RELEASED'||item.status==='SUPERSEDED').map(item=>`${item.id}|${item.resultFingerprint}`)),newReleases=(body.state.mrpRuns||[]).filter(item=>item.status==='RELEASED'&&!priorReleased.has(`${item.id}|${item.resultFingerprint}`));
  if(newReleases.length&&!['FACTORY_MANAGER','CEO'].includes(actor.user.role))throw httpError(403,'Factory Manager or CEO role is required to persist a newly released MRP run.');
  if(newReleases.length&&String(env.MRP_AUDIT_HMAC_SECRET||'').length<32)throw httpError(503,'MRP audit sealing requires a server secret of at least 32 characters.');
  if(newReleases.length)await ensureAuditSealTable(env);

  // Persist an idempotent seal before the release state. A failed seal write therefore
  // cannot leave a newly released run without server-held authenticity evidence.
  const seals=[];
  if(newReleases.length){for(const run of newReleases){const sealedAt=new Date().toISOString(),payload={workspaceId:actor.workspace.id,runId:String(run.id||''),runNo:String(run.runNo||''),resultFingerprint:String(run.resultFingerprint||''),checkpointHeadHash:String(run.timeBucketCheckpoints?.headHash||''),deltaHeadHash:String(run.deltaAnchor?.headHash||''),releasedAt:String(run.releasedAt||'')},signature=await createMrpAuditSeal(payload,env.MRP_AUDIT_HMAC_SECRET),id=`MRPSEAL-${signature}`;await env.DB.prepare('INSERT OR IGNORE INTO mrp_audit_seals (id,workspace_id,run_id,payload_json,signature,algorithm,created_by,created_at) VALUES (?,?,?,?,?,\'HMAC-SHA-256\',?,?)').bind(id,actor.workspace.id,payload.runId,JSON.stringify(payload),signature,actor.user.id,sealedAt).run();seals.push({id,runId:payload.runId,signature,algorithm:'HMAC-SHA-256',sealedAt})}}

  const external=externalizeMrpRunPayloads(body.state,{thresholdBytes:MRP_ARTIFACT_THRESHOLD_BYTES});
  if(external.coreBytes>MAX_STATE_BYTES)throw httpError(413,'MRP core data exceeds the 5 MB workspace limit after run artifacts are externalized.');
  const chunked=chunkMrpRunArtifacts(external.artifacts);
  await persistMrpArtifacts(env,actor,chunked.manifests,chunked.chunks);

  const result = await env.DB.prepare(`
    UPDATE mrp_state
    SET state_json = ?, revision = revision + 1, updated_by = ?, updated_at = datetime('now')
    WHERE workspace_id = ? AND revision = ?
  `).bind(JSON.stringify(external.coreState), actor.user.id, actor.workspace.id, expectedRevision).run();

  if (!result.meta?.changes) {
    const current = await env.DB.prepare('SELECT revision, updated_at FROM mrp_state WHERE workspace_id = ?').bind(actor.workspace.id).first();
    throw httpError(409, `Data changed in another session. Current revision is ${Number(current?.revision || 0)}.`);
  }

  const revision = expectedRevision + 1;
  await env.DB.prepare("INSERT INTO mrp_audit_log (workspace_id, user_id, action, details_json, created_at) VALUES (?, ?, 'state.saved', ?, datetime('now'))")
    .bind(actor.workspace.id, actor.user.id, JSON.stringify({ revision, schemaVersion: body.state.schemaVersion, appVersion: body.state.appVersion, sealedMrpRuns:seals.map(item=>item.runId),externalizedMrpRuns:external.externalizedRuns })).run();
  return json({ ok: true, revision, savedAt: new Date().toISOString(), auditSeals:seals,externalizedMrpRuns:external.externalizedRuns });
}

async function ensureAuditSealTable(env){await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mrp_audit_seals (id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,run_id TEXT NOT NULL,payload_json TEXT NOT NULL,signature TEXT NOT NULL,algorithm TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(workspace_id,run_id,signature))`).run()}
async function hmacSha256(value,secret){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value));return base64url(new Uint8Array(signature))}
export async function createMrpAuditSeal(payload,secret){if(String(secret||'').length<32)throw new Error('Audit HMAC secret must contain at least 32 characters.');return hmacSha256(JSON.stringify(payload),secret)}
export async function verifyMrpAuditSeal(payload,signature,secret){return constantTimeEqual(signature,await createMrpAuditSeal(payload,secret))}

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
function isValidAccessKey(value) { return /^[\x21-\x7E]{32,128}$/.test(value); }
function generateAccessKey() { const bytes = crypto.getRandomValues(new Uint8Array(24)); return base64url(bytes); }
async function sha256(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return base64url(new Uint8Array(digest)); }
function base64url(bytes) { let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function constantTimeEqual(a, b) { a = String(a || ''); b = String(b || ''); if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
