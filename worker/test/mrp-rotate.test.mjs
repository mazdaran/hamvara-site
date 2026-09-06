import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMrpRequest } from '../src/mrp.js';

function request(token, body = { username: 'owner' }, path = '/api/mrp/workspaces/hamvara/rotate-key') {
  return new Request(`https://example.test${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

function database(actor) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            async first() {
              if (sql.includes('JOIN mrp_users')) return actor;
              return null;
            },
            async run() {
              if (sql.includes('UPDATE mrp_users')) return { meta: { changes: 1 } };
              return { meta: { changes: 1 } };
            }
          };
        }
      };
    }
  };
}

test('rejects an invalid administrator token before database access', async () => {
  const DB = database(null);
  await assert.rejects(
    handleMrpRequest(request('wrong-token'), { DB, MRP_ADMIN_TOKEN: 'correct-token' }, new URL(request('wrong-token').url)),
    error => error.status === 401 && error.message === 'Invalid administrator token.'
  );
  assert.equal(DB.calls.length, 0);
});

test('returns 404 without leaking whether an inactive or missing user exists', async () => {
  const DB = database(null);
  const req = request('correct-token');
  await assert.rejects(
    handleMrpRequest(req, { DB, MRP_ADMIN_TOKEN: 'correct-token' }, new URL(req.url)),
    error => error.status === 404 && error.message === 'Active workspace user not found.'
  );
});

test('rotates the hash and writes an audit event while returning the key once', async () => {
  const DB = database({
    workspace_id: 'workspace-id',
    slug: 'hamvara',
    name: 'Hamvara',
    user_id: 'user-id',
    username: 'owner',
    role: 'CEO'
  });
  const req = request('correct-token');
  const response = await handleMrpRequest(req, { DB, MRP_ADMIN_TOKEN: 'correct-token' }, new URL(req.url));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.workspace.slug, 'hamvara');
  assert.equal(body.user.username, 'owner');
  assert.match(body.accessKey, /^[A-Za-z0-9_-]{32}$/);

  const update = DB.calls.find(call => call.sql.includes('UPDATE mrp_users'));
  assert.ok(update);
  assert.notEqual(update.values[0], body.accessKey);
  assert.equal(update.values[1], 'user-id');

  const expectedHashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.accessKey)));
  let binary = '';
  expectedHashBytes.forEach(byte => { binary += String.fromCharCode(byte); });
  const expectedHash = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(update.values[0], expectedHash);

  const audit = DB.calls.find(call => call.sql.includes("'access_key.rotated'"));
  assert.ok(audit);
  assert.deepEqual(audit.values.slice(0, 2), ['workspace-id', 'user-id']);
});

test('supports the short rotation endpoint with workspace in the JSON body', async () => {
  const DB = database({
    workspace_id: 'workspace-id',
    slug: 'hamvara',
    name: 'Hamvara',
    user_id: 'user-id',
    username: 'owner',
    role: 'CEO'
  });
  const req = request(
    'correct-token',
    { workspace: 'hamvara', username: 'owner' },
    '/api/mrp/rotate-key'
  );
  const response = await handleMrpRequest(req, { DB, MRP_ADMIN_TOKEN: 'correct-token' }, new URL(req.url));
  assert.equal(response.status, 200);
});

test('activates a caller-supplied key without echoing it in the response', async () => {
  const DB = database({
    workspace_id: 'workspace-id',
    slug: 'hamvara',
    name: 'Hamvara',
    user_id: 'user-id',
    username: 'owner',
    role: 'CEO'
  });
  const newAccessKey = 'A-secure-key-that-was-saved-before-send-123456789';
  const req = request(
    'correct-token',
    { workspace: 'hamvara', username: 'owner', newAccessKey },
    '/api/mrp/rotate-key'
  );
  const response = await handleMrpRequest(req, { DB, MRP_ADMIN_TOKEN: 'correct-token' }, new URL(req.url));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.accessKey, undefined);

  const update = DB.calls.find(call => call.sql.includes('UPDATE mrp_users'));
  const expectedHashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(newAccessKey)));
  let binary = '';
  expectedHashBytes.forEach(byte => { binary += String.fromCharCode(byte); });
  const expectedHash = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(update.values[0], expectedHash);
});

test('rejects a weak caller-supplied key', async () => {
  const DB = database({
    workspace_id: 'workspace-id',
    slug: 'hamvara',
    name: 'Hamvara',
    user_id: 'user-id',
    username: 'owner',
    role: 'CEO'
  });
  const req = request(
    'correct-token',
    { workspace: 'hamvara', username: 'owner', newAccessKey: 'too-short' },
    '/api/mrp/rotate-key'
  );
  await assert.rejects(
    handleMrpRequest(req, { DB, MRP_ADMIN_TOKEN: 'correct-token' }, new URL(req.url)),
    error => error.status === 400 && error.message.includes('32 to 128')
  );
});
