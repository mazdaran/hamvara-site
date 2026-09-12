import test from 'node:test';
import assert from 'node:assert/strict';
import {affectedItems,buildBomGraph} from '../../mrp/bom-graph.js';

function sharedState(){return{products:[{code:'FG-A'},{code:'FG-B'},{code:'SA-1',outputSku:'SA-SKU'}],boms:{'FG-A':[{sku:'COMMON',qty:1},{sku:'SA-SKU',qty:1}],'FG-B':[{sku:'COMMON',qty:1}],'SA-1':[{sku:'COMMON',qty:2},{sku:'RM-1',qty:3}]},bomProfiles:{},bomHistory:{}}}

test('global LLC assigns a shared component to its deepest occurrence',()=>{const graph=buildBomGraph(sharedState(),{onDate:'2026-09-12'});assert.equal(graph.lowLevelCode.get('FG-A'),0);assert.equal(graph.lowLevelCode.get('SA-SKU'),1);assert.equal(graph.lowLevelCode.get('COMMON'),2);assert.deepEqual(graph.levels.get(2),['COMMON','RM-1'])});

test('where-used propagation returns every affected ancestor',()=>{const graph=buildBomGraph(sharedState(),{onDate:'2026-09-12'});assert.deepEqual(affectedItems(graph,['RM-1']),['RM-1','SA-SKU','FG-A']);assert.deepEqual(affectedItems(graph,['COMMON']),['COMMON','SA-SKU','FG-A','FG-B'])});

test('cycle detection covers normal non-phantom subassemblies',()=>{const state={products:[{code:'A'},{code:'B'},{code:'C'}],boms:{A:[{sku:'B',qty:1}],B:[{sku:'C',qty:1}],C:[{sku:'A',qty:1}]}};assert.throws(()=>buildBomGraph(state),/A → B → C → A/)});
