import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  diffSnapshotRecords,
  normalizeHtsRecord,
  validateReviewDisposition
} from '../src/tariff.js';

const fixtureUrl = new URL('./fixtures/tariff-review-acceptance.json', import.meta.url);

async function loadFixture() {
  return JSON.parse(await fs.readFile(fixtureUrl, 'utf8'));
}

async function normalize(records, revision) {
  return Promise.all(records.map(record => normalizeHtsRecord(record, revision)));
}

test('production-safe acceptance fixture emits one real change of each type', async () => {
  const fixture = await loadFixture();
  const baseline = await normalize(fixture.baseline, 'acceptance-baseline');
  const candidate = await normalize(fixture.candidate, 'acceptance-candidate');
  const changes = diffSnapshotRecords(baseline, candidate);

  assert.deepEqual(changes.map(change => [change.hts10, change.changeType]), [
    ['0101290010', 'CHANGED'],
    ['0102210010', 'REMOVED'],
    ['0103100000', 'ADDED']
  ]);
});

test('acceptance fixture validates all reviewer dispositions and audit reasons', async () => {
  const fixture = await loadFixture();
  const decisions = Object.entries(fixture.reviewDecisions).map(([changeType, input]) => ({
    changeType,
    ...validateReviewDisposition(input)
  }));

  assert.deepEqual(decisions.map(item => [item.changeType, item.disposition]), [
    ['CHANGED', 'ACCEPTED'],
    ['REMOVED', 'REJECTED'],
    ['ADDED', 'NO_IMPACT']
  ]);
  assert.ok(decisions.every(item => item.reason.length > 0));
  assert.throws(
    () => validateReviewDisposition({ disposition: 'ACCEPTED', reason: '   ' }),
    /reason is required/i
  );
});

test('acceptance fixture cannot create a production test endpoint or unlock promotion', async () => {
  const [workerSource, uiSource] = await Promise.all([
    fs.readFile(new URL('../src/tariff.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../../tariff-control/app.js', import.meta.url), 'utf8')
  ]);

  assert.doesNotMatch(workerSource, /\/api\/tariff\/admin\/(fixture|test|seed)/i);
  assert.doesNotMatch(workerSource, /tariff-review-acceptance\.json/);
  assert.match(workerSource, /Production promotion is disabled in Tariff Control phase 1/);
  assert.match(uiSource, /\/acknowledge/);
  assert.match(uiSource, /\/disposition/);
});
