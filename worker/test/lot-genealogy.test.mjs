import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionJob,releaseProductionJob,issueProductionJob,completeProductionJob,applyProductionQualityDecision} from '../../mrp/production-workflow.js';
import {allocateTrackedLots,lotGenealogyReport} from '../../mrp/lot-genealogy.js';
import {ensureBomProfile,saveBomRevision} from '../../mrp/bom-workflow.js';
import {createAccountingPeriod,normalizeFinancialState} from '../../mrp/financial-core.js';

function sampleState(){
  const state={products:[{code:'P1',name:'Finished Product',unit:'PCS'}],skus:[{code:'RM1',name:'Tracked Resin',unit:'KG',cost:2,warehouse:'WH-RM',lotTracked:true,issuePolicy:'FIFO'}],warehouses:[{code:'WH-RM'},{code:'WH-FG'},{code:'WH-QA'},{code:'WH-SF'}],orders:[{id:'O1',orderNo:'ORD-1',productCode:'P1',qty:5}],boms:{P1:[{sku:'RM1',warehouse:'WH-RM',qty:2,wastePercent:0}]},bomProfiles:{},bomHistory:{},stock:{RM1:{'WH-RM':12,'WH-SF':0,reserved:0}},productionJobs:[],qualityInspections:[],auditTrail:[],inventoryMovements:[],inventoryLots:[{id:'L1',sku:'RM1',warehouse:'WH-RM',lotNo:'RAW-A',receivedAt:'2026-08-01T00:00:00Z',quantity:6},{id:'L2',sku:'RM1',warehouse:'WH-RM',lotNo:'RAW-B',receivedAt:'2026-08-02T00:00:00Z',quantity:6}],lotGenealogy:[]};
  normalizeFinancialState(state);createAccountingPeriod(state,{id:'P1',code:'2026',startDate:'2026-01-01',endDate:'2026-12-31'});ensureBomProfile(state,'P1').effectiveDate='2026-01-01';saveBomRevision(state,'P1',{at:'2026-01-01T00:00:00Z'});return state;
}

test('production records FIFO source lots against the finished batch in both trace directions',()=>{
  const state=sampleState(),job=createProductionJob(state,{id:'J1',workOrderNo:'WO-1',batchNo:'FG-BATCH-1',order:state.orders[0],createdAt:'2026-09-11T08:00:00Z'});releaseProductionJob(state,job.id);issueProductionJob(state,job.id,'2026-09-11T09:00:00Z');assert.deepEqual(job.materials[0].lotAllocations.map(row=>[row.lotNo,row.quantity]),[['RAW-A',6],['RAW-B',4]]);completeProductionJob(state,job.id,{completedQty:5,scrapQty:0,completedAt:'2026-09-11T10:00:00Z',inspectionId:'Q1'});
  const forward=lotGenealogyReport(state,'RAW-A'),backward=lotGenealogyReport(state,'FG-BATCH-1');assert.equal(forward.outputBatches[0].batchNo,'FG-BATCH-1');assert.deepEqual(backward.inputLots.map(row=>row.lotNo),['RAW-A','RAW-B']);assert.equal(state.inventoryLots.find(row=>row.lotNo==='FG-BATCH-1').warehouse,'WH-QA');state.qualityInspections[0].result='ACCEPTED';applyProductionQualityDecision(state,'Q1');assert.equal(state.inventoryLots.find(row=>row.lotNo==='FG-BATCH-1').warehouse,'WH-FG');assert.equal(state.lotGenealogy[0].status,'RELEASED');
});

test('FEFO trace allocation excludes expired lots and takes the earliest valid expiry',()=>{
  const state=sampleState();state.skus[0].issuePolicy='FEFO';state.inventoryLots=[{id:'X',sku:'RM1',warehouse:'WH-RM',lotNo:'EXPIRED',expiryDate:'2026-09-01',receivedAt:'2026-01-01',quantity:20},{id:'V2',sku:'RM1',warehouse:'WH-RM',lotNo:'LATE',expiryDate:'2026-12-01',receivedAt:'2026-01-01',quantity:20},{id:'V1',sku:'RM1',warehouse:'WH-RM',lotNo:'EARLY',expiryDate:'2026-10-01',receivedAt:'2026-02-01',quantity:20}];const allocations=allocateTrackedLots(state,{sku:'RM1',warehouse:'WH-RM',quantity:10,policy:'FEFO',onDate:'2026-09-11'});assert.deepEqual(allocations.map(row=>row.lotNo),['EARLY']);
});
