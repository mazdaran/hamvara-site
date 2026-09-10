const clean=value=>String(value??'').trim().toUpperCase();
const same=(value,code)=>value&&clean(value)===code;
const slug=value=>clean(value).replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,36);
const checksum=value=>[...value].reduce((sum,char,index)=>sum+char.charCodeAt(0)*(index+1),0).toString(36).toUpperCase().padStart(2,'0').slice(-2);

export const BARCODE_TARGET_KINDS=['OPERATOR','WORK_CENTER','MACHINE','OPERATION','SKU','WORK_ORDER'];

export function barcodeTargets(state,kind){
  if(kind==='OPERATOR')return(state.operators||[]).filter(x=>x.active!==false).map(x=>({kind,id:x.id,label:x.name,code:x.code,barcode:x.barcode||''}));
  if(kind==='WORK_CENTER')return(state.workCenters||[]).filter(x=>x.active!==false).map(x=>({kind,id:x.id,label:x.name,code:x.code,barcode:x.barcode||''}));
  if(kind==='MACHINE')return(state.workCenters||[]).filter(x=>x.active!==false&&x.machine).map(x=>({kind,id:x.id,label:x.machine,code:x.code,barcode:x.machineBarcode||''}));
  if(kind==='OPERATION')return(state.shopFloorTasks||[]).filter(x=>x.active!==false).map(x=>({kind,id:x.id,label:x.name,code:x.code,barcode:x.barcode||''}));
  if(kind==='SKU')return(state.skus||[]).filter(x=>x.active!==false).map(x=>({kind,id:x.code,label:x.name,code:x.code,barcode:x.barcode||''}));
  if(kind==='WORK_ORDER')return(state.productionJobs||[]).filter(x=>x.status==='IN_PRODUCTION').map(x=>({kind,id:x.id,label:x.productName||x.outputSku||x.productCode,code:x.workOrderNo,barcode:x.barcode||''}));
  return[];
}

function targetRecord(state,kind,id){if(kind==='SKU')return(state.skus||[]).find(x=>x.code===id);if(kind==='OPERATOR')return(state.operators||[]).find(x=>x.id===id);if(['WORK_CENTER','MACHINE'].includes(kind))return(state.workCenters||[]).find(x=>x.id===id);if(kind==='OPERATION')return(state.shopFloorTasks||[]).find(x=>x.id===id);if(kind==='WORK_ORDER')return(state.productionJobs||[]).find(x=>x.id===id);return null}
function barcodeField(kind){return kind==='MACHINE'?'machineBarcode':'barcode'}
export function assignShopFloorBarcode(state,{kind,id,barcode}){const code=clean(barcode);if(!code)throw Error('Enter or scan a barcode.');const target=targetRecord(state,kind,id);if(!target)throw Error('Barcode target was not found.');const duplicate=BARCODE_TARGET_KINDS.flatMap(type=>barcodeTargets(state,type)).find(item=>clean(item.barcode)===code&&!(item.kind===kind&&item.id===id));if(duplicate)throw Error(`Barcode is already assigned to ${duplicate.kind.replaceAll('_',' ')} ${duplicate.code}.`);target[barcodeField(kind)]=code;return{kind,id,barcode:code,label:target.name||target.machine||target.productName||target.code,code:target.code||target.workOrderNo}}
export function generateShopFloorBarcode(state,kind,id){const target=targetRecord(state,kind,id);if(!target)throw Error('Barcode target was not found.');const base=`HMV-${({OPERATOR:'OP',WORK_CENTER:'WC',MACHINE:'MC',OPERATION:'TASK',SKU:'SKU',WORK_ORDER:'WO'})[kind]}-${slug(target.code||target.workOrderNo||target.machine||target.name||id)}`;let candidate=`${base}-${checksum(base)}`,counter=1;const used=new Set(BARCODE_TARGET_KINDS.flatMap(type=>barcodeTargets(state,type)).map(item=>clean(item.barcode)).filter(Boolean));while(used.has(candidate))candidate=`${base}-${checksum(base+counter++)}`;return assignShopFloorBarcode(state,{kind,id,barcode:candidate})}

export function identifyShopFloorCode(state,rawCode){const code=clean(rawCode);if(!code)return{status:'EMPTY',code,candidates:[]};const candidates=[];
  const activeJobs=(state.productionJobs||[]).filter(item=>item.status==='IN_PRODUCTION');
  for(const item of state.operators||[])if(item.active!==false&&[item.id,item.code,item.barcode].some(value=>same(value,code)))candidates.push({kind:'OPERATOR',id:item.id,code:item.code,label:item.name,details:`Shift ${item.shift||'—'} · Active`});
  for(const item of state.workCenters||[])if(item.active!==false){if([item.id,item.code,item.barcode].some(value=>same(value,code)))candidates.push({kind:'WORK_CENTER',id:item.id,code:item.code,label:item.name,details:`${item.machine||'No machine'} · ${item.status||'AVAILABLE'}`});if(same(item.machineBarcode,code))candidates.push({kind:'MACHINE',id:item.id,code:item.code,label:item.machine||item.name,details:`${item.name} · ${item.status||'AVAILABLE'}`})}
  for(const item of state.shopFloorTasks||[])if(item.active!==false&&[item.id,item.code,item.barcode].some(value=>same(value,code)))candidates.push({kind:'OPERATION',id:item.id,code:item.code,label:item.name,details:item.description||'Defined shop-floor operation'});
  for(const item of state.skus||[])if(item.active!==false&&[item.code,item.barcode].some(value=>same(value,code))&&!activeJobs.some(job=>[job.outputSku,job.productCode].some(value=>same(value,item.code))))candidates.push({kind:'SKU',id:item.code,code:item.code,label:item.name,details:`${item.type||'ITEM'} · ${item.unit||'—'}`});
  for(const item of activeJobs){const sku=(state.skus||[]).find(candidate=>candidate.code===item.outputSku),product=(state.products||[]).find(candidate=>candidate.code===item.productCode);if([item.id,item.workOrderNo,item.batchNo,item.outputSku,item.productCode,item.barcode,sku?.barcode,product?.barcode].some(value=>same(value,code)))candidates.push({kind:'WORK_ORDER',id:item.id,code:item.workOrderNo,label:item.productName||product?.name||item.outputSku||item.productCode,details:`Batch ${item.batchNo||'—'} · ${item.outputSku||item.productCode||'—'} · ${item.liveStage||'Next stage pending'}`})}
  const unique=[...new Map(candidates.map(item=>[`${item.kind}|${item.id}`,item])).values()];return{status:unique.length===1?'MATCHED':unique.length>1?'AMBIGUOUS':'NOT_FOUND',code,candidates:unique,match:unique.length===1?unique[0]:null}}

export function shopFloorIdentificationSummary(state,identification){if(!identification?.match)return null;const item=identification.match;if(item.kind==='WORK_ORDER'){const job=(state.productionJobs||[]).find(value=>value.id===item.id);return{...item,workOrderNo:job?.workOrderNo||'',batchNo:job?.batchNo||'',product:job?.productName||job?.productCode||'',quantity:Number(job?.plannedQty)||0,dueDate:job?.dueDate||'',deliveryRisk:job?.deliveryRisk||'ON_TIME'}}return item}
