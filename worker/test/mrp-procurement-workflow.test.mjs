import test from 'node:test';
import assert from 'node:assert/strict';
import {completeThreeWayMatch,repairMatchedPurchaseRequests} from '../../mrp/procurement-workflow.js';

test('three-way match closes its linked purchase request',()=>{
  const pr={prNo:'PR-1',status:'APPROVED'};
  const po={poNo:'PO-1',prNo:'PR-1',status:'ACCEPTED',grnNo:'GRN-1',invoiceNo:'INV-1'};
  const state={purchaseRequests:[pr],purchaseOrders:[po]};
  completeThreeWayMatch(state,po);
  assert.equal(po.status,'MATCHED');
  assert.equal(pr.status,'CLOSED');
  assert.equal(pr.closedByPo,'PO-1');
});

test('three-way match remains blocked without an invoice',()=>{
  const pr={prNo:'PR-1',status:'APPROVED'};
  const po={poNo:'PO-1',prNo:'PR-1',status:'ACCEPTED',grnNo:'GRN-1',invoiceNo:''};
  assert.throws(()=>completeThreeWayMatch({purchaseRequests:[pr]},po),/supplier invoice/);
  assert.equal(po.status,'ACCEPTED');
  assert.equal(pr.status,'APPROVED');
});

test('repairs purchase requests linked to already matched orders',()=>{
  const state={purchaseRequests:[{prNo:'PR-1',status:'APPROVED'}],purchaseOrders:[{poNo:'PO-1',prNo:'PR-1',status:'MATCHED'}]};
  assert.equal(repairMatchedPurchaseRequests(state),true);
  assert.equal(state.purchaseRequests[0].status,'CLOSED');
  assert.equal(repairMatchedPurchaseRequests(state),false);
});
