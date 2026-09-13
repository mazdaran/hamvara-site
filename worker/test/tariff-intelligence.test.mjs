import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterMayBeEmpty, diffSnapshotRecords, extractRecords, normalizeHtsRecord } from '../src/tariff.js';

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

test('HTS content hash is stable across source revisions', async () => {
  const record={htsno:'0101.21.0010',description:'Test animal',general:'Free',special:'A+'};
  const first=await normalizeHtsRecord(record,'revision-one');
  const second=await normalizeHtsRecord(record,'revision-two');
  assert.equal(first.contentHash,second.contentHash);
});

test('only reserved HTS chapter 77 may produce an empty snapshot', () => {
  assert.equal(chapterMayBeEmpty(77), true);
  assert.equal(chapterMayBeEmpty(76), false);
  assert.equal(chapterMayBeEmpty(78), false);
});

test('object-storage comparison emits only real deltas', async () => {
  const unchanged = await normalizeHtsRecord({ htsno:'0101.21.0010',description:'Same',general:'Free' }, 'old');
  const changedOld = await normalizeHtsRecord({ htsno:'0101.22.0010',description:'Old',general:'2%' }, 'old');
  const removed = await normalizeHtsRecord({ htsno:'0101.23.0010',description:'Removed',general:'3%' }, 'old');
  const unchangedNew = await normalizeHtsRecord({ htsno:'0101.21.0010',description:'Same',general:'Free' }, 'new');
  const changedNew = await normalizeHtsRecord({ htsno:'0101.22.0010',description:'New',general:'2%' }, 'new');
  const added = await normalizeHtsRecord({ htsno:'0101.24.0010',description:'Added',general:'4%' }, 'new');
  const changes = diffSnapshotRecords([unchanged, changedOld, removed], [unchangedNew, changedNew, added]);
  assert.deepEqual(changes.map(change => [change.hts10, change.changeType]), [
    ['0101220010','CHANGED'],
    ['0101230010','REMOVED'],
    ['0101240010','ADDED']
  ]);
});

test('chapter sync stores full snapshots outside D1 and treats the first run as baseline', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../src/tariff.js', import.meta.url), 'utf8');
  const config = await fs.readFile(new URL('../../wrangler.toml', import.meta.url), 'utf8');
  const migration = await fs.readFile(new URL('../migrations/0010_tariff_snapshot_object_storage.sql', import.meta.url), 'utf8');
  assert.match(source, /TARIFF_SNAPSHOTS/);
  assert.match(source, /previous \? diffSnapshotRecords\(previous\.records, unique\) : \[\]/);
  assert.match(source, /EMPTY_HTS_CHAPTERS = new Set\(\[77\]\)/);
  assert.match(source, /!chapterMayBeEmpty\(chapter\)/);
  assert.doesNotMatch(source, /INSERT INTO tariff_hts_stage/);
  assert.match(config, /binding = "TARIFF_SNAPSHOTS"/);
  for (const field of ['snapshot_prefix','base_snapshot_prefix','snapshot_manifest_key','content_sha256']) assert.match(migration, new RegExp(field));
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

test('resumable tariff migration stores cursor heartbeat and lease fields', async()=>{
  const fs=await import('node:fs/promises');
  const schema=await fs.readFile(new URL('../migrations/0009_tariff_resumable_sync.sql',import.meta.url),'utf8');
  for(const field of ['progress_current','progress_total','heartbeat_at','lease_token','lease_expires_at'])assert.match(schema,new RegExp(field));
});

test('manual tariff UI supports resumable chapter steps',async()=>{
  const fs=await import('node:fs/promises');
  const [source,ui]=await Promise.all([fs.readFile(new URL('../src/tariff.js',import.meta.url),'utf8'),fs.readFile(new URL('../../tariff-control/app.js',import.meta.url),'utf8')]);
  assert.match(source,/startTariffSync/);assert.match(source,/stepTariffSync/);assert.match(source,/lease_expires_at/);assert.match(source,/chapterSourceUrl/);
  assert.match(ui,/continueSync/);assert.match(ui,/resume/);
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
