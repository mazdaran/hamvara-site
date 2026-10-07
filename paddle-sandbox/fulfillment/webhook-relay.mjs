import http from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// No datastore, credentials, filesystem serving, or configurable upstream URL.
export function createWebhookRelay({ upstreamPort = 8081 } = {}) {
  const server = http.createServer(async (req, res) => {
    const reply = (status) => {
      req.resume();
      if (!res.headersSent) res.writeHead(status, {
        'Content-Type': 'text/plain', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow',
      });
      res.end(status === 200 ? 'ok' : 'Webhook delivery rejected');
    };
    // Compare the literal request target: no queries, encoded aliases, or normalization.
    if (req.url !== '/api/sandbox/webhook') return reply(404);
    if (req.method !== 'POST') return reply(405);
    const signature = req.headers['paddle-signature'];
    if (typeof signature !== 'string' || signature.length > 4096) return reply(400);
    if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') return reply(415);
    try {
      const chunks = []; let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length <= 1024 * 1024) chunks.push(chunk);
      }
      if (length > 1024 * 1024) return reply(413);
      const raw = Buffer.concat(chunks);
      const upstream = http.request({
        hostname: '127.0.0.1', port: upstreamPort,
        path: '/api/sandbox/webhook', method: 'POST',
        headers: {
          Host: `localhost:${upstreamPort}`,
          'Content-Type': 'application/json', 'Content-Length': raw.length,
          'Paddle-Signature': signature,
        },
      }, (response) => {
        response.resume();
        // Do not disclose internal response bodies or headers (including cookies).
        response.on('end', () => reply(response.statusCode === 200 ? 200 :
          (response.statusCode >= 400 && response.statusCode <= 599 ? response.statusCode : 502)));
        response.on('error', () => reply(502));
      });
      upstream.setTimeout(4000, () => upstream.destroy());
      upstream.on('error', () => reply(502));
      res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
      upstream.end(raw);
    } catch { reply(400); }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createWebhookRelay();
  server.listen(8082, '127.0.0.1', () => console.log('Webhook-only relay: 127.0.0.1:8082 -> localhost:8081/api/sandbox/webhook. No public tunnel started.'));
  server.on('error', () => { console.error('Cannot start relay. Check port 8082.'); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
