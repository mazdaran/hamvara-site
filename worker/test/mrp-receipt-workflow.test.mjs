import test from 'node:test';
import assert from 'node:assert/strict';
import {queueReceiptForApproval,applyReceiptQcDecision,applyManagerReceiptDecision} from '../../mrp/receipt-workflow.js';

function sampleState(){return{receipts:[],qualityInspections:[],stock:{'RM-1':{'WH-RM':5,'WH-QA':0}}}}

test('receipt stays in quarantine until QC and manager approve',()=>{
  const state=sampleState();
  const {receipt,inspection}=queueReceiptForApproval(state,{id:'r1',inspectionId:'q1',inspectionNo:'IQC-1',reference:'GR-1',date:'2026-09-07',sku:'RM-1',qty:10,targetWarehouse:'WH-RM'});
  assert.equal(state.stock['RM-1']['WH-QA'],10);
  assert.equal(state.stock['RM-1']['WH-RM'],5);
  inspection.result='ACCEPTED';
  applyReceiptQcDecision(state,'q1');
  assert.equal(receipt.status,'PENDING_MANAGER');
  assert.equal(state.stock['RM-1']['WH-RM'],5);
  applyManagerReceiptDecision(state,'r1',true);
  assert.equal(receipt.status,'POSTED');
  assert.equal(state.stock['RM-1']['WH-QA'],0);
  assert.equal(state.stock['RM-1']['WH-RM'],15);
});

test('rejected receipt remains quarantined and creates an NCR hold',()=>{
  const state=sampleState();
  const {receipt,inspection}=queueReceiptForApproval(state,{id:'r1',inspectionId:'q1',inspectionNo:'IQC-1',reference:'GR-1',date:'2026-09-07',sku:'RM-1',qty:10,targetWarehouse:'WH-RM'});
  inspection.result='REJECTED';
  applyReceiptQcDecision(state,'q1','NCR-1');
  assert.equal(receipt.status,'HOLD_NCR');
  assert.equal(receipt.ncrNo,'NCR-1');
  assert.equal(state.stock['RM-1']['WH-QA'],10);
  assert.equal(state.stock['RM-1']['WH-RM'],5);
});
