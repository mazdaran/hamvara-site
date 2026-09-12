import test from 'node:test';
import assert from 'node:assert/strict';
import {netChangeScope} from '../../mrp/net-change-scope.js';

test('dirty component propagates through where-used to every consuming order',()=>{const state={products:[{code:'FG1'},{code:'FG2'},{code:'SA',outputSku:'SA-SKU'}],orders:[{orderNo:'O1',productCode:'FG1'},{orderNo:'O2',productCode:'FG2'}],boms:{FG1:[{sku:'SA-SKU',qty:1}],FG2:[{sku:'OTHER',qty:1}],SA:[{sku:'RAW',qty:2}]}};const scope=netChangeScope(state,{dirtyItems:['RAW'],dirtyProducts:[],dirtyOrders:[],forecastChanged:false,contextChanged:false},{onDate:'2026-09-12'});assert.deepEqual(scope.impactedItems,['FG1','SA-SKU','RAW']);assert.deepEqual(scope.impactedOrders,['O1']);assert.equal(scope.requiresFullFallback,false)});
