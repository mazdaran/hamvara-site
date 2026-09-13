const USITC_EXPORT_URL = 'https://hts.usitc.gov/reststop/exportList?from=0100000000&to=9799999999&format=JSON&styles=false';
const MAX_HTS_CODES_PER_REQUEST = 100;
const HTS_CHAPTERS = 97;
const SYNC_STALE_MS = 10 * 60 * 1000;
const SYNC_LEASE_MS = 90 * 1000;

export async function handleTariffRequest(request, env, url) {
  if (!env.DB) throw httpError(503, 'Tariff database is not configured.');
  if (url.pathname === '/api/tariff/status' && request.method === 'GET') return tariffStatus(env);
  if (url.pathname === '/api/tariff/rules' && request.method === 'GET') return publishedRules(env, url);
  if (url.pathname === '/api/tariff/admin/sync' && request.method === 'POST') {
    requireRole(request, env, 'sync');
    return json(await startTariffSync(env), 202);
  }
  const syncStep = /^\/api\/tariff\/admin\/sync-runs\/([A-Za-z0-9._-]+)\/step\/?$/.exec(url.pathname);
  if (syncStep && request.method === 'POST') {
    requireRole(request, env, 'sync');
    return json(await stepTariffSync(env, syncStep[1]));
  }
  if (url.pathname === '/api/tariff/admin/sync-runs' && request.method === 'GET') {
    requireRole(request, env, 'reviewer');
    return listSyncRuns(env, url);
  }
  const changeList = /^\/api\/tariff\/admin\/sync-runs\/([A-Za-z0-9._-]+)\/changes\/?$/.exec(url.pathname);
  if (changeList && request.method === 'GET') {
    requireRole(request, env, 'reviewer');
    return listSyncChanges(env, url, changeList[1]);
  }
  const changeAction = /^\/api\/tariff\/admin\/changes\/(\d+)\/(acknowledge|disposition)\/?$/.exec(url.pathname);
  if (changeAction && request.method === 'POST') {
    const actor = requireRole(request, env, 'reviewer');
    return reviewSyncChange(request, env, Number(changeAction[1]), changeAction[2], actor);
  }
  const syncDecision = /^\/api\/tariff\/admin\/sync-runs\/([A-Za-z0-9._-]+)\/(promote|reject)\/?$/.exec(url.pathname);
  if (syncDecision && request.method === 'POST') {
    const actor = requireRole(request, env, 'publisher');
    return decideSyncRun(request, env, syncDecision[1], syncDecision[2], actor);
  }
  if (url.pathname === '/api/tariff/admin/rule-sets' && request.method === 'POST') {
    const actor = requireRole(request, env, 'preparer');
    return createRuleSet(request, env, actor);
  }
  const sourceMatch = /^\/api\/tariff\/admin\/rule-sets\/([A-Za-z0-9._-]+)\/sources\/?$/.exec(url.pathname);
  if (sourceMatch && request.method === 'PUT') {
    const actor = requireRole(request, env, 'reviewer');
    return reviewSources(request, env, sourceMatch[1], actor);
  }
  const transitionMatch = /^\/api\/tariff\/admin\/rule-sets\/([A-Za-z0-9._-]+)\/(verify|publish|retire)\/?$/.exec(url.pathname);
  if (transitionMatch && request.method === 'POST') {
    const role = transitionMatch[2] === 'verify' ? 'reviewer' : 'publisher';
    const actor = requireRole(request, env, role);
    return transitionRuleSet(request, env, transitionMatch[1], transitionMatch[2], actor);
  }
  throw httpError(404, 'Tariff endpoint not found.');
}

export async function startTariffSync(env, options = {}) {
  const bucket = requireSnapshotStore(env);
  const now = options.startedAt || new Date().toISOString();
  const active = await env.DB.prepare(`SELECT id,status,progress_current,progress_total,heartbeat_at,started_at,snapshot_prefix,base_snapshot_prefix
    FROM tariff_sync_runs WHERE status='RUNNING' ORDER BY started_at DESC LIMIT 1`).first();
  if (active && !isStaleSync(active, now)) return syncProgress(active, true);
  if (active) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE tariff_sync_runs SET status='FAILED',error_message='Interrupted sync expired and was safely superseded.',completed_at=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND status='RUNNING'`).bind(now, active.id),
      env.DB.prepare('DELETE FROM tariff_hts_changes WHERE run_id=?').bind(active.id),
      env.DB.prepare('DELETE FROM tariff_snapshot_chapters WHERE run_id=?').bind(active.id)
    ]);
  }
  const runId = options.runId || crypto.randomUUID();
  const sourceUrl = env.USITC_HTS_EXPORT_URL || USITC_EXPORT_URL;
  const prefix = snapshotPrefix(runId);
  const base = await env.DB.prepare(`SELECT snapshot_prefix FROM tariff_sync_runs
    WHERE snapshot_manifest_key IS NOT NULL AND snapshot_prefix IS NOT NULL
    ORDER BY completed_at DESC LIMIT 1`).first();
  await env.DB.prepare(`INSERT INTO tariff_sync_runs
    (id,source,status,started_at,heartbeat_at,progress_current,progress_total,snapshot_prefix,base_snapshot_prefix)
    VALUES (?,?,'RUNNING',?,?,0,?,?,?)`).bind(runId, sourceUrl, now, now, HTS_CHAPTERS, prefix, base?.snapshot_prefix || null).run();
  return {
    ok: true,
    runId,
    status: 'RUNNING',
    progressCurrent: 0,
    progressTotal: HTS_CHAPTERS,
    resumed: false,
    baseline: !base?.snapshot_prefix,
    snapshotPrefix: prefix,
    storage: bucket ? 'R2' : null
  };
}

export async function stepTariffSync(env, runId, options = {}) {
  const bucket = requireSnapshotStore(env);
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || new Date().toISOString();
  let run = await env.DB.prepare(`SELECT id,source,status,source_revision,rows_received,progress_current,progress_total,heartbeat_at,lease_token,lease_expires_at,snapshot_prefix,base_snapshot_prefix,snapshot_manifest_key
    FROM tariff_sync_runs WHERE id=?`).bind(runId).first();
  if (!run) throw httpError(404, 'Sync run not found.');
  if (run.status === 'STAGED') return syncProgress(run, true);
  if (run.status !== 'RUNNING') throw httpError(409, `Sync run is ${run.status}.`);
  if (!run.snapshot_prefix) throw httpError(409, 'Sync run predates object-storage snapshots and cannot be resumed safely.');

  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.parse(now) + SYNC_LEASE_MS).toISOString();
  const claim = await env.DB.prepare(`UPDATE tariff_sync_runs SET lease_token=?,lease_expires_at=?,heartbeat_at=?
    WHERE id=? AND status='RUNNING' AND (lease_expires_at IS NULL OR lease_expires_at<?)`).bind(leaseToken, leaseExpiresAt, now, runId, now).run();
  if (Number(claim.meta?.changes ?? claim.changes ?? 1) === 0) return { ...syncProgress(run, true), busy: true };

  try {
    run = await env.DB.prepare(`SELECT id,source,status,source_revision,rows_received,progress_current,progress_total,heartbeat_at,snapshot_prefix,base_snapshot_prefix
      FROM tariff_sync_runs WHERE id=?`).bind(runId).first();
    const chapter = Number(run.progress_current || 0) + 1;
    if (chapter > HTS_CHAPTERS) return finalizeTariffSync(env, runId, run.source_revision, now);

    const response = await fetchImpl(chapterSourceUrl(run.source || USITC_EXPORT_URL, chapter), {
      headers: { Accept: 'application/json', 'User-Agent': 'Hamvara-Tariff-Change-Monitor/2.0 (info@hamvara.com)' }
    });
    if (!response.ok) throw new Error(`USITC chapter ${chapter} export failed with HTTP ${response.status}.`);
    const payload = await response.json();
    const sourceRevision = clean(response.headers?.get?.('etag') || response.headers?.get?.('last-modified') || payload.revision || run.source_revision || now, 180);
    const records = (await Promise.all(extractRecords(payload).map(record => normalizeHtsRecord(record, sourceRevision))))
      .filter(record => record && Number(record.hts10.slice(0, 2)) === chapter);
    if (!records.length && !options.allowEmptyChapter) throw new Error(`USITC chapter ${chapter} returned no usable HTS rows.`);
    const unique = [...new Map(records.map(record => [record.hts10, record])).values()];
    const prefix = String(chapter).padStart(2, '0');

    let previous = null;
    if (run.base_snapshot_prefix) {
      previous = await readSnapshotChapter(bucket, run.base_snapshot_prefix, chapter);
      if (!previous) throw new Error(`Previous snapshot chapter ${prefix} is missing; comparison stopped safely.`);
    }
    const changes = previous ? diffSnapshotRecords(previous.records, unique) : [];
    const detectedAt = now;
    const objectKey = chapterSnapshotKey(run.snapshot_prefix, chapter);
    const chapterDocument = {
      schemaVersion: 1,
      source: 'USITC HTS',
      runId,
      chapter,
      sourceRevision,
      capturedAt: now,
      rowCount: unique.length,
      records: unique
    };
    const chapterJson = JSON.stringify(chapterDocument);
    const contentSha256 = await sha256(chapterJson);
    await bucket.put(objectKey, chapterJson, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: { runId, chapter: prefix, contentSha256, sourceRevision }
    });

    await env.DB.prepare('DELETE FROM tariff_hts_changes WHERE run_id=? AND substr(hts10,1,2)=?').bind(runId, prefix).run();
    const deltaStatements = changes.map(change => env.DB.prepare(`INSERT INTO tariff_hts_changes
      (run_id,hts10,change_type,old_value_json,new_value_json,detected_at)
      VALUES (?,?,?,?,?,?)`).bind(
        runId,
        change.hts10,
        change.changeType,
        change.oldValue ? JSON.stringify(snapshotValue(change.oldValue)) : null,
        change.newValue ? JSON.stringify(snapshotValue(change.newValue)) : null,
        detectedAt
      ));
    for (let offset = 0; offset < deltaStatements.length; offset += 75) {
      await env.DB.batch(deltaStatements.slice(offset, offset + 75));
    }

    await env.DB.prepare(`INSERT INTO tariff_snapshot_chapters
      (run_id,chapter,object_key,content_sha256,row_count,stored_at)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(run_id,chapter) DO UPDATE SET
        object_key=excluded.object_key,
        content_sha256=excluded.content_sha256,
        row_count=excluded.row_count,
        stored_at=excluded.stored_at`).bind(runId, chapter, objectKey, contentSha256, unique.length, now).run();

    const received = Number(run.rows_received || 0) + unique.length;
    await env.DB.prepare(`UPDATE tariff_sync_runs SET source_revision=?,rows_received=?,progress_current=?,heartbeat_at=?,lease_token=NULL,lease_expires_at=NULL,error_message=NULL
      WHERE id=? AND lease_token=?`).bind(sourceRevision, received, chapter, now, runId, leaseToken).run();
    if (chapter === HTS_CHAPTERS) return finalizeTariffSync(env, runId, sourceRevision, now);
    return {
      ok: true,
      runId,
      status: 'RUNNING',
      chapter,
      rowsInChapter: unique.length,
      deltaRowsInChapter: changes.length,
      rowsReceived: received,
      progressCurrent: chapter,
      progressTotal: HTS_CHAPTERS,
      baseline: !run.base_snapshot_prefix,
      snapshotObjectKey: objectKey
    };
  } catch (error) {
    await env.DB.prepare(`UPDATE tariff_sync_runs SET error_message=?,heartbeat_at=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND lease_token=?`)
      .bind(clean(error.message, 500), now, runId, leaseToken).run();
    throw error;
  }
}

export function diffSnapshotRecords(previousRecords, currentRecords) {
  const previous = new Map((previousRecords || []).map(record => [record.hts10, record]));
  const current = new Map((currentRecords || []).map(record => [record.hts10, record]));
  const changes = [];
  for (const [hts10, record] of current) {
    const old = previous.get(hts10);
    if (!old) changes.push({ hts10, changeType: 'ADDED', oldValue: null, newValue: record });
    else if (old.contentHash !== record.contentHash) changes.push({ hts10, changeType: 'CHANGED', oldValue: old, newValue: record });
  }
  for (const [hts10, record] of previous) {
    if (!current.has(hts10)) changes.push({ hts10, changeType: 'REMOVED', oldValue: record, newValue: null });
  }
  return changes.sort((left, right) => left.hts10.localeCompare(right.hts10));
}

async function finalizeTariffSync(env, runId, sourceRevision, completedAt) {
  const bucket = requireSnapshotStore(env);
  const run = await env.DB.prepare(`SELECT id,source,snapshot_prefix,base_snapshot_prefix FROM tariff_sync_runs WHERE id=?`).bind(runId).first();
  if (!run?.snapshot_prefix) throw new Error('Snapshot prefix is missing.');
  const chapterResult = await env.DB.prepare(`SELECT chapter,object_key,content_sha256,row_count,stored_at
    FROM tariff_snapshot_chapters WHERE run_id=? ORDER BY chapter`).bind(runId).all();
  const chapters = chapterResult.results || [];
  if (chapters.length !== HTS_CHAPTERS) throw new Error(`Snapshot is incomplete: ${chapters.length} of ${HTS_CHAPTERS} chapters are stored.`);

  const counts = await env.DB.prepare(`SELECT change_type,COUNT(*) AS count FROM tariff_hts_changes WHERE run_id=? GROUP BY change_type`).bind(runId).all();
  const totals = Object.fromEntries((counts.results || []).map(row => [row.change_type, Number(row.count || 0)]));
  const manifestKey = `${run.snapshot_prefix}/manifest.json`;
  const manifest = {
    schemaVersion: 1,
    source: run.source,
    runId,
    sourceRevision,
    baselineSnapshotPrefix: run.base_snapshot_prefix || null,
    capturedAt: completedAt,
    rowCount: chapters.reduce((total, chapter) => total + Number(chapter.row_count || 0), 0),
    deltaCounts: { added: totals.ADDED || 0, changed: totals.CHANGED || 0, removed: totals.REMOVED || 0 },
    chapters: chapters.map(chapter => ({
      chapter: Number(chapter.chapter),
      objectKey: chapter.object_key,
      contentSha256: chapter.content_sha256,
      rowCount: Number(chapter.row_count || 0),
      storedAt: chapter.stored_at
    }))
  };
  const manifestJson = JSON.stringify(manifest);
  const snapshotSha256 = await sha256(manifestJson);
  await bucket.put(manifestKey, manifestJson, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: { runId, snapshotSha256, sourceRevision: sourceRevision || '' }
  });
  await env.DB.prepare(`UPDATE tariff_sync_runs SET status='STAGED',source_revision=?,rows_added=?,rows_changed=?,rows_removed=?,progress_current=?,heartbeat_at=?,completed_at=?,snapshot_manifest_key=?,snapshot_sha256=?,lease_token=NULL,lease_expires_at=NULL,error_message=NULL
    WHERE id=?`).bind(
      sourceRevision,
      totals.ADDED || 0,
      totals.CHANGED || 0,
      totals.REMOVED || 0,
      HTS_CHAPTERS,
      completedAt,
      completedAt,
      manifestKey,
      snapshotSha256,
      runId
    ).run();
  const row = await env.DB.prepare(`SELECT id,status,source_revision,rows_received,rows_added,rows_changed,rows_removed,progress_current,progress_total,heartbeat_at,completed_at,snapshot_prefix,base_snapshot_prefix,snapshot_manifest_key,snapshot_sha256
    FROM tariff_sync_runs WHERE id=?`).bind(runId).first();
  return syncProgress(row);
}

export async function runTariffSync(env, options = {}) {
  const startedAt = options.scheduledAt || new Date().toISOString();
  let result = await startTariffSync(env, { runId: options.runId, startedAt });
  while (result.status === 'RUNNING') {
    result = await stepTariffSync(env, result.runId, {
      fetchImpl: options.fetchImpl,
      allowEmptyChapter: options.allowEmptyChapter,
      now: options.now
    });
  }
  return result;
}

function snapshotPrefix(runId) {
  return `tariff/usitc/snapshots/${runId}`;
}

function chapterSnapshotKey(prefix, chapter) {
  return `${prefix}/chapters/${String(chapter).padStart(2, '0')}.json`;
}

function requireSnapshotStore(env) {
  if (!env.TARIFF_SNAPSHOTS || typeof env.TARIFF_SNAPSHOTS.put !== 'function' || typeof env.TARIFF_SNAPSHOTS.get !== 'function') {
    throw httpError(503, 'Tariff snapshot object storage is not configured.');
  }
  return env.TARIFF_SNAPSHOTS;
}

async function readSnapshotChapter(bucket, prefix, chapter) {
  const object = await bucket.get(chapterSnapshotKey(prefix, chapter));
  if (!object) return null;
  const document = JSON.parse(await object.text());
  if (document.schemaVersion !== 1 || Number(document.chapter) !== chapter || !Array.isArray(document.records)) {
    throw new Error(`Stored snapshot chapter ${chapter} has an unsupported format.`);
  }
  return document;
}

function snapshotValue(record) {
  return {
    description: record.description,
    general_rate_raw: record.generalRateRaw || '',
    special_rate_raw: record.specialRateRaw || '',
    units_json: JSON.stringify(record.units || [])
  };
}

function chapterSourceUrl(source,chapter){const url=new URL(source),prefix=String(chapter).padStart(2,'0');url.searchParams.set('from',`${prefix}00000000`);url.searchParams.set('to',`${prefix}99999999`);return url.toString()}
function isStaleSync(run,now){const timestamp=Date.parse(run.heartbeat_at||run.started_at||'');return !Number.isFinite(timestamp)||Date.parse(now)-timestamp>SYNC_STALE_MS}
function syncProgress(run,resumed=false){return{ok:true,runId:run.id,status:run.status,rowsReceived:Number(run.rows_received||0),added:Number(run.rows_added||0),changed:Number(run.rows_changed||0),removed:Number(run.rows_removed||0),progressCurrent:Number(run.progress_current||0),progressTotal:Number(run.progress_total||HTS_CHAPTERS),heartbeatAt:run.heartbeat_at||null,completedAt:run.completed_at||null,resumed,baseline:!run.base_snapshot_prefix,snapshotPrefix:run.snapshot_prefix||null,snapshotManifestKey:run.snapshot_manifest_key||null,snapshotSha256:run.snapshot_sha256||null}}

async function decideSyncRun(request, env, runId, action, actor) {
  const body=await safeJson(request),reason=clean(body.reason,500),now=new Date().toISOString();
  if(!reason)throw httpError(400,'A decision reason is required.');
  const run=await env.DB.prepare(`SELECT status,started_at FROM tariff_sync_runs WHERE id=?`).bind(runId).first();
  if(!run)throw httpError(404,'Sync run not found.');
  if(run.status!=='STAGED')throw httpError(409,'Only a staged sync run can be decided.');
  if(action==='promote')throw httpError(409,'Production promotion is disabled in Tariff Control phase 1. Review and disposition candidates only.');
  if(action==='reject'){
    await env.DB.batch([
      env.DB.prepare(`UPDATE tariff_sync_runs SET status='REJECTED',promoted_at=?,promoted_by=?,decision_reason=? WHERE id=?`).bind(now,actor,reason,runId),
      env.DB.prepare('DELETE FROM tariff_hts_stage WHERE run_id=?').bind(runId)
    ]);
    return json({ok:true,runId,status:'REJECTED',actor,at:now});
  }
}

async function listSyncRuns(env, url) {
  const status = clean(url.searchParams.get('status'), 20).toUpperCase();
  const allowed = ['RUNNING','STAGED','REJECTED','FAILED'];
  const limit = boundedInt(url.searchParams.get('limit'), 25, 1, 100);
  const where = status && allowed.includes(status) ? 'WHERE status=?' : '';
  const statement = env.DB.prepare(`SELECT id,source_revision,status,rows_received,rows_added,rows_changed,rows_removed,progress_current,progress_total,heartbeat_at,started_at,completed_at,decision_reason,error_message,snapshot_prefix,base_snapshot_prefix,snapshot_manifest_key,snapshot_sha256
    FROM tariff_sync_runs ${where} ORDER BY started_at DESC LIMIT ?`);
  const result = where ? await statement.bind(status, limit).all() : await statement.bind(limit).all();
  return json({ runs: result.results || [], limit });
}

async function listSyncChanges(env, url, runId) {
  const run = await env.DB.prepare(`SELECT id,status,source_revision,rows_received,rows_added,rows_changed,rows_removed,started_at,completed_at,snapshot_manifest_key,snapshot_sha256,base_snapshot_prefix
    FROM tariff_sync_runs WHERE id=?`).bind(runId).first();
  if (!run) throw httpError(404, 'Sync run not found.');
  const type = clean(url.searchParams.get('type'), 20).toUpperCase();
  const disposition = clean(url.searchParams.get('disposition'), 20).toUpperCase();
  const allowedTypes = ['ADDED','CHANGED','REMOVED'];
  const allowedDispositions = ['PENDING','ACCEPTED','REJECTED','NO_IMPACT'];
  const limit = boundedInt(url.searchParams.get('limit'), 100, 1, 250);
  const after = boundedInt(url.searchParams.get('after'), 0, 0, Number.MAX_SAFE_INTEGER);
  const clauses = ['run_id=?', 'id>?'];
  const binds = [runId, after];
  if (allowedTypes.includes(type)) { clauses.push('change_type=?'); binds.push(type); }
  if (allowedDispositions.includes(disposition)) { clauses.push('disposition=?'); binds.push(disposition); }
  const result = await env.DB.prepare(`SELECT id,hts10,change_type,old_value_json,new_value_json,detected_at,disposition,disposition_at,disposition_by,disposition_reason,acknowledged_at,acknowledged_by
    FROM tariff_hts_changes WHERE ${clauses.join(' AND ')} ORDER BY id LIMIT ?`).bind(...binds, limit + 1).all();
  const rows = result.results || [];
  const hasMore = rows.length > limit;
  const changes = rows.slice(0, limit).map(row => ({ ...row, oldValue: parseJson(row.old_value_json, null), newValue: parseJson(row.new_value_json, null), old_value_json: undefined, new_value_json: undefined }));
  return json({ run, changes, nextAfter: hasMore ? changes[changes.length - 1]?.id || null : null });
}

async function reviewSyncChange(request, env, id, action, actor) {
  const body = await safeJson(request);
  const change = await env.DB.prepare(`SELECT c.id,c.run_id,c.disposition,c.acknowledged_at,c.acknowledged_by,r.status AS run_status
    FROM tariff_hts_changes c JOIN tariff_sync_runs r ON r.id=c.run_id WHERE c.id=?`).bind(id).first();
  if (!change) throw httpError(404, 'Tariff change not found.');
  if (change.run_status !== 'STAGED') throw httpError(409, 'Only changes in a staged run can be reviewed.');
  const now = new Date().toISOString();
  if (action === 'acknowledge') {
    if (change.acknowledged_at) return json({ ok:true,id,acknowledgedAt:change.acknowledged_at,acknowledgedBy:change.acknowledged_by,unchanged:true });
    await env.DB.prepare(`UPDATE tariff_hts_changes SET acknowledged_at=?,acknowledged_by=? WHERE id=? AND acknowledged_at IS NULL`).bind(now,actor,id).run();
    return json({ ok:true,id,acknowledgedAt:now,acknowledgedBy:actor });
  }
  const disposition = clean(body.disposition, 20).toUpperCase();
  const reason = clean(body.reason, 500);
  if (!['ACCEPTED','REJECTED','NO_IMPACT'].includes(disposition)) throw httpError(400, 'Disposition must be ACCEPTED, REJECTED or NO_IMPACT.');
  if (!reason) throw httpError(400, 'A disposition reason is required.');
  await env.DB.prepare(`UPDATE tariff_hts_changes SET disposition=?,disposition_at=?,disposition_by=?,disposition_reason=? WHERE id=?`).bind(disposition,now,actor,reason,id).run();
  return json({ ok:true,id,disposition,actor,at:now });
}

async function tariffStatus(env) {
  const run = await env.DB.prepare(`SELECT id,source_revision,status,rows_received,rows_added,rows_changed,rows_removed,progress_current,progress_total,heartbeat_at,started_at,completed_at,error_message,snapshot_prefix,base_snapshot_prefix,snapshot_manifest_key,snapshot_sha256
    FROM tariff_sync_runs ORDER BY started_at DESC LIMIT 1`).first();
  const changes = await env.DB.prepare(`SELECT COUNT(*) AS count,MAX(detected_at) AS latest FROM tariff_hts_changes WHERE acknowledged_at IS NULL`).first();
  const published = await env.DB.prepare(`SELECT id,name,effective_from,effective_to,published_at FROM tariff_rule_sets WHERE status='PUBLISHED' ORDER BY published_at DESC LIMIT 1`).first();
  return json({ sync: run || null, unacknowledgedChanges: Number(changes?.count || 0), latestChangeAt: changes?.latest || null, publishedRuleSet: published || null });
}

async function publishedRules(env, url) {
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('as_of') || '') ? url.searchParams.get('as_of') : new Date().toISOString().slice(0,10);
  const codes = [...new Set((url.searchParams.get('hts') || '').split(',').map(value => value.replace(/\D/g,'')).filter(value => /^\d{4,10}$/.test(value)))].slice(0, MAX_HTS_CODES_PER_REQUEST);
  const set = await env.DB.prepare(`SELECT id,name,effective_from,effective_to,published_at,content_hash FROM tariff_rule_sets
    WHERE status='PUBLISHED' AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY published_at DESC LIMIT 1`).bind(asOf, asOf).first();
  if (!set) return json({ status: 'unavailable', asOf, ruleSet: null, rules: [], relations: [], message: 'No published rule set is available for this date.' }, 503);
  let rules = [];
  if (codes.length) {
    const clauses = codes.map(() => `(hts_pattern IS NULL OR ? LIKE replace(hts_pattern,'*','') || '%')`).join(' OR ');
    const result = await env.DB.prepare(`SELECT id,program_id,legal_basis,hts_pattern,country_group_json,rate_pct,specific_rate_json,cap_rule_json,deminimis_rule_json,valid_from,valid_to,source_url,source_sha256,source_status
      FROM tariff_rules WHERE rule_set_id=? AND valid_from<=? AND (valid_to IS NULL OR valid_to>=?) AND (${clauses}) ORDER BY program_id,hts_pattern`).bind(set.id, asOf, asOf, ...codes).all();
    rules = result.results || [];
  }
  const relationResult = await env.DB.prepare(`SELECT left_program_id,right_program_id,relation_type,priority,valid_from,valid_to,source_url,source_status
    FROM tariff_rule_relations WHERE rule_set_id=? AND valid_from<=? AND (valid_to IS NULL OR valid_to>=?) ORDER BY priority DESC`).bind(set.id, asOf, asOf).all();
  const feeResult = await env.DB.prepare(`SELECT fee_id,fiscal_year,rate_pct,minimum_usd,maximum_usd,transport_mode,valid_from,valid_to,source_url,source_status
    FROM tariff_fee_schedules WHERE rule_set_id=? AND valid_from<=? AND (valid_to IS NULL OR valid_to>=?) ORDER BY fee_id`).bind(set.id, asOf, asOf).all();
  return json({ status: 'published', asOf, ruleSet: set, requestedHts: codes, rules: rules.map(publicRule), relations: relationResult.results || [], fees: feeResult.results || [] }, 200, { 'Cache-Control': 'public, max-age=300' });
}

async function createRuleSet(request, env, actor) {
  const body = await safeJson(request), name = clean(body.name, 160), effectiveFrom = isoDate(body.effectiveFrom);
  if (!actor || !name || !effectiveFrom || !Array.isArray(body.rules) || !body.rules.length) throw httpError(400, 'Actor, name, effectiveFrom and at least one rule are required.');
  const id = clean(body.id, 80) || crypto.randomUUID(), createdAt = new Date().toISOString();
  const contentHash = await sha256(JSON.stringify({ name, effectiveFrom, effectiveTo: body.effectiveTo || null, rules: body.rules, relations: body.relations || [] }));
  const statements = [env.DB.prepare(`INSERT INTO tariff_rule_sets
    (id,name,status,effective_from,effective_to,source_revision,created_by,created_at,supersedes_id,content_hash,notes)
    VALUES (?,?,'DRAFT',?,?,?,?,?,?,?,?)`).bind(id,name,effectiveFrom,isoDate(body.effectiveTo),clean(body.sourceRevision,180),actor,createdAt,clean(body.supersedesId,80),contentHash,clean(body.notes,1000))];
  body.rules.slice(0,5000).forEach((rule,index) => statements.push(env.DB.prepare(`INSERT INTO tariff_rules
    (id,rule_set_id,program_id,legal_basis,hts_pattern,country_group_json,rate_pct,specific_rate_json,cap_rule_json,deminimis_rule_json,valid_from,valid_to,source_url,source_sha256,source_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PRIMARY_PENDING')`).bind(clean(rule.id,80)||`${id}-rule-${index+1}`,id,required(rule.programId,'programId'),required(rule.legalBasis,'legalBasis'),clean(rule.htsPattern,20),JSON.stringify(Array.isArray(rule.countryGroup)?rule.countryGroup:[]),nullableNumber(rule.ratePct),jsonOrNull(rule.specificRate),jsonOrNull(rule.capRule),jsonOrNull(rule.deminimisRule),isoDate(rule.validFrom)||effectiveFrom,isoDate(rule.validTo),requiredHttps(rule.sourceUrl),clean(rule.sourceSha256,64))));
  (Array.isArray(body.relations)?body.relations:[]).slice(0,1000).forEach((relation,index)=>statements.push(env.DB.prepare(`INSERT INTO tariff_rule_relations
    (id,rule_set_id,left_program_id,right_program_id,relation_type,priority,valid_from,valid_to,source_url,source_status)
    VALUES (?,?,?,?,?,?,?,?,?,'PRIMARY_PENDING')`).bind(clean(relation.id,80)||`${id}-relation-${index+1}`,id,required(relation.leftProgramId,'leftProgramId'),required(relation.rightProgramId,'rightProgramId'),relationType(relation.relationType),Math.trunc(Number(relation.priority)||0),isoDate(relation.validFrom)||effectiveFrom,isoDate(relation.validTo),requiredHttps(relation.sourceUrl))));
  (Array.isArray(body.fees)?body.fees:[]).slice(0,100).forEach((fee,index)=>statements.push(env.DB.prepare(`INSERT INTO tariff_fee_schedules
    (id,rule_set_id,fee_id,fiscal_year,rate_pct,minimum_usd,maximum_usd,transport_mode,valid_from,valid_to,source_url,source_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'PRIMARY_PENDING')`).bind(clean(fee.id,80)||`${id}-fee-${index+1}`,id,required(fee.feeId,'feeId'),fee.fiscalYear?Math.trunc(Number(fee.fiscalYear)):null,nullableNumber(fee.ratePct),nullableMoney(fee.minimumUsd),nullableMoney(fee.maximumUsd),clean(fee.transportMode,20),isoDate(fee.validFrom)||effectiveFrom,isoDate(fee.validTo),requiredHttps(fee.sourceUrl))));
  statements.push(env.DB.prepare(`INSERT INTO tariff_rule_reviews (id,rule_set_id,action,actor,reason,evidence_json,created_at) VALUES (?,?,'CREATED',?,?,?,?)`).bind(crypto.randomUUID(),id,actor,clean(body.reason,500),JSON.stringify(body.evidence||[]),createdAt));
  for (let offset=0; offset<statements.length; offset+=75) await env.DB.batch(statements.slice(offset,offset+75));
  return json({ id, status:'DRAFT', contentHash, createdAt }, 201);
}

async function reviewSources(request, env, id, actor) {
  const body=await safeJson(request),updates=Array.isArray(body.updates)?body.updates:[];
  if(!actor||!updates.length)throw httpError(400,'Actor and source updates are required.');
  const set=await env.DB.prepare('SELECT status FROM tariff_rule_sets WHERE id=?').bind(id).first();
  if(!set)throw httpError(404,'Rule set not found.');
  if(set.status!=='DRAFT')throw httpError(409,'Only a draft rule set can receive source review updates.');
  const statements=[];
  for(const update of updates.slice(0,5000)){
    const status=sourceStatus(update.status),kind=['relation','fee'].includes(update.kind)?update.kind:'rule',itemId=clean(update.id,100);
    if(!itemId)throw httpError(400,'Every source update requires an item id.');
    const table=kind==='relation'?'tariff_rule_relations':kind==='fee'?'tariff_fee_schedules':'tariff_rules';
    statements.push(env.DB.prepare(`UPDATE ${table} SET source_status=? WHERE id=? AND rule_set_id=?`).bind(status,itemId,id));
  }
  for(let offset=0;offset<statements.length;offset+=75)await env.DB.batch(statements.slice(offset,offset+75));
  await env.DB.prepare(`INSERT INTO tariff_rule_reviews (id,rule_set_id,action,actor,reason,evidence_json,created_at) VALUES (?,?,'SOURCE_REVIEWED',?,?,?,?)`)
    .bind(crypto.randomUUID(),id,actor,clean(body.reason,500)||'Source evidence updated',JSON.stringify(body.evidence||[]),new Date().toISOString()).run();
  return json({ok:true,id,status:'DRAFT',updated:statements.length});
}

async function transitionRuleSet(request, env, id, action, actor) {
  const body=await safeJson(request),reason=clean(body.reason,500),now=new Date().toISOString();
  if(!actor||!reason)throw httpError(400,'Actor and reason are required for controlled transitions.');
  const set=await env.DB.prepare('SELECT status,created_by,verified_by FROM tariff_rule_sets WHERE id=?').bind(id).first();
  if(!set)throw httpError(404,'Rule set not found.');
  if(action==='verify'){
    if(set.status!=='DRAFT')throw httpError(409,'Only a draft rule set can be verified.');
    if(actor===set.created_by)throw httpError(409,'The preparer cannot verify the same rule set.');
    const pending=await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM tariff_rules WHERE rule_set_id=? AND source_status='PRIMARY_PENDING')+
      (SELECT COUNT(*) FROM tariff_rule_relations WHERE rule_set_id=? AND source_status='PRIMARY_PENDING')+
      (SELECT COUNT(*) FROM tariff_fee_schedules WHERE rule_set_id=? AND source_status='PRIMARY_PENDING') AS count`).bind(id,id,id).first();
    if(Number(pending?.count||0)>0)throw httpError(409,'All primary sources must be verified before the rule set can be verified.');
    await env.DB.prepare(`UPDATE tariff_rule_sets SET status='VERIFIED',verified_by=?,verified_at=? WHERE id=?`).bind(actor,now,id).run();
  }else if(action==='publish'){
    if(set.status!=='VERIFIED')throw httpError(409,'Only a verified rule set can be published.');
    if(actor===set.verified_by)throw httpError(409,'The verifier cannot publish the same rule set.');
    await env.DB.batch([
      env.DB.prepare(`UPDATE tariff_rule_sets SET status='RETIRED' WHERE status='PUBLISHED' AND id<>?`).bind(id),
      env.DB.prepare(`UPDATE tariff_rule_sets SET status='PUBLISHED',published_by=?,published_at=? WHERE id=?`).bind(actor,now,id)
    ]);
  }else{
    if(!['VERIFIED','PUBLISHED'].includes(set.status))throw httpError(409,'Only a verified or published rule set can be retired.');
    await env.DB.prepare(`UPDATE tariff_rule_sets SET status='RETIRED' WHERE id=?`).bind(id).run();
  }
  const status=action==='verify'?'VERIFIED':action==='publish'?'PUBLISHED':'RETIRED';
  await env.DB.prepare(`INSERT INTO tariff_rule_reviews (id,rule_set_id,action,actor,reason,evidence_json,created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),id,status,actor,reason,JSON.stringify(body.evidence||[]),now).run();
  return json({ok:true,id,status,actor,at:now});
}

export function extractRecords(payload){if(Array.isArray(payload))return payload;for(const key of ['results','data','items','rows'])if(Array.isArray(payload?.[key]))return payload[key];throw new Error('USITC response did not contain a recognized record array.');}
export async function normalizeHtsRecord(record,sourceRevision){const rawCode=pick(record,['htsno','hts_number','hts','hts10','HTS Number','HTSNO']),hts10=String(rawCode||'').replace(/\D/g,'');if(!/^\d{10}$/.test(hts10))return null;const description=clean(pick(record,['description','description_text','Description','brief_description']),2000);if(!description)return null;const generalRateRaw=clean(pick(record,['general','general_rate','general_rate_of_duty','General Rate of Duty']),300),specialRateRaw=clean(pick(record,['special','special_rate','special_rate_of_duty','Special Rate of Duty']),500),units=pick(record,['units','unit','units_of_quantity','Units']);const normalized={hts10,description,generalRateRaw,specialRateRaw,units:Array.isArray(units)?units.map(String):clean(units,200)?[clean(units,200)]:[],sourceRevision};normalized.contentHash=await sha256(JSON.stringify({hts10,description,generalRateRaw,specialRateRaw,units:normalized.units}));return normalized;}
function publicRule(row){return{...row,country_group:parseJson(row.country_group_json,[]),specific_rate:parseJson(row.specific_rate_json,null),cap_rule:parseJson(row.cap_rule_json,null),deminimis_rule:parseJson(row.deminimis_rule_json,null),country_group_json:undefined,specific_rate_json:undefined,cap_rule_json:undefined,deminimis_rule_json:undefined}}
function pick(record,keys){for(const key of keys)if(record&&record[key]!==undefined&&record[key]!==null)return record[key];return null}
function parseJson(value,fallback){try{return value?JSON.parse(value):fallback}catch{return fallback}}
function clean(value,max=250){return String(value??'').trim().slice(0,max)}
function isoDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):null}
function boundedInt(value,fallback,min,max){const number=Number.parseInt(String(value??''),10);return Number.isFinite(number)?Math.min(max,Math.max(min,number)):fallback}
function nullableNumber(value){if(value===null||value===undefined||value==='')return null;const number=Number(value);if(!Number.isFinite(number)||number<0||number>1000)throw httpError(400,'Rate must be between 0 and 1000 percent.');return number}
function nullableMoney(value){if(value===null||value===undefined||value==='')return null;const number=Number(value);if(!Number.isFinite(number)||number<0||number>1000000)throw httpError(400,'Fee amount is outside the supported range.');return number}
function jsonOrNull(value){return value===null||value===undefined?null:JSON.stringify(value)}
function required(value,name){const result=clean(value,300);if(!result)throw httpError(400,`${name} is required.`);return result}
function requiredHttps(value){const text=required(value,'sourceUrl');try{const url=new URL(text),host=url.hostname.toLowerCase(),allowed=['cbp.gov','usitc.gov','ustr.gov','federalregister.gov','whitehouse.gov','govinfo.gov','ecfr.gov'];if(url.protocol!=='https:'||!allowed.some(domain=>host===domain||host.endsWith('.'+domain)))throw new Error();return url.toString()}catch{throw httpError(400,'Every sourceUrl must be an approved U.S. primary-source HTTPS URL.')}}
function relationType(value){const type=clean(value,30).toUpperCase(),allowed=['STACKS_WITH','EXCLUDED_BY','EXCLUSIVE_WITH','CAPPED_WITH','REQUIRES_REVIEW','SUPERSEDES'];if(!allowed.includes(type))throw httpError(400,'Invalid rule relation type.');return type}
function sourceStatus(value){const status=clean(value,30).toUpperCase(),allowed=['PRIMARY_PENDING','PRIMARY_VERIFIED','BROKER_REVIEWED'];if(!allowed.includes(status))throw httpError(400,'Invalid source review status.');return status}
function requireRole(request,env,role){const keys={sync:['TARIFF_SYNC_TOKEN','TARIFF_SYNC_ACTOR'],preparer:['TARIFF_PREPARER_TOKEN','TARIFF_PREPARER_ACTOR'],reviewer:['TARIFF_REVIEWER_TOKEN','TARIFF_REVIEWER_ACTOR'],publisher:['TARIFF_PUBLISHER_TOKEN','TARIFF_PUBLISHER_ACTOR']},[tokenKey,actorKey]=keys[role]||[];const expected=env[tokenKey],actor=clean(env[actorKey],120),supplied=String(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!expected||!actor)throw httpError(503,`Tariff ${role} role is not configured.`);if(!supplied||!constantTimeEqual(supplied,expected))throw httpError(401,`Invalid tariff ${role} credential.`);return actor}
function constantTimeEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
async function safeJson(request){try{return await request.json()}catch{throw httpError(400,'Invalid JSON payload.')}}
async function sha256(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function httpError(status,message){const error=new Error(message);error.status=status;return error}
function json(body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}})}
