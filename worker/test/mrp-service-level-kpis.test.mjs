import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceLevelKpis} from '../../mrp/service-level-kpis.js';
import {buildBusinessReport} from '../../mrp/reporting.js';

const sample=()=>({
  warehouses:[{code:'WH-FG',name:'Finished Goods'}],
  skus:[{code:'FG-1',name:'Product',cost:10}],
  stock:{'FG-1':{'WH-FG':80,reserved:5}},
  salesOrders:[
    {orderNo:'SO-1',customer:'A',sku:'FG-1',qty:10,dueDate:'2026-09-05',status:'SHIPPED'},
    {orderNo:'SO-2',customer:'B',sku:'FG-1',qty:20,dueDate:'2026-09-06',status:'PARTIALLY_SHIPPED'},
    {orderNo:'SO-3',customer:'C',sku:'FG-1',qty:5,dueDate:'2026-09-07',status:'SHIPPED'}
  ],
  shipments:[
    {shipmentNo:'SHP-1',orderNo:'SO-1',pickQty:10,status:'SHIPPED',shippedAt:'2026-09-04T10:00:00Z'},
    {shipmentNo:'SHP-2',orderNo:'SO-2',pickQty:8,status:'SHIPPED',shippedAt:'2026-09-06T10:00:00Z'},
    {shipmentNo:'SHP-3',orderNo:'SO-3',pickQty:5,status:'SHIPPED',shippedAt:'2026-09-08T10:00:00Z'}
  ],
  inventoryMovements:[
    {sku:'FG-1',direction:'IN',qty:30,at:'2026-09-01T08:00:00Z'},
    {sku:'FG-1',direction:'OUT',qty:23,at:'2026-09-08T10:00:00Z'}
  ]
});

test('service KPIs aggregate OTIF and quantity-weighted fill rate',()=>{
  const result=serviceLevelKpis(sample(),{from:'2026-09-01',to:'2026-09-30'});
  assert.equal(result.eligibleOrders,3);
  assert.equal(result.otifOrders,1);
  assert.ok(Math.abs(result.otifRate-100/3)<1e-10);
  assert.equal(result.fillRate,23/35*100);
  assert.deepEqual(result.rows.map(row=>row.deliveryStatus),['OTIF','OPEN','LATE']);
});

test('inventory turnover uses shipped COGS and reconstructed average inventory',()=>{
  const result=serviceLevelKpis(sample(),{from:'2026-09-01',to:'2026-09-30'});
  assert.equal(result.cogs,230);
  assert.equal(result.endingInventoryValue,800);
  assert.equal(result.openingInventoryValue,730);
  assert.equal(result.averageInventoryValue,765);
  assert.equal(result.inventoryTurnover,230/765);
  const report=buildBusinessReport(sample(),{type:'serviceLevel',from:'2026-09-01',to:'2026-09-30'});
  assert.equal(report.title,'Service Level & Inventory Performance');
  assert.equal(report.rows.length,3);
  assert.equal(report.kpis.find(([label])=>label==='COGS')[1],230);
});
