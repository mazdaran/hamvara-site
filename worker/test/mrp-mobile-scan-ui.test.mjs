import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('shop floor exposes secure temporary mobile camera pairing',async()=>{
  const [html,mobile,server,migration]=await Promise.all([
    readFile(new URL('../../mrp/index.html',import.meta.url),'utf8'),
    readFile(new URL('../../mrp/mobile-scan.html',import.meta.url),'utf8'),
    readFile(new URL('../src/mrp.js',import.meta.url),'utf8'),
    readFile(new URL('../migrations/0004_mrp_mobile_scan.sql',import.meta.url),'utf8')
  ]);
  assert.match(html,/id="pairMobileCamera"/);
  assert.match(html,/id="mobilePairQr"/);
  assert.match(mobile,/html5-qrcode\.min\.js/);
  assert.match(mobile,/id="connectionStatus"/);
  assert.match(server,/SCAN_SESSION_MINUTES = 15/);
  assert.match(server,/device_hash/);
  assert.match(migration,/token_hash TEXT NOT NULL UNIQUE/);
  assert.doesNotMatch(migration,/token TEXT/);
});
