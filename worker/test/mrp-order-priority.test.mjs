import test from 'node:test';
import assert from 'node:assert/strict';
import {sortOrdersForAllocation} from '../../mrp/order-priority.js';

test('allocates stock to higher-priority orders first',()=>{
  const orders=[
    {orderNo:'ORD-1',priority:'NORMAL',date:'2026-09-01'},
    {orderNo:'ORD-2',priority:'VERY_URGENT',date:'2026-09-02'},
    {orderNo:'ORD-3',priority:'URGENT',date:'2026-09-03'}
  ];
  assert.deepEqual(sortOrdersForAllocation(orders).map(x=>x.orderNo),['ORD-2','ORD-3','ORD-1']);
  assert.deepEqual(orders.map(x=>x.orderNo),['ORD-1','ORD-2','ORD-3']);
});

test('uses earliest due date and then entry order when priority is equal',()=>{
  const orders=[
    {orderNo:'ORD-1',priority:'URGENT',due:'2026-09-20'},
    {orderNo:'ORD-2',priority:'URGENT',due:'2026-09-10'},
    {orderNo:'ORD-3',priority:'URGENT',due:'2026-09-10'}
  ];
  assert.deepEqual(sortOrdersForAllocation(orders).map(x=>x.orderNo),['ORD-2','ORD-3','ORD-1']);
});
