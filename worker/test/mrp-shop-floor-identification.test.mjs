import test from 'node:test';
import assert from 'node:assert/strict';
import {identifyShopFloorCode,shopFloorIdentificationSummary,assignShopFloorBarcode,generateShopFloorBarcode,barcodeTargets} from '../../mrp/shop-floor-identification.js';

function state(){return{operators:[{id:'O1',code:'OP-001',barcode:'EMP-778',name:'Sara',shift:'A',active:true}],workCenters:[{id:'C1',code:'WC-01',barcode:'STATION-01',machineBarcode:'MACHINE-99',name:'Assembly',machine:'Press',status:'AVAILABLE',active:true}],shopFloorTasks:[{id:'T1',code:'PACKAGING',barcode:'TASK-PACK',name:'Packaging',active:true}],skus:[{code:'WIP-1',barcode:'8680001',name:'Widget WIP',active:true}],products:[],productionJobs:[{id:'J1',workOrderNo:'WO-001',batchNo:'BATCH-25',outputSku:'WIP-1',productName:'Widget',plannedQty:50,dueDate:'2026-09-20',deliveryRisk:'AT_RISK',status:'IN_PRODUCTION'}]}}

test('smart identification recognizes operator, station, machine and operation barcodes',()=>{const value=state();assert.equal(identifyShopFloorCode(value,'emp-778').match.kind,'OPERATOR');assert.equal(identifyShopFloorCode(value,'STATION-01').match.kind,'WORK_CENTER');assert.equal(identifyShopFloorCode(value,'machine-99').match.kind,'MACHINE');assert.equal(identifyShopFloorCode(value,'TASK-PACK').match.kind,'OPERATION')});

test('WIP, batch and work-order codes resolve to the active production order',()=>{const value=state();for(const code of ['8680001','BATCH-25','WO-001'])assert.equal(identifyShopFloorCode(value,code).match.id,'J1');const summary=shopFloorIdentificationSummary(value,identifyShopFloorCode(value,'8680001'));assert.deepEqual({quantity:summary.quantity,risk:summary.deliveryRisk},{quantity:50,risk:'AT_RISK'})});

test('ambiguous codes require confirmation resolution instead of auto applying',()=>{const value=state();value.workCenters[0].barcode='EMP-778';const result=identifyShopFloorCode(value,'EMP-778');assert.equal(result.status,'AMBIGUOUS');assert.equal(result.match,null);assert.equal(result.candidates.length,2)});

test('inactive and unknown records are not accepted',()=>{const value=state();value.operators[0].active=false;assert.equal(identifyShopFloorCode(value,'EMP-778').status,'NOT_FOUND');assert.equal(identifyShopFloorCode(value,'UNKNOWN').status,'NOT_FOUND')});

test('generator assigns stable unique codes and blocks duplicate manual assignment',()=>{const value=state();value.operators[0].barcode='';const generated=generateShopFloorBarcode(value,'OPERATOR','O1');assert.match(generated.barcode,/^HMV-OP-OP-001-/);assert.equal(identifyShopFloorCode(value,generated.barcode).match.kind,'OPERATOR');assert.equal(barcodeTargets(value,'MACHINE')[0].label,'Press');assert.throws(()=>assignShopFloorBarcode(value,{kind:'OPERATION',id:'T1',barcode:generated.barcode}),/already assigned/)});
