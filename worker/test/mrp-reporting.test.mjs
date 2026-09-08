import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildBusinessReport} from '../../mrp/reporting.js';
import {readOpeningStockRow,resolveOpeningWarehouse} from '../../mrp/opening-stock-import.js';

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

test('inventory report limits rows to the selected warehouse',()=>{
  const report=buildBusinessReport(state,{type:'inventory',warehouse:'WH-SF'});
  assert.equal(report.rows.length,1);
  assert.equal(report.rows[0].warehouse,'Shop Floor');
  assert.equal(report.rows[0].quantity,5);
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

test('new customer dashboard exposes initial inventory import',async()=>{
  const html=await readFile(new URL('../../mrp/index.html',import.meta.url),'utf8');
  assert.match(html,/id="inventoryOnboarding"/);
  assert.match(html,/Import Initial Inventory Excel/);
  assert.match(html,/data-import="openingStock"/);
});

test('customer SKU workbook headers map to item master fields',()=>{
  const row={'SKU':8680613130008,'Description':'DIN 7505 3x12','TYPE':145,'UNIT':'PIECE','COST':48,'MAIN WAREHOUSE':'FG','MIN Q':180,'MAX Q':400};
  const parsed=readOpeningStockRow(state,row,{parseNumber:Number,parseDate:value=>String(value||'2026-09-08')});
  assert.deepEqual({code:parsed.code,warehouse:parsed.warehouse,unit:parsed.unit,category:parsed.category,itemType:parsed.itemType,min:parsed.min,max:parsed.max,quantity:parsed.quantity,hasQuantity:parsed.hasQuantity},{code:'8680613130008',warehouse:'WH-FG',unit:'ADET',category:'145',itemType:'FINISHED_GOOD',min:180,max:400,quantity:0,hasQuantity:false});
});

test('customer warehouse abbreviations FG and PACK are recognized',()=>{
  assert.equal(resolveOpeningWarehouse(state,'FG'),'WH-FG');
  assert.equal(resolveOpeningWarehouse(state,'PACK'),'WH-PK');
});
