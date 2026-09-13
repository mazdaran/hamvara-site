import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

import {
  diffSnapshotRecords,
  evaluatePromotionReadiness,
  handleTariffRequest,
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
  assert.match(workerSource, /Production promotion is disabled in Tariff Control phase 2A/);
  assert.match(uiSource, /\/acknowledge/);
  assert.match(uiSource, /\/disposition/);
});

test('a fully reviewed run passes the review gate while production remains locked', () => {
  const readiness = evaluatePromotionReadiness({
    id: 'candidate-1',
    status: 'STAGED',
    snapshot_manifest_key: 'tariff/usitc/snapshots/candidate-1/manifest.json',
    snapshot_sha256: 'a'.repeat(64),
    snapshotEvidenceValid: true
  }, {
    total: 3,
    added: 1,
    changed: 1,
    removed: 1,
    pending: 0,
    accepted: 1,
    rejected: 1,
    no_impact: 1,
    unacknowledged: 0,
    missing_decision_evidence: 0,
    publisher_separation_violations: 0
  }, 'publisher@example.com');

  assert.equal(readiness.reviewReady, true);
  assert.equal(readiness.promotionEnabled, false);
  assert.equal(readiness.readyForPromotion, false);
  assert.equal(readiness.applyMode, 'DELTA_ONLY');
  assert.deepEqual(readiness.blockers, ['PRODUCTION_LOCKED']);
});

test('readiness gate reports incomplete review and separation blockers', () => {
  const readiness = evaluatePromotionReadiness({
    id: 'candidate-2',
    status: 'STAGED',
    snapshotEvidenceValid: true
  }, {
    total: 4,
    accepted: 1,
    pending: 1,
    unacknowledged: 2,
    missing_decision_evidence: 1,
    publisher_separation_violations: 1
  }, 'publisher@example.com');

  assert.equal(readiness.reviewReady, false);
  assert.deepEqual(readiness.blockers, [
    'PENDING_DISPOSITIONS',
    'UNACKNOWLEDGED_CHANGES',
    'DECISION_EVIDENCE_MISSING',
    'PUBLISHER_REVIEWER_SEPARATION_REQUIRED',
    'PRODUCTION_LOCKED'
  ]);
});

test('a zero-delta baseline is not eligible for promotion', () => {
  const readiness = evaluatePromotionReadiness({
    id: 'baseline-1',
    status: 'STAGED',
    snapshotEvidenceValid: true
  }, {}, 'publisher@example.com');

  assert.equal(readiness.reviewReady, false);
  assert.ok(readiness.blockers.includes('NO_ACCEPTED_CHANGES'));
  assert.ok(readiness.blockers.includes('PRODUCTION_LOCKED'));
});

test('Phase 2A UI exposes publisher readiness without a promotion control', async () => {
  const [workerSource, uiSource, htmlSource] = await Promise.all([
    fs.readFile(new URL('../src/tariff.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../../tariff-control/app.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../../tariff-control/index.html', import.meta.url), 'utf8')
  ]);

  assert.match(workerSource, /promotion-readiness/);
  assert.match(uiSource, /publisherHeaders/);
  assert.match(uiSource, /promotion-readiness/);
  assert.match(htmlSource, /id="publisherToken"/);
  assert.match(htmlSource, /id="readiness"/);
  assert.doesNotMatch(htmlSource, /id="promote"/);
});

test('publisher readiness endpoint verifies R2 evidence without database writes', async () => {
  const runId = 'candidate-endpoint';
  const manifest = JSON.stringify({
    schemaVersion: 1,
    runId,
    chapters: Array.from({ length: 97 }, (_, index) => ({ chapter: index + 1 }))
  });
  const snapshotSha256 = createHash('sha256').update(manifest).digest('hex');
  const statements = [];
  const env = {
    TARIFF_PUBLISHER_TOKEN: 'publisher-secret',
    TARIFF_PUBLISHER_ACTOR: 'publisher@example.com',
    TARIFF_SNAPSHOTS: {
      async put() {
        throw new Error('Readiness must not write to R2.');
      },
      async get(key) {
        assert.equal(key, `tariff/usitc/snapshots/${runId}/manifest.json`);
        return { text: async () => manifest };
      }
    },
    DB: {
      prepare(sql) {
        statements.push(sql);
        return {
          bind(...values) {
            return {
              async first() {
                if (sql.includes('FROM tariff_sync_runs')) {
                  assert.deepEqual(values, [runId]);
                  return {
                    id: runId,
                    status: 'STAGED',
                    snapshot_manifest_key: `tariff/usitc/snapshots/${runId}/manifest.json`,
                    snapshot_sha256: snapshotSha256
                  };
                }
                assert.deepEqual(values, ['publisher@example.com', 'publisher@example.com', runId]);
                return {
                  total: 1,
                  changed: 1,
                  accepted: 1,
                  pending: 0,
                  unacknowledged: 0,
                  missing_decision_evidence: 0,
                  publisher_separation_violations: 0
                };
              }
            };
          }
        };
      }
    }
  };
  const request = new Request(`https://api.hamvara.com/api/tariff/admin/sync-runs/${runId}/promotion-readiness`, {
    headers: { Authorization: 'Bearer publisher-secret' }
  });

  const response = await handleTariffRequest(request, env, new URL(request.url));
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.reviewReady, true);
  assert.equal(data.snapshot.evidenceValid, true);
  assert.deepEqual(data.blockers, ['PRODUCTION_LOCKED']);
  assert.ok(statements.every(sql => /^SELECT/i.test(sql.trim())));
});
