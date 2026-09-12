import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRecords, normalizeHtsRecord, runTariffSync } from '../src/tariff.js';

test('USITC payload normalization preserves HTS text and duty fields', async () => {
  const payload = { results: [{ htsno: '0101.21.0010', description: 'Test animal', general: 'Free', special: 'A+', units: ['No.'] }] };
  const rows = extractRecords(payload);
  const item = await normalizeHtsRecord(rows[0], 'revision-1');
  assert.equal(item.hts10, '0101210010');
  assert.equal(item.generalRateRaw, 'Free');
  assert.equal(item.specialRateRaw, 'A+');
  assert.deepEqual(item.units, ['No.']);
  assert.match(item.contentHash, /^[0-9a-f]{64}$/);
});

test('manual sync refuses an unexpectedly small full-table response', async () => {
  const log = [];
  const statement = sql => ({ bind(...args) { log.push({ sql, args }); return this; }, async run() { return { success: true }; }, async all() { return { results: [] }; } });
  const env = { DB: { prepare: statement, async batch(items) { return items.map(() => ({ success: true })); } } };
  const fetchImpl = async () => new Response(JSON.stringify([{ htsno:'0101.21.0010', description:'Only row' }]), { status: 200, headers: { 'content-type':'application/json' } });
  await assert.rejects(() => runTariffSync(env, { fetchImpl, runId:'small-run', scheduledAt:'2026-09-11T06:00:00.000Z' }), /only 1 usable HTS rows/);
  assert.equal(log.some(entry => entry.sql.includes("status='FAILED'")), true);
});

test('HTS content hash is stable across source revisions', async () => {
  const record={htsno:'0101.21.0010',description:'Test animal',general:'Free',special:'A+'};
  const first=await normalizeHtsRecord(record,'revision-one');
  const second=await normalizeHtsRecord(record,'revision-two');
  assert.equal(first.contentHash,second.contentHash);
});

test('successful collection remains staged and does not update production HTS lines', async () => {
  const log=[];
  const statement=sql=>({bind(...args){log.push({sql,args});return this;},async run(){return{success:true};},async all(){return{results:[]};}});
  const env={DB:{prepare:statement,async batch(items){return items.map(()=>({success:true}));}}};
  const fetchImpl=async()=>new Response(JSON.stringify([{htsno:'0101.21.0010',description:'Candidate'}]),{status:200});
  const result=await runTariffSync(env,{fetchImpl,allowSmallDataset:true,runId:'staged-run',scheduledAt:'2026-09-11T06:00:00.000Z'});
  assert.equal(result.status,'STAGED');
  assert.equal(log.some(entry=>entry.sql.includes('UPDATE tariff_hts_lines')),false);
  assert.equal(log.some(entry=>entry.sql.includes("status='STAGED'")),true);
});

test('controlled rule workflow and published-only API remain in source', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/tariff.js', import.meta.url), 'utf8'));
  assert.match(source, /status='PUBLISHED'/);
  assert.match(source, /preparer cannot verify/);
  assert.match(source, /verifier cannot publish/);
  assert.match(source, /PRIMARY_PENDING/);
});

test('phase 1 keeps tariff collection manual and production promotion locked', async () => {
  const fs = await import('node:fs/promises');
  const worker = await fs.readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const tariff = await fs.readFile(new URL('../src/tariff.js', import.meta.url), 'utf8');
  assert.doesNotMatch(worker, /runScheduledTariffSync/);
  assert.match(tariff, /Production promotion is disabled in Tariff Control phase 1/);
  assert.match(tariff, /acknowledge\|disposition/);
  assert.match(tariff, /'ACCEPTED','REJECTED','NO_IMPACT'/);
});

test('phase 1 migration stores review disposition and acknowledgment evidence', async () => {
  const fs = await import('node:fs/promises');
  const schema = await fs.readFile(new URL('../migrations/0005_tariff_intelligence.sql', import.meta.url), 'utf8');
  for (const field of ['disposition','disposition_at','disposition_by','disposition_reason','acknowledged_at','acknowledged_by']) assert.match(schema, new RegExp(field));
});

test('reference BOM independently reconciles material and duty totals', async () => {
  const fs = await import('node:fs/promises');
  const csv = await fs.readFile(new URL('../../tariff-impact/bom-template-v2.csv', import.meta.url), 'utf8');
  const lines = csv.trim().split(/\r?\n/).map(line => line.split(','));
  const headers = lines.shift();
  const rows = lines.map(values => Object.fromEntries(headers.map((header,index) => [header, values[index] || ''])));
  const qty = { 'ST-23':6, 'WD-1':0.2, 'WN-3':1, 'AL-7':1, 'LT-2':1, 'WR-5':1, 'DK-4':12 };
  const material = rows.filter(row => qty[row.sku]).reduce((sum,row) => sum + Number(row.unit_cost_usd) * qty[row.sku], 0);
  assert.equal(material.toFixed(2), '819.80');
  const duty = rows.filter(row => qty[row.sku]).reduce((sum,row) => {
    const mfn=Number(row.mfn_rate_pct||0),additional=Number(row.additional_duty_pct||0),s232=Number(row.section232_rate_pct||0);
    const legalRate=mfn+(s232||additional),fees=row.sourcing==='import'?(0.3464+(row.transport_mode==='ocean'?0.125:0)):0,pass=row.sourcing==='domestic_imported'?Number(row.pass_through_pct||100)/100:1;
    return sum + Number(row.unit_cost_usd) * qty[row.sku] * (legalRate+fees) / 100 * pass;
  },0);
  assert.equal(duty.toFixed(2), '132.77');
});
