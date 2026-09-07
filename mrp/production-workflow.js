const ACTIVE_STATUSES=new Set(['PLANNED','RELEASED','IN_PRODUCTION']);

function productionJobs(state){return state.productionJobs??(state.productionJobs=[])}
function findJob(state,jobId){const job=productionJobs(state).find(item=>item.id===jobId);if(!job)throw new Error('Work order not found.');return job}
function findOrder(state,job){return state.orders.find(order=>order.id===job.orderId)||state.orders.find(order=>order.orderNo===job.orderNo&&order.productCode===job.productCode)}
function setOrderStatus(state,job,status){const order=findOrder(state,job);if(order)order.productionStatus=status}
function number(value){const result=Number(value);return Number.isFinite(result)?result:NaN}

export function createProductionJob(state,{id,workOrderNo,order,createdAt=new Date().toISOString()}){
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
  const job={id,workOrderNo,orderKey,orderId:order.id||'',orderNo:order.orderNo,productCode:order.productCode,productName:product.name||order.productCode,plannedQty:number(order.qty),completedQty:0,scrapQty:0,outputSku:product.outputSku||`FG-${product.code}`,status:'PLANNED',materials,createdAt};
  productionJobs(state).unshift(job);order.productionStatus='PLANNED';return job;
}

export function releaseProductionJob(state,jobId,releasedAt=new Date().toISOString()){
  const job=findJob(state,jobId);if(job.status!=='PLANNED')throw new Error('Only a planned work order can be released.');
  for(const material of job.materials){const stock=state.stock[material.sku]||{},free=number(stock[material.warehouse]||0)-number(stock.reserved||0);if(free+1e-9<material.required)throw new Error(`Insufficient stock for ${material.sku} in ${material.warehouse}.`)}
  for(const material of job.materials){state.stock[material.sku]??={};state.stock[material.sku].reserved=number(state.stock[material.sku].reserved||0)+material.required}
  job.status='RELEASED';job.releasedAt=releasedAt;setOrderStatus(state,job,'RELEASED');return job;
}

export function issueProductionJob(state,jobId,issuedAt=new Date().toISOString()){
  const job=findJob(state,jobId);if(job.status!=='RELEASED')throw new Error('Release and reserve materials first.');
  for(const material of job.materials){if(number(state.stock[material.sku]?.[material.warehouse]||0)+1e-9<material.required)throw new Error(`Insufficient stock for ${material.sku} in ${material.warehouse}.`)}
  for(const material of job.materials){const stock=state.stock[material.sku];stock[material.warehouse]=number(stock[material.warehouse]||0)-material.required;stock.reserved=Math.max(0,number(stock.reserved||0)-material.required);stock['WH-SF']=number(stock['WH-SF']||0)+material.required}
  job.status='IN_PRODUCTION';job.issuedAt=issuedAt;setOrderStatus(state,job,'IN_PRODUCTION');return job;
}

export function completeProductionJob(state,jobId,{completedQty,scrapQty=0,completedAt=new Date().toISOString()}){
  const job=findJob(state,jobId);if(job.status!=='IN_PRODUCTION')throw new Error('Issue materials to the shop floor first.');
  const completed=number(completedQty),scrap=number(scrapQty);if(completed<0||scrap<0||!Number.isFinite(completed)||!Number.isFinite(scrap))throw new Error('Completed and scrap quantities must be zero or positive.');
  if(Math.abs(completed+scrap-job.plannedQty)>1e-7)throw new Error('Completed plus scrap quantity must equal the planned quantity.');
  for(const material of job.materials){if(number(state.stock[material.sku]?.['WH-SF']||0)+1e-9<material.required)throw new Error(`Insufficient issued material for ${material.sku}.`)}
  for(const material of job.materials)state.stock[material.sku]['WH-SF']=number(state.stock[material.sku]['WH-SF']||0)-material.required;
  const product=state.products.find(item=>item.code===job.productCode);if(!product)throw new Error('Product not found.');
  product.outputSku=job.outputSku;
  let output=state.skus.find(item=>item.code===job.outputSku);
  if(!output){const materialCost=job.materials.reduce((total,material)=>total+(number(state.skus.find(item=>item.code===material.sku)?.cost||0)*material.factor),0);output={code:job.outputSku,name:product.name||job.productName,type:'FINISHED_GOOD',category:'',unit:product.unit||'ADET',cost:materialCost,warehouse:'WH-FG',supplier:'',leadTime:0,min:0,max:0,active:true};state.skus.push(output)}
  state.stock[job.outputSku]??={};state.stock[job.outputSku]['WH-FG']=number(state.stock[job.outputSku]['WH-FG']||0)+completed;state.stock[job.outputSku].reserved=number(state.stock[job.outputSku].reserved||0);
  job.completedQty=completed;job.scrapQty=scrap;job.status='COMPLETED';job.completedAt=completedAt;setOrderStatus(state,job,'COMPLETED');return job;
}

export function cancelProductionJob(state,jobId){const job=findJob(state,jobId);if(job.status!=='PLANNED')throw new Error('Only a planned work order can be cancelled.');job.status='CANCELLED';setOrderStatus(state,job,'');return job}

export function isOrderInProduction(state,order){const key=order.id||`${order.orderNo}|${order.productCode}`;return productionJobs(state).some(job=>(job.orderKey===key||(!order.id&&!job.orderId&&job.orderNo===order.orderNo&&job.productCode===order.productCode))&&(ACTIVE_STATUSES.has(job.status)||job.status==='COMPLETED'))}
