const num=value=>Number.isFinite(Number(value))?Number(value):0;
const key=value=>String(value||'').trim().toLowerCase();

export function normalizeLotGenealogy(state){
  state.inventoryLots??=[];
  state.lotGenealogy??=[];
  state.productionJobs??=[];
  state.lotGenealogy=state.lotGenealogy.filter(record=>record&&record.outputBatch&&record.workOrderNo);
  return state;
}

export function allocateTrackedLots(state,{sku,warehouse,quantity,policy='FIFO',onDate=new Date().toISOString().slice(0,10)}={}){
  normalizeLotGenealogy(state);const required=num(quantity);if(!(required>0))throw new Error('Issue quantity must be greater than zero.');
  const item=(state.skus||[]).find(row=>row.code===sku),tracked=Boolean(item?.lotTracked||item?.serialTracked);if(!tracked)return[];
  const eligible=state.inventoryLots.filter(lot=>lot.sku===sku&&lot.warehouse===warehouse&&num(lot.quantity)>0&&(!lot.expiryDate||lot.expiryDate>=onDate));
  eligible.sort((a,b)=>policy==='FEFO'?(a.expiryDate||'9999-12-31').localeCompare(b.expiryDate||'9999-12-31')||(a.receivedAt||'').localeCompare(b.receivedAt||''):(a.receivedAt||'').localeCompare(b.receivedAt||'')||(a.expiryDate||'9999-12-31').localeCompare(b.expiryDate||'9999-12-31'));
  let remaining=required;const allocations=[];for(const lot of eligible){if(remaining<=1e-9)break;const quantityUsed=Math.min(remaining,num(lot.quantity));allocations.push({inventoryLotId:lot.id||'',sku,warehouse,lotNo:lot.lotNo||'',serialNo:lot.serialNo||'',expiryDate:lot.expiryDate||'',receivedAt:lot.receivedAt||'',quantity:quantityUsed});remaining-=quantityUsed}
  if(remaining>1e-9)throw new Error(`Insufficient traceable lot stock for ${sku}; shortage ${Number(remaining.toFixed(6))}.`);
  return allocations;
}

export function consumeLotAllocations(state,allocations=[]){
  for(const allocation of allocations){const lot=state.inventoryLots.find(row=>allocation.inventoryLotId?row.id===allocation.inventoryLotId:row.sku===allocation.sku&&row.warehouse===allocation.warehouse&&row.lotNo===allocation.lotNo&&row.serialNo===allocation.serialNo);if(!lot||num(lot.quantity)+1e-9<num(allocation.quantity))throw new Error(`Allocated lot ${allocation.lotNo||allocation.serialNo||allocation.sku} is no longer available.`)}
  for(const allocation of allocations){const lot=state.inventoryLots.find(row=>allocation.inventoryLotId?row.id===allocation.inventoryLotId:row.sku===allocation.sku&&row.warehouse===allocation.warehouse&&row.lotNo===allocation.lotNo&&row.serialNo===allocation.serialNo);lot.quantity=Math.max(0,num(lot.quantity)-num(allocation.quantity))}
}

export function recordProductionGenealogy(state,job,{at=new Date().toISOString()}={}){
  normalizeLotGenealogy(state);const existing=state.lotGenealogy.find(row=>row.productionJobId===job.id);if(existing)return existing;
  const inputs=(job.materials||[]).flatMap(material=>(material.lotAllocations||[]).map(lot=>({...lot,sku:material.sku,warehouse:material.warehouse})));
  const record={id:`GEN-${job.id}`,productionJobId:job.id,workOrderNo:job.workOrderNo,orderNo:job.orderNo||'',productCode:job.productCode,outputSku:job.outputSku,outputBatch:job.batchNo,outputQuantity:num(job.completedQty),scrapQuantity:num(job.scrapQty),bomVersion:job.bomVersion||'',inputs,createdAt:at,status:'QUARANTINE'};
  state.lotGenealogy.unshift(record);state.inventoryLots.push({id:`LOT-OUT-${job.id}`,sku:job.outputSku,warehouse:'WH-QA',lotNo:job.batchNo,serialNo:'',expiryDate:'',receivedAt:at,quantity:num(job.completedQty),reference:job.workOrderNo,source:'PRODUCTION'});return record;
}

export function releaseOutputBatch(state,job){normalizeLotGenealogy(state);const lot=state.inventoryLots.find(row=>row.sku===job.outputSku&&row.lotNo===job.batchNo&&row.warehouse==='WH-QA'&&row.source==='PRODUCTION');if(lot)lot.warehouse='WH-FG';const record=state.lotGenealogy.find(row=>row.productionJobId===job.id);if(record)record.status='RELEASED';return record}

function matchesRecord(record,term){return[key(record.outputBatch),key(record.workOrderNo),key(record.orderNo),key(record.outputSku),key(record.productCode)].includes(term)||record.inputs.some(input=>[key(input.lotNo),key(input.serialNo),key(input.sku)].includes(term))}

export function lotGenealogyReport(state,query){
  normalizeLotGenealogy(state);const term=key(query);if(!term)return{query:'',records:[],inputLots:[],outputBatches:[],inventory:[],quality:[],potentialShipments:[]};
  const selected=new Set(state.lotGenealogy.filter(record=>matchesRecord(record,term)).map(record=>record.id));let changed=true;
  while(changed){changed=false;for(const record of state.lotGenealogy){if(selected.has(record.id))continue;const selectedRecords=state.lotGenealogy.filter(row=>selected.has(row.id));const linked=selectedRecords.some(row=>record.inputs.some(input=>key(input.lotNo)===key(row.outputBatch))||row.inputs.some(input=>key(input.lotNo)===key(record.outputBatch)));if(linked){selected.add(record.id);changed=true}}}
  const records=state.lotGenealogy.filter(record=>selected.has(record.id)),inputLots=records.flatMap(record=>record.inputs.map(input=>({...input,consumedByBatch:record.outputBatch,workOrderNo:record.workOrderNo}))),outputBatches=records.map(record=>({batchNo:record.outputBatch,sku:record.outputSku,quantity:record.outputQuantity,status:record.status,workOrderNo:record.workOrderNo,orderNo:record.orderNo}));
  const batchKeys=new Set(outputBatches.map(row=>key(row.batchNo))),inputKeys=new Set(inputLots.flatMap(row=>[key(row.lotNo),key(row.serialNo)]).filter(Boolean));const inventory=state.inventoryLots.filter(lot=>batchKeys.has(key(lot.lotNo))||inputKeys.has(key(lot.lotNo))||inputKeys.has(key(lot.serialNo)));const jobIds=new Set(records.map(row=>row.productionJobId)),quality=(state.qualityInspections||[]).filter(row=>jobIds.has(row.productionJobId));const outputSkus=new Set(outputBatches.map(row=>row.sku)),potentialShipments=(state.shipments||[]).filter(shipment=>{const order=(state.salesOrders||[]).find(row=>row.orderNo===shipment.orderNo);return order&&outputSkus.has(order.sku)});
  return{query:String(query).trim(),records,inputLots,outputBatches,inventory,quality,potentialShipments};
}
