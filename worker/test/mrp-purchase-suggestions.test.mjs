import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPurchaseSuggestions,createPurchaseRequestFromSuggestion} from '../../mrp/purchase-suggestions.js';

const shortage=(orderNo,amount,priority='NORMAL')=>({orderNo,sku:'RM-1',name:'Material',warehouse:'WH-RM',shortage:amount,status:'SHORTAGE',priority,needDate:'2026-09-10'});

test('aggregates MRP shortages and creates a draft purchase request',()=>{
  const [suggestion]=buildPurchaseSuggestions([shortage('ORD-1',2),shortage('ORD-2',3,'URGENT')],[]);
  assert.equal(suggestion.suggestedQty,5);
  assert.equal(suggestion.priority,'URGENT');
  assert.deepEqual(suggestion.orders,['ORD-1','ORD-2']);
  const pr=createPurchaseRequestFromSuggestion(suggestion,{id:'p1',prNo:'PR-0001',date:'2026-09-07'});
  assert.equal(pr.qty,5);
  assert.equal(pr.status,'DRAFT');
  assert.equal(pr.source,'MRP');
});

test('subtracts open MRP requests and prevents duplicate suggestions',()=>{
  const details=[shortage('ORD-1',5)];
  const partial=[{source:'MRP',mrpSuggestionKey:'RM-1|WH-RM',qty:2,status:'DRAFT'}];
  assert.equal(buildPurchaseSuggestions(details,partial)[0].suggestedQty,3);
  const covered=[{source:'MRP',mrpSuggestionKey:'RM-1|WH-RM',qty:5,status:'APPROVED'}];
  assert.deepEqual(buildPurchaseSuggestions(details,covered),[]);
});
