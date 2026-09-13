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

test('acceptance fixture cannot create a production test endpoint or bypass promotion controls', async () => {
  const [workerSource, uiSource] = await Promise.all([
    fs.readFile(new URL('../src/tariff.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../../tariff-control/app.js', import.meta.url), 'utf8')
  ]);

  assert.doesNotMatch(workerSource, /\/api\/tariff\/admin\/(fixture|test|seed)/i);
  assert.doesNotMatch(workerSource, /tariff-review-acceptance\.json/);
  assert.match(workerSource, /TARIFF_PRODUCTION_PROMOTION_ENABLED/);
  assert.match(workerSource, /confirmationText/);
  assert.match(workerSource, /only the current production head can be rolled back/i);
  assert.match(uiSource, /\/acknowledge/);
  assert.match(uiSource, /\/disposition/);
});

test('a fully reviewed run passes the review gate while production remains locked', () => {
  const readiness = evaluatePromotionReadiness({
    id: 'candidate-1',
    status: 'STAGED',
    snapshot_manifest_key: 'tariff/usitc/snapshots/candidate-1/manifest.json',
    snapshot_sha256: 'a'.repeat(64),
    snapshotEvidenceValid: true,
    productionExists: true,
    productionLineageValid: true,
    productionHeadBatchId: 'batch-0'
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
    snapshotEvidenceValid: true,
    productionExists: true,
    productionLineageValid: true
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

test('a zero-delta verified snapshot is eligible for first baseline activation but remains locked by default', () => {
  const readiness = evaluatePromotionReadiness({
    id: 'baseline-1',
    status: 'STAGED',
    snapshotEvidenceValid: true,
    productionExists: false
  }, {}, 'publisher@example.com');

  assert.equal(readiness.reviewReady, true);
  assert.equal(readiness.readyForPromotion, false);
  assert.equal(readiness.applyMode, 'BASELINE_ACTIVATION');
  assert.equal(readiness.confirmationText, 'ACTIVATE BASELINE');
  assert.deepEqual(readiness.blockers, ['PRODUCTION_LOCKED']);
});

test('Phase 2B UI exposes guarded promotion and head-only rollback controls', async () => {
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
  assert.match(htmlSource, /id="promote" disabled/);
  assert.match(htmlSource, /id="rollback" class="secondary" disabled/);
  assert.match(uiSource, /confirmationText/);
  assert.match(uiSource, /production-state/);
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
                    snapshot_prefix: `tariff/usitc/snapshots/${runId}`,
                    base_snapshot_prefix: 'tariff/usitc/snapshots/baseline',
                    base_overlay_key: 'tariff/usitc/promotions/batch-0.json',
                    base_overlay_sha256: 'b'.repeat(64),
                    snapshot_manifest_key: `tariff/usitc/snapshots/${runId}/manifest.json`,
                    snapshot_sha256: snapshotSha256
                  };
                }
                if (sql.includes('FROM tariff_production_state')) {
                  assert.deepEqual(values, []);
                  return {
                    singleton: 1,
                    base_run_id: 'baseline',
                    base_snapshot_prefix: 'tariff/usitc/snapshots/baseline',
                    base_manifest_key: 'tariff/usitc/snapshots/baseline/manifest.json',
                    base_snapshot_sha256: 'c'.repeat(64),
                    head_batch_id: 'batch-0',
                    overlay_artifact_key: 'tariff/usitc/promotions/batch-0.json',
                    overlay_artifact_sha256: 'b'.repeat(64)
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
  assert.equal(data.applyMode, 'DELTA_ONLY');
  assert.equal(data.snapshot.evidenceValid, true);
  assert.deepEqual(data.blockers, ['PRODUCTION_LOCKED']);
  assert.ok(statements.every(sql => /^SELECT/i.test(sql.trim())));
});

test('first production baseline requires the enabled flag and an exact confirmation', async () => {
  const runId = 'baseline-endpoint';
  const manifestKey = `tariff/usitc/snapshots/${runId}/manifest.json`;
  const manifest = JSON.stringify({
    schemaVersion: 1,
    runId,
    chapters: Array.from({ length: 97 }, (_, index) => ({ chapter: index + 1 }))
  });
  const snapshotSha256 = createHash('sha256').update(manifest).digest('hex');
  const writes = [];
  const batches = [];
  const env = {
    TARIFF_PUBLISHER_TOKEN: 'publisher-secret',
    TARIFF_PUBLISHER_ACTOR: 'publisher@example.com',
    TARIFF_PRODUCTION_PROMOTION_ENABLED: 'true',
    TARIFF_SNAPSHOTS: {
      async get(key) {
        assert.equal(key, manifestKey);
        return { text: async () => manifest };
      },
      async put(key, value, options) {
        writes.push({ key, value, options });
      }
    },
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            const statement = { sql, values };
            return {
              ...statement,
              async first() {
                if (sql.includes('FROM tariff_sync_runs')) {
                  return {
                    id: runId,
                    status: 'STAGED',
                    source_revision: 'baseline-revision',
                    snapshot_prefix: `tariff/usitc/snapshots/${runId}`,
                    base_snapshot_prefix: null,
                    base_overlay_key: null,
                    base_overlay_sha256: null,
                    snapshot_manifest_key: manifestKey,
                    snapshot_sha256: snapshotSha256
                  };
                }
                if (sql.includes('FROM tariff_production_state')) return null;
                if (sql.includes('FROM tariff_hts_changes')) return { total: 0 };
                throw new Error(`Unexpected first query: ${sql}`);
              },
              async all() {
                if (sql.includes('FROM tariff_hts_changes')) return { results: [] };
                throw new Error(`Unexpected all query: ${sql}`);
              }
            };
          }
        };
      },
      async batch(statements) {
        batches.push(statements);
        return statements.map(() => ({ success: true }));
      }
    }
  };
  const request = new Request(`https://api.hamvara.com/api/tariff/admin/sync-runs/${runId}/promote`, {
    method: 'POST',
    headers: { Authorization: 'Bearer publisher-secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Activate the independently verified initial baseline.', confirmation: 'ACTIVATE BASELINE' })
  });

  const response = await handleTariffRequest(request, env, new URL(request.url));
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.status, 'PROMOTED');
  assert.equal(data.mode, 'BASELINE_ACTIVATION');
  assert.equal(data.appliedCount, 0);
  assert.equal(writes.length, 1);
  assert.match(writes[0].key, /^tariff\/usitc\/promotions\/.+\.json$/);
  const artifact = JSON.parse(writes[0].value);
  assert.deepEqual(artifact.overlay, []);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 4);
  assert.ok(batches[0].some(statement => statement.sql.includes('INSERT INTO tariff_production_state')));
  assert.ok(batches[0].some(statement => statement.sql.includes('INSERT INTO tariff_promotion_events')));
});

test('rollback accepts only the active production head and records one atomic audit batch', async () => {
  const batchId = 'batch-head';
  const statements = [];
  const env = {
    TARIFF_PUBLISHER_TOKEN: 'publisher-secret',
    TARIFF_PUBLISHER_ACTOR: 'publisher@example.com',
    TARIFF_PRODUCTION_PROMOTION_ENABLED: 'true',
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              sql,
              values,
              async first() {
                if (sql.includes('FROM tariff_promotion_batches')) {
                  return {
                    id: batchId,
                    run_id: 'baseline-endpoint',
                    status: 'PROMOTED',
                    previous_batch_id: null,
                    artifact_key: `tariff/usitc/promotions/${batchId}.json`,
                    artifact_sha256: 'd'.repeat(64)
                  };
                }
                if (sql.includes('FROM tariff_production_state')) return { head_batch_id: batchId };
                throw new Error(`Unexpected first query: ${sql}`);
              }
            };
          }
        };
      },
      async batch(items) {
        statements.push(...items);
        return items.map(() => ({ success: true }));
      }
    }
  };
  const request = new Request(`https://api.hamvara.com/api/tariff/admin/promotions/${batchId}/rollback`, {
    method: 'POST',
    headers: { Authorization: 'Bearer publisher-secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Restore the pre-activation state.', confirmation: `ROLLBACK ${batchId}` })
  });

  const response = await handleTariffRequest(request, env, new URL(request.url));
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.status, 'ROLLED_BACK');
  assert.equal(data.restoredBatchId, null);
  assert.equal(statements.length, 4);
  assert.ok(statements.some(statement => statement.sql.includes('DELETE FROM tariff_production_state')));
  assert.ok(statements.some(statement => statement.sql.includes("'ROLLED_BACK'")));
});
