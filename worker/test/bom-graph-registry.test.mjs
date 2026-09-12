import test from 'node:test';
import assert from 'node:assert/strict';
import {bomGraphCacheStats,getBomGraph,invalidateBomGraph} from '../../mrp/bom-graph-registry.js';

test('graph registry reuses non-effective BOM graph across planning dates',()=>{const state={products:[{code:'P'}],boms:{P:[{sku:'R',qty:1}]}};assert.equal(getBomGraph(state,{onDate:'2026-01-01'}),getBomGraph(state,{onDate:'2026-12-31'}));assert.deepEqual(bomGraphCacheStats(state),{version:0,entries:1,hits:1,misses:1})});

test('graph invalidation advances version and prevents stale reuse',()=>{const state={products:[{code:'P'}],boms:{P:[{sku:'R',qty:1}]}};const before=getBomGraph(state);state.boms.P[0].qty=2;invalidateBomGraph(state);const after=getBomGraph(state);assert.notEqual(before,after);assert.equal(after.outgoing.get('P')[0].quantity,2);assert.equal(bomGraphCacheStats(state).version,1)});
