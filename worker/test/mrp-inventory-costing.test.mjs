import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryCostReport,issueInventoryCost,normalizeInventoryCostState,receiveInventoryCost,reverseInventoryCostTransfer,setInventoryCostMethod,transferInventoryCost} from '../../mrp/inventory-costing.js';

function state(profile='IFRS_TFRS'){const value={settings:{currency:'TRY'},accountingSettings:{profile,baseCurrency:'TRY'},skus:[{code:'RM-1',name:'Material',cost:10}],auditTrail:[]};normalizeInventoryCostState(value);return value}

test('IFRS/TFRS profile blocks LIFO',()=>{const value=state();assert.throws(()=>setInventoryCostMethod(value,'RM-1','LIFO'),/US GAAP/)});

test('FIFO consumes the oldest cost layer',()=>{const value=state();setInventoryCostMethod(value,'RM-1','FIFO');receiveInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',qty:10,unitCost:5,date:'2026-09-01'});receiveInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',qty:10,unitCost:8,date:'2026-09-02'});const issue=issueInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',qty:12});assert.equal(issue.value,66);assert.deepEqual(issue.layers.map(item=>item.quantity),[10,2]);assert.equal(inventoryCostReport(value)[0].value,64)});

test('weighted average recalculates after every receipt',()=>{const value=state();setInventoryCostMethod(value,'RM-1','WEIGHTED_AVERAGE');receiveInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',qty:10,unitCost:5});receiveInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',qty:10,unitCost:9});const report=inventoryCostReport(value)[0];assert.equal(report.averageCost,7);assert.equal(issueInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',qty:4}).value,28)});

test('standard cost keeps inventory at standard and records purchase variance',()=>{const value=state();value.skus[0].standardCost=10;const receipt=receiveInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',qty:5,unitCost:12});assert.equal(receipt.value,50);assert.equal(receipt.variance,10);assert.equal(issueInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',qty:2}).value,20)});

test('US GAAP profile permits LIFO and consumes newest layer',()=>{const value=state('US_GAAP');setInventoryCostMethod(value,'RM-1','LIFO');receiveInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',qty:10,unitCost:5,date:'2026-09-01'});receiveInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',qty:10,unitCost:8,date:'2026-09-02'});assert.equal(issueInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',qty:12}).value,90)});

test('LIFO transfer preserves exact cost layers and reversal restores both warehouses',()=>{const value=state('US_GAAP');setInventoryCostMethod(value,'RM-1','LIFO');receiveInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',qty:10,unitCost:5,date:'2026-09-01'});receiveInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',qty:10,unitCost:8,date:'2026-09-02'});const transfer=transferInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',destinationWarehouse:'WH-SF',qty:12,reference:'T-1'});assert.equal(transfer.value,90);assert.deepEqual(transfer.layers.map(row=>row.unitCost),[8,5]);assert.equal(value.inventoryValuations['RM-1|WH-SF'].value,90);reverseInventoryCostTransfer(value,{outMovementId:transfer.out.id,inMovementId:transfer.in.id});assert.equal(value.inventoryValuations['RM-1|WH-RM'].value,130);assert.equal(value.inventoryValuations['RM-1|WH-SF'].quantity,0)});

test('cost method cannot change while valued inventory remains',()=>{const value=state();receiveInventoryCost(value,{sku:'RM-1',warehouse:'WH-RM',qty:1,unitCost:10});assert.throws(()=>setInventoryCostMethod(value,'RM-1','FIFO'),/cannot change/)});

test('cost-method changes are audited',()=>{const value=state();setInventoryCostMethod(value,'RM-1','FIFO',{user:'controller'});assert.equal(value.auditTrail[0].action,'INVENTORY_COST_METHOD_CHANGED');assert.equal(value.auditTrail[0].reference,'RM-1')});
