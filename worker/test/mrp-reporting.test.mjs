import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBusinessReport} from '../../mrp/reporting.js';

const state={
  warehouses:[{code:'WH-RM',name:'Raw Materials'},{code:'WH-SF',name:'Shop Floor'}],
  skus:[{code:'RM-1',name:'Steel',unit:'KG',cost:4,min:10}],
  stock:{'RM-1':{'WH-RM':20,'WH-SF':5,reserved:2}},
  orders:[{orderNo:'ORD-1',productionStatus:'PLANNED'}],
  inventoryMovements:[
    {at:'2026-09-08T08:00:00Z',warehouse:'WH-RM',sku:'RM-1',direction:'IN',qty:20,type:'RECEIPT',reference:'GR-1',batchNo:'B-1',user:'operator'},
    {at:'2026-09-09T08:00:00Z',warehouse:'WH-SF',sku:'RM-1',direction:'IN',qty:5,type:'PRODUCTION_ISSUE',reference:'WO-1',batchNo:'B-1',user:'planner'}
  ],
  productionJobs:[{workOrderNo:'WO-1',orderNo:'ORD-1',productCode:'FG-1',batchNo:'B-1',plannedQty:10,completedQty:9,scrapQty:1,plannedLeadTimeHours:8,startedAt:'2026-09-08T08:00:00Z',completedAt:'2026-09-08T14:00:00Z',status:'COMPLETED'}],
  qualityInspections:[{inspectionNo:'FQC-1',date:'2026-09-08',sku:'FG-1',qty:9,result:'ACCEPTED'}],
  purchaseRequests:[],purchaseOrders:[],suppliers:[],salesOrders:[],shipments:[],receipts:[],auditTrail:[]
};

test('inventory report keeps shop-floor quantity separate from warehouse stock',()=>{
  const report=buildBusinessReport(state,{type:'inventory'});
  assert.equal(report.rows.length,2);
  assert.equal(report.rows.find(row=>row.warehouse==='Shop Floor').quantity,5);
  assert.equal(report.rows.find(row=>row.warehouse==='Shop Floor').state,'IN PROCESS');
});

test('movement report filters by date, warehouse and free text',()=>{
  const report=buildBusinessReport(state,{type:'movements',from:'2026-09-09',warehouse:'WH-SF',query:'wo-1'});
  assert.equal(report.rows.length,1);
  assert.equal(report.rows[0].reference,'WO-1');
});

test('production report calculates yield and actual time',()=>{
  const report=buildBusinessReport(state,{type:'production'});
  assert.equal(report.rows[0].yield,90);
  assert.equal(report.rows[0].actualHours,6);
  assert.equal(report.kpis.find(([label])=>label==='Yield %')[1],90);
});
