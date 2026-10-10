import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleMrpRequest } from '../src/mrp.js';

const digest = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('base64url');
async function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  for (const file of ['0002_mrp_saas.sql', '0004_mrp_mobile_scan.sql']) db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  const DB = {
    beforeClaim: null,
    prepare(sql) {
      return { bind(...args) {
        return {
          async first() { return db.prepare(sql).get(...args) ?? null; },
          async all() { return { results: db.prepare(sql).all(...args) }; },
          async run() {
            if (sql.startsWith('UPDATE mrp_scan_sessions SET device_hash=') && DB.beforeClaim) {
              const hook = DB.beforeClaim; DB.beforeClaim = null; await hook();
            }
            return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } };
          }
        };
      } };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try { const results = []; for (const s of statements) results.push(await s.run()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
  const env = { DB, MRP_ADMIN_TOKEN: 'test-only-admin' };
  async function call(path, { method = 'GET', headers = {}, body } = {}) {
    const req = new Request(`https://example.test/api/mrp/${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return handleMrpRequest(req, env, new URL(req.url));
  }
  const companies = {};
  for (const slug of ['istanbul-test', 'us-test']) {
    const response = await call('workspaces', { method: 'POST', headers: { Authorization: 'Bearer test-only-admin' }, body: { workspace: slug, name: slug } });
    const created = await response.json();
    const headers = { 'X-Hamvara-Workspace': slug, 'X-Hamvara-User': 'owner', 'X-Hamvara-Key': created.accessKey };
    const { workspace } = await (await call('session', { headers })).json();
    db.prepare('UPDATE mrp_state SET state_json=? WHERE workspace_id=?').run(JSON.stringify({ companyMarker: slug }), workspace.id);
    companies[slug] = { headers, id: workspace.id };
  }
  return { db, DB, call, a: companies['istanbul-test'], b: companies['us-test'] };
}
const denied = (operation, status) => assert.rejects(operation, error => error.status === status);
const phone = (token, device = 'phone-device-0001') => ({ 'X-Hamvara-Scan-Token': token, 'X-Hamvara-Scan-Device': device });

 test('two provisioned companies retain separate state and keys cannot select another tenant', async t => {
  const { call, a, b } = await fixture(t);
  for (const [company, marker] of [[a, 'istanbul-test'], [b, 'us-test']]) {
    const result = await (await call('state', { headers: company.headers })).json();
    assert.equal(result.state.companyMarker, marker);
  }
  await denied(call('state', { headers: { ...a.headers, 'X-Hamvara-Workspace': 'us-test' } }), 401);
  await denied(call('state', { method: 'PUT', headers: { ...a.headers, 'X-Hamvara-Workspace': 'us-test' }, body: {} }), 401);
});

test('another company cannot read, close or confirm a known scan session/event', async t => {
  const { call, a, b } = await fixture(t);
  const session = await (await call('scan-sessions', { method: 'POST', headers: a.headers })).json();
  const { event } = await (await call('mobile-scan/events', { method: 'POST', headers: phone(session.token), body: { code: 'TR-001' } })).json();
  await denied(call(`scan-sessions/${session.id}/events`, { headers: b.headers }), 404);
  await denied(call(`scan-sessions/${session.id}/close`, { method: 'POST', headers: b.headers }), 404);
  await denied(call(`scan-events/${event.id}/confirm`, { method: 'POST', headers: b.headers, body: {} }), 404);
  const own = await (await call(`scan-sessions/${session.id}/events`, { headers: a.headers })).json();
  assert.equal(own.events[0].code, 'TR-001');
});

for (const target of ['workspace', 'user']) test(`disabled ${target} revokes an existing mobile pairing`, async t => {
  const { db, call, a } = await fixture(t);
  const session = await (await call('scan-sessions', { method: 'POST', headers: a.headers })).json();
  await call('mobile-scan/session', { headers: phone(session.token) });
  if (target === 'workspace') db.prepare('UPDATE mrp_workspaces SET active=0 WHERE id=?').run(a.id);
  else db.prepare('UPDATE mrp_users SET active=0 WHERE workspace_id=?').run(a.id);
  await denied(call('session', { headers: a.headers }), 401);
  await denied(call('mobile-scan/session', { headers: phone(session.token) }), 401);
  await denied(call('mobile-scan/events', { method: 'POST', headers: phone(session.token), body: { code: 'blocked' } }), 401);
  assert.equal(db.prepare('SELECT count(*) AS n FROM mrp_scan_events').get().n, 0);
});

test('a competing device that wins the atomic claim blocks the losing request', async t => {
  const { db, DB, call, a } = await fixture(t);
  const session = await (await call('scan-sessions', { method: 'POST', headers: a.headers })).json();
  DB.beforeClaim = async () => db.prepare('UPDATE mrp_scan_sessions SET device_hash=? WHERE id=?').run(await digest('phone-device-0002'), session.id);
  await denied(call('mobile-scan/events', { method: 'POST', headers: phone(session.token), body: { code: 'must-not-write' } }), 403);
  assert.equal(db.prepare('SELECT count(*) AS n FROM mrp_scan_events').get().n, 0);
  const result = await call('mobile-scan/session', { headers: phone(session.token, 'phone-device-0002') });
  assert.equal(result.status, 200);
});

test('closed and expired mobile sessions cannot submit scans', async t => {
  const { db, call, a } = await fixture(t);
  for (const mode of ['closed', 'expired']) {
    const session = await (await call('scan-sessions', { method: 'POST', headers: a.headers })).json();
    if (mode === 'closed') await call(`scan-sessions/${session.id}/close`, { method: 'POST', headers: a.headers });
    else db.prepare('UPDATE mrp_scan_sessions SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z', session.id);
    await denied(call('mobile-scan/events', { method: 'POST', headers: phone(session.token), body: { code: 'blocked' } }), 410);
  }
});
