import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMrpAuditSeal,verifyMrpAuditSeal} from '../src/mrp.js';

const secret='test-only-secret-with-at-least-32-characters';
test('server HMAC seal authenticates the controlled MRP release payload',async()=>{const payload={workspaceId:'W1',runId:'R1',resultFingerprint:'abc',checkpointHeadHash:'def',deltaHeadHash:'ghi'},signature=await createMrpAuditSeal(payload,secret);assert.match(signature,/^[A-Za-z0-9_-]{43}$/);assert.equal(await verifyMrpAuditSeal(payload,signature,secret),true);assert.equal(await verifyMrpAuditSeal({...payload,resultFingerprint:'tampered'},signature,secret),false)});
test('server HMAC seal is deterministic for safe persistence retries',async()=>{const payload={workspaceId:'W1',runId:'R1',releasedAt:'2026-09-12T00:00:00Z'};assert.equal(await createMrpAuditSeal(payload,secret),await createMrpAuditSeal(payload,secret));});
test('server HMAC seal rejects a weak secret',async()=>{await assert.rejects(()=>createMrpAuditSeal({runId:'R1'},'short'),/at least 32/i)});
test('release persistence is fail-safe and seals before updating controlled state',async()=>{const source=await readFile(new URL('../src/mrp.js',import.meta.url),'utf8'),sealWrite=source.indexOf('INSERT OR IGNORE INTO mrp_audit_seals'),stateWrite=source.indexOf('UPDATE mrp_state\n    SET state_json');assert.ok(sealWrite>0);assert.ok(stateWrite>sealWrite);assert.match(source,/id=`MRPSEAL-\$\{signature\}`/);});
