import {getBomGraph} from './bom-graph-registry.js';

const num=value=>Number.isFinite(Number(value))?Number(value):0;
const round=value=>Number(num(value).toFixed(6));
const date=value=>String(value||'').slice(0,10);
const dayMs=86400000;
const addDays=(value,days)=>new Date(new Date(`${value}T12:00:00Z`).getTime()+days*dayMs).toISOString().slice(0,10);
const openStatus=status=>!['CLOSED','CANCELLED','REJECTED','COMPLETED','RECEIVED'].includes(String(status||'').toUpperCase());

function itemRecord(state,sku){return(state.skus||[]).find(item=>item.code===sku)||{}}
function productFor(graph,sku){return graph.productByItem.get(sku)||null}
function leadDays(state,graph,sku){
  const product=productFor(graph,sku),item=itemRecord(state,sku);
  if(product){
    if(num(product.productionLeadTimeDays)>0)return Math.ceil(num(product.productionLeadTimeDays));
    const hours=num(product.productionLeadTimeHours||product.routingHours);
    if(hours>0)return Math.ceil(hours/Math.max(1,num(state.capacityCalendar?.dailyHours)||8));
  }
  return Math.max(0,Math.ceil(num(item.leadTime)));
}
function lotSize(quantity,item){const multiple=Math.max(0,num(item.orderMultiple)),minimum=Math.max(0,num(item.minimumOrderQty));let result=Math.max(quantity,minimum);if(multiple)result=Math.ceil(result/multiple)*multiple;return round(result)}
function supplyDate(row){return date(row.dueDate||row.needDate||row.due||row.date)||'9999-12-31'}
function supplies(state,sku,warehouse){
  const purchase=(state.purchaseOrders||[]).filter(row=>row.sku===sku&&(!row.warehouse||row.warehouse===warehouse)&&openStatus(row.status)).map(row=>({date:supplyDate(row),qty:num(row.qty),source:row.poNo||'Open PO'}));
  const planned=(state.plannedSupplyOrders||[]).filter(row=>row.sku===sku&&row.warehouse===warehouse&&['FIRM','SUBMITTED','APPROVED','RELEASED'].includes(row.status)).map(row=>({date:supplyDate(row),qty:num(row.quantity),source:row.plannedOrderNo}));
  return[...purchase,...planned].sort((a,b)=>a.date.localeCompare(b.date)||String(a.source).localeCompare(String(b.source)));
}
function availableStock(state,sku,warehouse){
  const stock=state.stock?.[sku]||{},reserved=typeof stock.reserved==='object'?num(stock.reserved?.[warehouse]):num(stock.reserved);
  return Math.max(0,num(stock[warehouse])-reserved);
}
function eventKey(event){return`${event.orderNo}|${event.productCode}|${event.sku}|${event.warehouse}|${event.needDate}`}
function mergeEvents(events){
  const merged=new Map();
  for(const event of events){const key=eventKey(event),current=merged.get(key);if(current){current.grossRequired+=event.grossRequired;current.levels.add(event.llc)}else merged.set(key,{...event,levels:new Set([event.llc])})}
  return[...merged.values()].map(event=>({...event,grossRequired:round(event.grossRequired),levels:[...event.levels].sort((a,b)=>a-b)}));
}

export function llcMaterialPlanRows(state,orders,{asOf,cutoff}={}){
  const graphs=new Map(),balances=new Map(),supplyQueues=new Map(),pending=[],rows=[];
  const graphFor=onDate=>{const key=date(onDate)||asOf;if(!graphs.has(key))graphs.set(key,getBomGraph(state,{onDate:key}));return graphs.get(key)};
  const enqueueChildren=(graph,parentItem,quantity,needDate,source)=>{
    const edges=graph.outgoing.get(parentItem)||[];
    if(!edges.length)throw new Error(`BOM not found for ${source.productCode}.`);
    for(const edge of edges)pending.push({...source,graph,sku:edge.childItem,warehouse:edge.warehouse,grossRequired:round(quantity*edge.quantity*(1+edge.wastePercent/100)),needDate,llc:graph.lowLevelCode.get(edge.childItem)||0,phantom:edge.phantom});
  };
  for(const order of orders){
    try{
      const graph=graphFor(order.due||asOf),product=(state.products||[]).find(item=>item.code===order.productCode);
      if(!product)throw new Error(`Product not found for ${order.productCode}.`);
      const rootItem=product.outputSku||product.code,rootNeed=order.due||cutoff,componentNeed=addDays(rootNeed,-leadDays(state,graph,rootItem));
      enqueueChildren(graph,rootItem,num(order.qty),componentNeed,{orderNo:order.orderNo,productCode:order.productCode,priority:order.priority||'NORMAL',sourceOrders:[order.orderNo]});
    }catch(error){rows.push({orderNo:order.orderNo,productCode:order.productCode,priority:order.priority||'NORMAL',needDate:order.due||cutoff,sku:'',name:'',warehouse:'',grossRequired:0,error:error.message,status:'BLOCKED',action:'FIX_BOM',projectedAvailable:0,scheduledReceipts:0,netRequired:0,plannedQuantity:0,releaseDate:'',llc:0,levels:[]})}
  }
  while(pending.length){
    pending.sort((a,b)=>a.llc-b.llc||a.needDate.localeCompare(b.needDate)||a.sku.localeCompare(b.sku)||a.orderNo.localeCompare(b.orderNo));
    const level=pending[0].llc,batch=[];while(pending.length&&pending[0].llc===level)batch.push(pending.shift());
    for(const demand of mergeEvents(batch)){
      const graph=demand.graph,product=productFor(graph,demand.sku);
      if(demand.phantom||product?.phantom){
        try{enqueueChildren(graph,demand.sku,demand.grossRequired,demand.needDate,demand)}catch(error){rows.push({...demand,error:error.message,status:'BLOCKED',action:'FIX_BOM',projectedAvailable:0,scheduledReceipts:0,netRequired:0,plannedQuantity:0,releaseDate:''})}
        continue;
      }
      const key=`${demand.sku}|${demand.warehouse}`,item=itemRecord(state,demand.sku);
      if(!balances.has(key))balances.set(key,availableStock(state,demand.sku,demand.warehouse));
      if(!supplyQueues.has(key))supplyQueues.set(key,supplies(state,demand.sku,demand.warehouse));
      let available=balances.get(key),scheduledReceipts=0;const queue=supplyQueues.get(key);
      while(queue.length&&queue[0].date<=demand.needDate){const receipt=queue.shift();available+=receipt.qty;scheduledReceipts+=receipt.qty}
      const safety=num(item.safetyStock),gross=round(demand.grossRequired),shortage=round(Math.max(0,gross+safety-available)),plannedQuantity=shortage?lotSize(shortage,item):0,projected=round(available+plannedQuantity-gross),lead=leadDays(state,graph,demand.sku),releaseDate=plannedQuantity?addDays(demand.needDate,-lead):'',action=product?'MAKE':'BUY';
      balances.set(key,projected);
      const row={...demand,name:item.name||product?.name||'',grossRequired:gross,safetyStock:safety,availableBefore:round(available),scheduledReceipts:round(scheduledReceipts),projectedAvailable:projected,netRequired:shortage,plannedQuantity,leadTimeDays:lead,releaseDate,action,status:plannedQuantity?(releaseDate<asOf?'PAST_DUE':'PLANNED'):'COVERED'};
      delete row.graph;delete row.phantom;rows.push(row);
      if(product&&plannedQuantity>0){try{enqueueChildren(graph,demand.sku,plannedQuantity,releaseDate,demand)}catch(error){rows.push({...row,sku:'',name:'',warehouse:'',grossRequired:0,error:error.message,status:'BLOCKED',action:'FIX_BOM',projectedAvailable:0,scheduledReceipts:0,netRequired:0,plannedQuantity:0,releaseDate:''})}}
    }
  }
  rows.sort((a,b)=>a.needDate.localeCompare(b.needDate)||(a.llc||0)-(b.llc||0)||(a.sku||'').localeCompare(b.sku||'')||(a.orderNo||'').localeCompare(b.orderNo||''));
  return rows;
}
