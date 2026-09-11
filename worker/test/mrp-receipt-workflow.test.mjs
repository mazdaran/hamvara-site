import test from 'node:test';
import assert from 'node:assert/strict';
import {queueReceiptForApproval,applyReceiptQcDecision,applyManagerReceiptDecision,calculateAvailableStock} from '../../mrp/receipt-workflow.js';

function sampleState(){return{settings:{currency:'USD'},accountingSettings:{profile:'US_GAAP',baseCurrency:'USD'},skus:[{code:'RM-1',name:'Material',cost:5,costMethod:'LIFO'}],purchaseOrders:[],receipts:[],qualityInspections:[],stock:{'RM-1':{'WH-RM':5,'WH-QA':0}}}}

test('receipt stays in quarantine until QC and manager approve',()=>{
  const state=sampleState();
  const {receipt,inspection}=queueReceiptForApproval(state,{id:'r1',inspectionId:'q1',inspectionNo:'IQC-1',reference:'GR-1',date:'2026-09-07',sku:'RM-1',qty:10,targetWarehouse:'WH-RM'});
  assert.equal(state.stock['RM-1']['WH-QA'],10);
  assert.equal(state.stock['RM-1']['WH-RM'],5);
  assert.equal(calculateAvailableStock(state.stock['RM-1'],[{code:'WH-RM'},{code:'WH-QA'}]),5);
  inspection.result='ACCEPTED';
  applyReceiptQcDecision(state,'q1');
  assert.equal(receipt.status,'PENDING_MANAGER');
  assert.equal(state.stock['RM-1']['WH-RM'],5);
  applyManagerReceiptDecision(state,'r1',true);
  assert.equal(receipt.status,'POSTED');
  assert.equal(state.stock['RM-1']['WH-QA'],0);
  assert.equal(state.stock['RM-1']['WH-RM'],15);
  assert.equal(calculateAvailableStock(state.stock['RM-1'],[{code:'WH-RM'},{code:'WH-QA'}]),15);
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

test('quarantine and shop-floor stock are excluded from available inventory',()=>{
  assert.equal(calculateAvailableStock({'WH-RM':8,'WH-QA':5,'WH-SF':3,reserved:2},[{code:'WH-RM'},{code:'WH-QA'},{code:'WH-SF'}]),6);
});

test('approved purchase receipt creates a LIFO cost layer from the PO unit price',()=>{const state=sampleState();state.purchaseOrders.push({poNo:'PO-1',unitPrice:8});const {receipt,inspection}=queueReceiptForApproval(state,{id:'r1',inspectionId:'q1',inspectionNo:'IQC-1',reference:'GR-1',purchaseOrderNo:'PO-1',date:'2026-09-07',sku:'RM-1',qty:10,targetWarehouse:'WH-RM'});inspection.result='ACCEPTED';applyReceiptQcDecision(state,'q1');applyManagerReceiptDecision(state,'r1',true);assert.equal(receipt.costMethod,'LIFO');assert.equal(receipt.costValue,80);assert.equal(state.inventoryCostLayers[0].unitCost,8)});
