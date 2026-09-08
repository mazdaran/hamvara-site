import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionJob,releaseProductionJob,issueProductionJob,completeProductionJob,cancelProductionJob,applyProductionQualityDecision} from '../../mrp/production-workflow.js';

function sampleState(){return{products:[{code:'P-1',name:'Product 1',unit:'ADET'}],skus:[{code:'RM-1',name:'Material',unit:'KG',cost:4,warehouse:'WH-RM'}],orders:[{id:'o1',orderNo:'ORD-1',productCode:'P-1',qty:4,priority:'URGENT'}],boms:{'P-1':[{sku:'RM-1',warehouse:'WH-RM',qty:2.5}]},stock:{'RM-1':{'WH-RM':12,'WH-SF':0,reserved:0}},productionJobs:[],qualityInspections:[],auditTrail:[],inventoryMovements:[]}}

test('production completion waits in quarantine until accepted FQC',()=>{
  const state=sampleState(),order=state.orders[0];
  const job=createProductionJob(state,{id:'j1',workOrderNo:'WO-0001',order,createdAt:'2026-09-07'});
  assert.equal(job.materials[0].required,10);assert.equal(order.productionStatus,'PLANNED');
  releaseProductionJob(state,'j1','release');assert.equal(state.stock['RM-1'].reserved,10);
  issueProductionJob(state,'j1','issue');assert.equal(state.stock['RM-1']['WH-RM'],2);assert.equal(state.stock['RM-1']['WH-SF'],10);assert.equal(state.stock['RM-1'].reserved,0);
  completeProductionJob(state,'j1',{completedQty:3,scrapQty:1,completedAt:'2026-09-07T12:00:00Z',inspectionId:'fqc1',inspectionNo:'FQC-0001',meta:{user:'operator',device:'LINE-1'}});
  assert.equal(state.stock['RM-1']['WH-SF'],0);assert.equal(state.stock['FG-P-1']['WH-QA'],3);assert.equal(state.stock['FG-P-1']['WH-FG']||0,0);assert.equal(state.skus.at(-1).type,'FINISHED_GOOD');assert.equal(order.productionStatus,'AWAITING_FQC');assert.equal(state.qualityInspections[0].type,'FQC');
  state.qualityInspections[0].result='ACCEPTED';applyProductionQualityDecision(state,'fqc1',{decidedAt:'2026-09-07T13:00:00Z',meta:{user:'quality',device:'QC-01'}});
  assert.equal(state.stock['FG-P-1']['WH-QA'],0);assert.equal(state.stock['FG-P-1']['WH-FG'],3);assert.equal(order.productionStatus,'COMPLETED');assert.equal(state.productionJobs[0].batchNo.startsWith('BATCH-'),true);assert.equal(state.auditTrail[0].user,'quality');
});

test('rejected FQC keeps the finished batch in quarantine under quality hold',()=>{const state=sampleState(),order=state.orders[0];createProductionJob(state,{id:'j1',workOrderNo:'WO-0001',order});releaseProductionJob(state,'j1');issueProductionJob(state,'j1');completeProductionJob(state,'j1',{completedQty:4,scrapQty:0,inspectionId:'fqc1'});state.qualityInspections[0].result='REJECTED';applyProductionQualityDecision(state,'fqc1',{ncrNo:'NCR-0001'});assert.equal(state.stock['FG-P-1']['WH-QA'],4);assert.equal(state.stock['FG-P-1']['WH-FG']||0,0);assert.equal(state.productionJobs[0].status,'QUALITY_HOLD');assert.equal(state.productionJobs[0].ncrNo,'NCR-0001')});

test('production prevents duplicate work orders and insufficient releases',()=>{
  const state=sampleState(),order=state.orders[0];createProductionJob(state,{id:'j1',workOrderNo:'WO-0001',order});
  assert.throws(()=>createProductionJob(state,{id:'j2',workOrderNo:'WO-0002',order}),/already exists/);
  state.stock['RM-1']['WH-RM']=9;assert.throws(()=>releaseProductionJob(state,'j1'),/Insufficient stock/);assert.equal(state.stock['RM-1'].reserved,0);
});

test('completion enforces planned quantity and planned jobs can be cancelled',()=>{
  const state=sampleState(),order=state.orders[0];createProductionJob(state,{id:'j1',workOrderNo:'WO-0001',order});releaseProductionJob(state,'j1');issueProductionJob(state,'j1');
  assert.throws(()=>completeProductionJob(state,'j1',{completedQty:3,scrapQty:0}),/must equal/);assert.equal(state.stock['RM-1']['WH-SF'],10);
  const second=sampleState();createProductionJob(second,{id:'j2',workOrderNo:'WO-0001',order:second.orders[0]});cancelProductionJob(second,'j2');assert.equal(second.orders[0].productionStatus,'');
});
