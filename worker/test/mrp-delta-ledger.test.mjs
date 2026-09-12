import test from 'node:test';
import assert from 'node:assert/strict';
import {appendMrpDelta,deltasAfter,dirtyFromLedger,ledgerChangesSince,verifyMrpDeltaLedger} from '../../mrp/mrp-delta-ledger.js';
import {stableFingerprint} from '../../mrp/mrp-input-snapshot.js';

test('stable fingerprint is canonical SHA-256 including Unicode',()=>{assert.equal(stableFingerprint({b:2,a:1}),'43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777');assert.match(stableFingerprint(['ü','یحیی']),/^[0-9a-f]{64}$/)});

test('delta ledger is monotonic hash chained and replayable from sequence',()=>{const state={};appendMrpDelta(state,{entityType:'ITEM',entityKey:'R1',transactionId:'T1',effectiveAt:'2026-09-12T10:00:00Z'});appendMrpDelta(state,{entityType:'DEMAND',entityKey:'O1',transactionId:'T2',effectiveAt:'2026-09-12T10:01:00Z'});assert.deepEqual(state.mrpDeltaLedger.entries.map(row=>row.sequence),[1,2]);assert.equal(verifyMrpDeltaLedger(state).valid,true);assert.deepEqual(deltasAfter(state,1).map(row=>row.entityKey),['O1'])});

test('delta ledger detects mutation and broken sequence',()=>{const state={};appendMrpDelta(state,{entityType:'ITEM',entityKey:'R1',transactionId:'T1'});state.mrpDeltaLedger.entries[0].entityKey='TAMPERED';assert.deepEqual(verifyMrpDeltaLedger(state),{valid:false,sequence:1,reason:'BROKEN_SEQUENCE_OR_HASH'})});

test('trusted anchor returns routable dirty entities without a snapshot scan',()=>{const state={mrpDeltaLedger:{schemaVersion:2,hashAlgorithm:'SHA-256',lastSequence:0,headHash:'GENESIS',entries:[],enforced:true}};appendMrpDelta(state,{entityType:'ITEM',entityKey:'R1',transactionId:'T1'});const anchor={sequence:1,headHash:state.mrpDeltaLedger.headHash};appendMrpDelta(state,{entityType:'DEMAND',entityKey:'O1',transactionId:'T2'});const changes=ledgerChangesSince(state,anchor);assert.equal(changes.trusted,true);assert.deepEqual(dirtyFromLedger(changes.entries).dirtyOrders,['O1'])});

test('unknown delta disables the fast path',()=>{const state={};appendMrpDelta(state,{entityType:'UNKNOWN',entityKey:'X',transactionId:'T1'});assert.equal(ledgerChangesSince(state,{sequence:0,headHash:'GENESIS'}).trusted,false)});

test('first controlled mutation enforces a current imported delta ledger',()=>{const state={mrpDeltaLedger:{schemaVersion:2,hashAlgorithm:'SHA-256',lastSequence:0,headHash:'GENESIS',entries:[]}};appendMrpDelta(state,{entityType:'ITEM',entityKey:'R1'});assert.equal(state.mrpDeltaLedger.enforced,true);assert.equal(ledgerChangesSince(state,{sequence:0,headHash:'GENESIS'}).trusted,true)});

test('legacy hash ledger is archived and requires a new full baseline',()=>{const state={mrpDeltaLedger:{schemaVersion:1,lastSequence:1,headHash:'12345678',entries:[{sequence:1,hash:'12345678'}],enforced:true}};appendMrpDelta(state,{entityType:'ITEM',entityKey:'R1'});assert.equal(state.mrpDeltaLedger.schemaVersion,2);assert.equal(state.mrpDeltaLedger.hashAlgorithm,'SHA-256');assert.equal(state.mrpDeltaLedger.legacyArchive.entryCount,1);assert.equal(state.mrpDeltaLedger.requiresFullBaseline,true);assert.equal(state.mrpDeltaLedger.enforced,false)});
