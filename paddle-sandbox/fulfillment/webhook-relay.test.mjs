import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createWebhookRelay } from './webhook-relay.mjs';

test('relay restricts routes and preserves raw bytes/signature without leaking upstream headers', async () => {
  const received = [];
  const upstream = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
    res.writeHead(401, { 'Set-Cookie': 'internal=value' }); res.end('private upstream detail');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const relay = createWebhookRelay({ upstreamPort: upstream.address().port });
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  const send = (path, method = 'POST', body = Buffer.from('{}'), extra = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: relay.address().port, path, method, agent: false,
      headers: { 'Content-Length': body.length, 'Paddle-Signature': 'test-header-preservation-only', Cookie: 'private=session', ...extra } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk);
      resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() });
    }); req.on('error', error => reject(new Error(`${method} ${path}: ${error.message}`))); req.end(body);
  });
  try {
    for (const path of ['/', '/paddle-sandbox/', '/api/sandbox/login', '/api/sandbox/checkout',
      '/paddle-sandbox/config.js', '/paddle-sandbox/fulfillment/data/sandbox.sqlite',
      '/api/sandbox/webhook?x=1', '/api/sandbox/%77ebhook', '/api/sandbox/webhook/',
      '/api/sandbox/../sandbox/webhook', 'http://localhost/api/sandbox/webhook']) {
      assert.equal((await send(path)).status, 404, path);
    }
    for (const method of ['GET', 'PUT', 'OPTIONS', 'HEAD']) assert.equal((await send('/api/sandbox/webhook', method)).status, 405);
    assert.equal(received.length, 0);
    assert.equal((await send('/api/sandbox/webhook', 'POST', Buffer.from('{}'), { 'Content-Encoding': 'gzip' })).status, 415);
    assert.equal((await send('/api/sandbox/webhook', 'POST', Buffer.alloc(1024 * 1024 + 1))).status, 413);
    const raw = Buffer.from(' { "unicode": "é",\r\n "spacing":  1 }\n');
    const result = await send('/api/sandbox/webhook', 'POST', raw);
    assert.equal(result.status, 401);
    assert.equal(result.headers['set-cookie'], undefined);
    assert.equal(result.body.includes('private upstream'), false);
    assert.equal(received.length, 1);
    assert.deepEqual(received[0].body, raw);
    assert.equal(received[0].headers['paddle-signature'], 'test-header-preservation-only');
    assert.equal(received[0].headers.host, `localhost:${upstream.address().port}`);
    assert.equal(received[0].headers.cookie, undefined);
  } finally {
    await new Promise(resolve => relay.close(resolve));
    await new Promise(resolve => upstream.close(resolve));
  }
});
