function validNumber(value){const number=Number(value);return Number.isFinite(number)?number:0}

export function appendAudit(state,{action,entity='SYSTEM',reference='',user='unknown',role='',workspace='',device='unknown',at=new Date().toISOString(),details=''}={}){
  state.auditTrail??=[];
  const entry={id:`AUD-${at}-${state.auditTrail.length+1}`,at,action,entity,reference,user,role,workspace,device,details};
  state.auditTrail.unshift(entry);
  if(state.auditTrail.length>1000)state.auditTrail.length=1000;
  state.lastChange=entry;
  return entry;
}

export function appendInventoryMovement(state,{sku,warehouse,qty,direction,type,reference='',batchNo='',lotNo='',serialNo='',expiryDate='',user='unknown',device='unknown',at=new Date().toISOString(),note=''}={}){
  state.inventoryMovements??=[];
  const movement={id:`MOV-${at}-${state.inventoryMovements.length+1}`,at,sku,warehouse,qty:Math.abs(validNumber(qty)),direction,type,reference,batchNo,lotNo,serialNo,expiryDate,user,device,note};
  state.inventoryMovements.unshift(movement);
  if(state.inventoryMovements.length>3000)state.inventoryMovements.length=3000;
  return movement;
}

export function warehouseReport(state,warehouseCode){
  const items=(state.skus||[]).map(item=>{const quantity=validNumber(state.stock?.[item.code]?.[warehouseCode]),value=quantity*validNumber(item.cost);return{sku:item.code,name:item.name||'',quantity,value}}).filter(item=>item.quantity!==0);
  const movements=(state.inventoryMovements||[]).filter(item=>item.warehouse===warehouseCode);
  return{skuCount:items.length,totalQuantity:items.reduce((sum,item)=>sum+item.quantity,0),inventoryValue:items.reduce((sum,item)=>sum+item.value,0),lastMovement:movements[0]?.at||'',items,movements};
}

export function productionMetrics(state,now=new Date()){
  const jobs=state.productionJobs||[],completed=jobs.filter(job=>job.status==='COMPLETED'),awaitingFqc=jobs.filter(job=>job.status==='AWAITING_FQC').length,holds=jobs.filter(job=>job.status==='QUALITY_HOLD').length;
  const good=completed.reduce((sum,job)=>sum+validNumber(job.completedQty),0),scrap=completed.reduce((sum,job)=>sum+validNumber(job.scrapQty),0),actual=completed.map(job=>validNumber(job.actualLeadTimeHours)).filter(value=>value>0);
  const overdue=jobs.filter(job=>!['COMPLETED','CANCELLED'].includes(job.status)&&job.dueDate&&new Date(job.dueDate)<now).length;
  return{completed:completed.length,awaitingFqc,holds,overdue,yieldPercent:good+scrap?good/(good+scrap)*100:0,averageActualHours:actual.length?actual.reduce((sum,value)=>sum+value,0)/actual.length:0};
}
