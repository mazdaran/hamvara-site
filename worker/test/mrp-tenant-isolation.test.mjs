import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,digest} from './tenant-fixture.mjs';
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
