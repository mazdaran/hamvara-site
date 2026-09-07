export function closeMatchedPurchaseRequest(state,po){
  if(po?.status!=='MATCHED'||!po.prNo)return false;
  const pr=state.purchaseRequests?.find(item=>item.prNo===po.prNo);
  if(!pr||pr.status==='CLOSED')return false;
  pr.status='CLOSED';
  pr.closedByPo=po.poNo||'';
  return true;
}

export function completeThreeWayMatch(state,po){
  if(!po)throw new Error('Purchase order not found.');
  if(po.status!=='ACCEPTED')throw new Error('Accepted QC is required before matching.');
  if(!po.grnNo||!po.invoiceNo)throw new Error('Three-way match requires accepted QC, GRN and supplier invoice.');
  po.status='MATCHED';
  closeMatchedPurchaseRequest(state,po);
  return po;
}

export function repairMatchedPurchaseRequests(state){
  let changed=false;
  for(const po of state.purchaseOrders||[])changed=closeMatchedPurchaseRequest(state,po)||changed;
  return changed;
}
