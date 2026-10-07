// Static-only preview. Authenticated fulfillment uses fulfillment/server.mjs instead.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.md': 'text/plain' };
const allowed = new Set(['index.html', 'styles.css', 'config.js', 'app.js', 'README.md']);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const name = pathname === '/paddle-sandbox/' ? 'index.html' : pathname.slice('/paddle-sandbox/'.length);
  if (!pathname.startsWith('/paddle-sandbox/') || !allowed.has(name)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  fs.readFile(path.join(__dirname, name), (error, body) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(name)] + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.end(body);
  });
});
server.listen(8080, '127.0.0.1', () => console.log('Preview: http://localhost:8080/paddle-sandbox/'));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
