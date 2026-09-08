import {appendAudit,appendInventoryMovement} from './audit-workflow.js';
import {bomSnapshot} from './bom-workflow.js';

const ACTIVE_STATUSES=new Set(['PLANNED','RELEASED','IN_PRODUCTION','AWAITING_FQC','QUALITY_HOLD']);

function productionJobs(state){return state.productionJobs??(state.productionJobs=[])}
function findJob(state,jobId){const job=productionJobs(state).find(item=>item.id===jobId);if(!job)throw new Error('Work order not found.');return job}
function findOrder(state,job){return state.orders.find(order=>order.id===job.orderId)||state.orders.find(order=>order.orderNo===job.orderNo&&order.productCode===job.productCode)}
function setOrderStatus(state,job,status){const order=findOrder(state,job);if(order)order.productionStatus=status}
function number(value){const result=Number(value);return Number.isFinite(result)?result:NaN}
function metaFields(meta={}){return{user:meta.user||'unknown',role:meta.role||'',workspace:meta.workspace||'',device:meta.device||'unknown'}}
function hoursBetween(start,end){const milliseconds=new Date(end)-new Date(start);return Number.isFinite(milliseconds)&&milliseconds>=0?milliseconds/3600000:0}
function recordAudit(state,job,action,meta,at,details=''){appendAudit(state,{...metaFields(meta),action,entity:'PRODUCTION',reference:job.workOrderNo,at,details})}

export function createProductionJob(state,{id,workOrderNo,order,batchNo,plannedLeadTimeHours=8,createdAt=new Date().toISOString(),meta={}}){
  if(!order||!order.productCode||!(number(order.qty)>0))throw new Error('A valid production order is required.');
  const orderKey=order.id||`${order.orderNo}|${order.productCode}`;
  if(productionJobs(state).some(job=>(job.orderKey===orderKey||(!order.id&&!job.orderId&&job.orderNo===order.orderNo&&job.productCode===order.productCode))&&job.status!=='CANCELLED'))throw new Error('A work order already exists for this order line.');
  const product=state.products.find(item=>item.code===order.productCode);
  if(!product)throw new Error('Product not found.');
  const bom=state.boms[order.productCode]||[];
  if(!bom.length)throw new Error('A saved BOM is required.');
  const grouped=new Map();
  for(const line of bom){
    const factor=number(line.qty),component=state.skus.find(item=>item.code===line.sku);
    if(!component||!(factor>0))throw new Error('Every BOM row needs a valid SKU and usage quantity.');
    const warehouse=line.warehouse||component.warehouse||'WH-RM',key=`${line.sku}|${warehouse}`,current=grouped.get(key)||{sku:line.sku,name:component.name||line.name||'',warehouse,factor:0,required:0};current.factor+=factor;current.required+=number(order.qty)*factor;grouped.set(key,current);
  }
  const materials=[...grouped.values()];
  const snapshot=bomSnapshot(state,order.productCode);
  const job={id,workOrderNo,orderKey,orderId:order.id||'',orderNo:order.orderNo,productCode:order.productCode,productName:product.name||order.productCode,plannedQty:number(order.qty),completedQty:0,scrapQty:0,outputSku:product.outputSku||`FG-${product.code}`,batchNo:batchNo||`BATCH-${createdAt.slice(0,10).replaceAll('-','')}-${String(productionJobs(state).length+1).padStart(3,'0')}`,priority:order.priority||'NORMAL',dueDate:order.due||'',plannedLeadTimeHours:number(plannedLeadTimeHours)>0?number(plannedLeadTimeHours):8,status:'PLANNED',materials,bomVersion:snapshot.version,bomEffectiveDate:snapshot.effectiveDate,model:snapshot.model,design:snapshot.design,packageType:snapshot.packageType,processVariables:snapshot.variables,createdAt,createdBy:metaFields(meta)};
  productionJobs(state).unshift(job);order.productionStatus='PLANNED';recordAudit(state,job,'WORK_ORDER_CREATED',meta,createdAt,`Batch ${job.batchNo}`);return job;
}

export function releaseProductionJob(state,jobId,releasedAt=new Date().toISOString(),meta={}){
  const job=findJob(state,jobId);if(job.status!=='PLANNED')throw new Error('Only a planned work order can be released.');
  for(const material of job.materials){const stock=state.stock[material.sku]||{},free=number(stock[material.warehouse]||0)-number(stock.reserved||0);if(free+1e-9<material.required)throw new Error(`Insufficient stock for ${material.sku} in ${material.warehouse}.`)}
  for(const material of job.materials){state.stock[material.sku]??={};state.stock[material.sku].reserved=number(state.stock[material.sku].reserved||0)+material.required}
  job.status='RELEASED';job.releasedAt=releasedAt;job.releasedBy=metaFields(meta);setOrderStatus(state,job,'RELEASED');recordAudit(state,job,'MATERIALS_RESERVED',meta,releasedAt);return job;
}

export function issueProductionJob(state,jobId,issuedAt=new Date().toISOString(),meta={}){
  const job=findJob(state,jobId);if(job.status!=='RELEASED')throw new Error('Release and reserve materials first.');
  for(const material of job.materials){if(number(state.stock[material.sku]?.[material.warehouse]||0)+1e-9<material.required)throw new Error(`Insufficient stock for ${material.sku} in ${material.warehouse}.`)}
  for(const material of job.materials){const stock=state.stock[material.sku];stock[material.warehouse]=number(stock[material.warehouse]||0)-material.required;stock.reserved=Math.max(0,number(stock.reserved||0)-material.required);stock['WH-SF']=number(stock['WH-SF']||0)+material.required;appendInventoryMovement(state,{...metaFields(meta),sku:material.sku,warehouse:material.warehouse,qty:material.required,direction:'OUT',type:'PRODUCTION_ISSUE',reference:job.workOrderNo,batchNo:job.batchNo,at:issuedAt});appendInventoryMovement(state,{...metaFields(meta),sku:material.sku,warehouse:'WH-SF',qty:material.required,direction:'IN',type:'SHOP_FLOOR_RECEIPT',reference:job.workOrderNo,batchNo:job.batchNo,at:issuedAt})}
  job.status='IN_PRODUCTION';job.issuedAt=issuedAt;job.issuedBy=metaFields(meta);setOrderStatus(state,job,'IN_PRODUCTION');recordAudit(state,job,'MATERIALS_ISSUED',meta,issuedAt);return job;
}

export function completeProductionJob(state,jobId,{completedQty,scrapQty=0,completedAt=new Date().toISOString(),inspectionId,inspectionNo,meta={}}={}){
  const job=findJob(state,jobId);if(job.status!=='IN_PRODUCTION')throw new Error('Issue materials to the shop floor first.');
  const completed=number(completedQty),scrap=number(scrapQty);if(completed<0||scrap<0||!Number.isFinite(completed)||!Number.isFinite(scrap))throw new Error('Completed and scrap quantities must be zero or positive.');
  if(Math.abs(completed+scrap-job.plannedQty)>1e-7)throw new Error('Completed plus scrap quantity must equal the planned quantity.');
  for(const material of job.materials){if(number(state.stock[material.sku]?.['WH-SF']||0)+1e-9<material.required)throw new Error(`Insufficient issued material for ${material.sku}.`)}
  for(const material of job.materials){state.stock[material.sku]['WH-SF']=number(state.stock[material.sku]['WH-SF']||0)-material.required;appendInventoryMovement(state,{...metaFields(meta),sku:material.sku,warehouse:'WH-SF',qty:material.required,direction:'OUT',type:'PRODUCTION_CONSUMPTION',reference:job.workOrderNo,batchNo:job.batchNo,at:completedAt})}
  const product=state.products.find(item=>item.code===job.productCode);if(!product)throw new Error('Product not found.');
  product.outputSku=job.outputSku;
  let output=state.skus.find(item=>item.code===job.outputSku);
  if(!output){const materialCost=job.materials.reduce((total,material)=>total+(number(state.skus.find(item=>item.code===material.sku)?.cost||0)*material.factor),0);output={code:job.outputSku,name:product.name||job.productName,type:'FINISHED_GOOD',category:'',unit:product.unit||'ADET',cost:materialCost,warehouse:'WH-FG',supplier:'',leadTime:0,min:0,max:0,active:true};state.skus.push(output)}
  state.stock[job.outputSku]??={};state.stock[job.outputSku]['WH-QA']=number(state.stock[job.outputSku]['WH-QA']||0)+completed;state.stock[job.outputSku].reserved=number(state.stock[job.outputSku].reserved||0);
  appendInventoryMovement(state,{...metaFields(meta),sku:job.outputSku,warehouse:'WH-QA',qty:completed,direction:'IN',type:'PRODUCTION_FQC_HOLD',reference:job.workOrderNo,batchNo:job.batchNo,at:completedAt});
  inspectionId||=`${job.id}-fqc`;inspectionNo||=`FQC-${String((state.qualityInspections||[]).length+1).padStart(4,'0')}`;state.qualityInspections??=[];state.qualityInspections.unshift({id:inspectionId,inspectionNo,type:'FQC',reference:job.workOrderNo,productionJobId:job.id,sku:job.outputSku,qty:completed,result:'PENDING',date:completedAt.slice(0,10),ncrNo:'',disposition:'HOLD',released:false,stockReleased:false,notes:`Batch ${job.batchNo}`});
  job.completedQty=completed;job.scrapQty=scrap;job.status='AWAITING_FQC';job.productionCompletedAt=completedAt;job.actualLeadTimeHours=hoursBetween(job.issuedAt||job.releasedAt||job.createdAt,completedAt);job.completedBy=metaFields(meta);setOrderStatus(state,job,'AWAITING_FQC');recordAudit(state,job,'PRODUCTION_REPORTED',meta,completedAt,`Good ${completed}; scrap ${scrap}; awaiting FQC`);return job;
}

export function applyProductionQualityDecision(state,inspectionId,{ncrNo='',decidedAt=new Date().toISOString(),meta={}}={}){const inspection=(state.qualityInspections||[]).find(item=>item.id===inspectionId);if(!inspection?.productionJobId)throw new Error('Linked production batch not found.');if(inspection.result==='PENDING')throw new Error('Select a QC result first.');const job=findJob(state,inspection.productionJobId);if(job.status!=='AWAITING_FQC')throw new Error('Production batch is not awaiting FQC.');inspection.released=true;inspection.decidedAt=decidedAt;inspection.decidedBy=metaFields(meta);if(inspection.result!=='ACCEPTED'){inspection.ncrNo||=ncrNo;job.status='QUALITY_HOLD';job.ncrNo=inspection.ncrNo;setOrderStatus(state,job,'QUALITY_HOLD');recordAudit(state,job,'FQC_HOLD',meta,decidedAt,inspection.result);return job}const stock=state.stock[job.outputSku]||{},quantity=number(job.completedQty||0);if(number(stock['WH-QA']||0)+1e-9<quantity)throw new Error('Insufficient finished goods in quarantine.');stock['WH-QA']=number(stock['WH-QA']||0)-quantity;stock['WH-FG']=number(stock['WH-FG']||0)+quantity;appendInventoryMovement(state,{...metaFields(meta),sku:job.outputSku,warehouse:'WH-QA',qty:quantity,direction:'OUT',type:'FQC_RELEASE',reference:job.workOrderNo,batchNo:job.batchNo,at:decidedAt});appendInventoryMovement(state,{...metaFields(meta),sku:job.outputSku,warehouse:'WH-FG',qty:quantity,direction:'IN',type:'FINISHED_GOODS_RECEIPT',reference:job.workOrderNo,batchNo:job.batchNo,at:decidedAt});inspection.stockReleased=true;job.status='COMPLETED';job.qualityReleasedAt=decidedAt;job.qualityReleasedBy=metaFields(meta);setOrderStatus(state,job,'COMPLETED');recordAudit(state,job,'FQC_ACCEPTED_AND_POSTED',meta,decidedAt,`Batch ${job.batchNo}`);return job}

export function cancelProductionJob(state,jobId,meta={}){const job=findJob(state,jobId);if(job.status!=='PLANNED')throw new Error('Only a planned work order can be cancelled.');job.status='CANCELLED';setOrderStatus(state,job,'');recordAudit(state,job,'WORK_ORDER_CANCELLED',meta,new Date().toISOString());return job}

export function isOrderInProduction(state,order){const key=order.id||`${order.orderNo}|${order.productCode}`;return productionJobs(state).some(job=>(job.orderKey===key||(!order.id&&!job.orderId&&job.orderNo===order.orderNo&&job.productCode===order.productCode))&&(ACTIVE_STATUSES.has(job.status)||job.status==='COMPLETED'))}
