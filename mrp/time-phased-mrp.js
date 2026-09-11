import {explodeRequirements} from './advanced-manufacturing.js';

const num=value=>Number.isFinite(Number(value))?Number(value):0;
const round=value=>Number(num(value).toFixed(6));
const date=value=>String(value||'').slice(0,10);
const dayMs=86400000;
const addDays=(value,days)=>new Date(new Date(`${value}T12:00:00Z`).getTime()+days*dayMs).toISOString().slice(0,10);
const openStatus=status=>!['CLOSED','CANCELLED','REJECTED','COMPLETED','RECEIVED'].includes(String(status||'').toUpperCase());

export function normalizeTimePhasedMrp(state){state.plannedSupplyOrders??=[];state.mrpPlanningSettings??={horizonDays:90};state.mrpPlanningSettings.horizonDays=Math.max(1,num(state.mrpPlanningSettings.horizonDays)||90);return state}

function orderMultiple(quantity,item){const multiple=Math.max(0,num(item?.orderMultiple)),minimum=Math.max(0,num(item?.minimumOrderQty));let result=Math.max(quantity,minimum);if(multiple)result=Math.ceil(result/multiple)*multiple;return round(result)}
function supplyDate(row){return date(row.dueDate||row.needDate||row.due||row.date)}
function plannedSupplies(state,sku,warehouse){
  const purchase=(state.purchaseOrders||[]).filter(row=>row.sku===sku&&openStatus(row.status)).map(row=>({date:supplyDate(row)||'9999-12-31',qty:num(row.qty),source:row.poNo||'Open PO'}));
  const planned=(state.plannedSupplyOrders||[]).filter(row=>row.sku===sku&&row.warehouse===warehouse&&['FIRM','RELEASED'].includes(row.status)).map(row=>({date:row.needDate,qty:num(row.quantity),source:row.plannedOrderNo}));
  return[...purchase,...planned].sort((a,b)=>a.date.localeCompare(b.date));
}
function makeProduct(state,sku){return(state.products||[]).find(product=>product.code===sku||product.outputSku===sku)}

export function timePhasedMaterialPlan(state,{asOf=new Date().toISOString().slice(0,10),horizonDays}={}){
  normalizeTimePhasedMrp(state);const horizon=Math.max(1,num(horizonDays)||state.mrpPlanningSettings.horizonDays),cutoff=addDays(asOf,horizon),demands=[];
  const orders=(state.orders||[]).filter(order=>!['CANCELLED','COMPLETED'].includes(order.productionStatus)&&(!order.due||order.due<=cutoff)).sort((a,b)=>(a.due||cutoff).localeCompare(b.due||cutoff)||(a.orderNo||'').localeCompare(b.orderNo||''));
  for(const order of orders){try{for(const row of explodeRequirements(state,order.productCode,num(order.qty),{onDate:order.due||asOf}))demands.push({...row,orderNo:order.orderNo,productCode:order.productCode,priority:order.priority||'NORMAL',needDate:order.due||cutoff})}catch(error){demands.push({orderNo:order.orderNo,productCode:order.productCode,priority:order.priority||'NORMAL',needDate:order.due||cutoff,sku:'',name:'',warehouse:'',grossRequired:0,error:error.message})}}
  demands.sort((a,b)=>a.needDate.localeCompare(b.needDate)||(a.sku||'').localeCompare(b.sku||''));const balances=new Map(),supplyQueues=new Map(),rows=[];
  for(const demand of demands){if(demand.error){rows.push({...demand,status:'BLOCKED',action:'FIX_BOM',projectedAvailable:0,scheduledReceipts:0,netRequired:0,plannedQuantity:0,releaseDate:''});continue}const key=`${demand.sku}|${demand.warehouse}`,item=(state.skus||[]).find(row=>row.code===demand.sku);if(!balances.has(key))balances.set(key,Math.max(0,num(state.stock?.[demand.sku]?.[demand.warehouse])-num(state.stock?.[demand.sku]?.reserved)));if(!supplyQueues.has(key))supplyQueues.set(key,plannedSupplies(state,demand.sku,demand.warehouse));let available=balances.get(key),scheduledReceipts=0;const queue=supplyQueues.get(key);while(queue.length&&queue[0].date<=demand.needDate){const receipt=queue.shift();available+=receipt.qty;scheduledReceipts+=receipt.qty}const safety=num(item?.safetyStock),gross=round(demand.grossRequired),shortage=Math.max(0,gross+safety-available),plannedQuantity=orderMultiple(shortage,item),projected=round(available+plannedQuantity-gross),leadDays=Math.max(0,num(item?.leadTime)),releaseDate=plannedQuantity?addDays(demand.needDate,-leadDays):'',action=makeProduct(state,demand.sku)?'MAKE':'BUY';balances.set(key,projected);rows.push({...demand,grossRequired:gross,safetyStock:safety,availableBefore:round(available),scheduledReceipts:round(scheduledReceipts),projectedAvailable:projected,netRequired:round(shortage),plannedQuantity,leadTimeDays:leadDays,releaseDate,action,status:plannedQuantity?(releaseDate<asOf?'PAST_DUE':'PLANNED'):'COVERED'})}
  return{asOf,horizonDays:horizon,cutoff,rows,exceptions:rows.filter(row=>['PAST_DUE','BLOCKED'].includes(row.status)),plannedBuy:round(rows.filter(row=>row.action==='BUY').reduce((sum,row)=>sum+row.plannedQuantity,0)),plannedMake:round(rows.filter(row=>row.action==='MAKE').reduce((sum,row)=>sum+row.plannedQuantity,0))};
}

export function firmPlannedSupply(state,row,{id,createdAt=new Date().toISOString(),createdBy='planner'}={}){
  normalizeTimePhasedMrp(state);if(!row?.sku||!(num(row.plannedQuantity)>0)||!['BUY','MAKE'].includes(row.action))throw new Error('Select a valid uncovered MRP requirement.');const peggingKey=`${row.orderNo}|${row.productCode}|${row.sku}|${row.warehouse}|${row.needDate}`;const existing=state.plannedSupplyOrders.find(order=>order.peggingKey===peggingKey&&openStatus(order.status));if(existing)throw new Error('An open planned order already covers this pegged requirement.');const order={id:id||`MPO-${Date.now()}`,plannedOrderNo:`MPO-${String(state.plannedSupplyOrders.length+1).padStart(5,'0')}`,type:row.action,sku:row.sku,warehouse:row.warehouse,quantity:num(row.plannedQuantity),releaseDate:row.releaseDate,needDate:row.needDate,status:'FIRM',priority:row.priority||'NORMAL',sourceOrderNo:row.orderNo,sourceProductCode:row.productCode,peggingKey,createdAt,createdBy};state.plannedSupplyOrders.unshift(order);return order
}

export function releasePlannedSupply(state,id,{releasedAt=new Date().toISOString(),releasedBy='planner',documentId,documentNo}={}){
  normalizeTimePhasedMrp(state);const order=state.plannedSupplyOrders.find(row=>row.id===id);if(!order)throw new Error('Planned order not found.');if(order.status!=='FIRM')throw new Error('Only a firm planned order can be released.');
  if(order.type==='BUY'){
    state.purchaseRequests??=[];const reference=documentNo||`PR-${String(state.purchaseRequests.length+1).padStart(4,'0')}`;if(state.purchaseRequests.some(row=>row.plannedOrderId===order.id))throw new Error('This planned order already has a purchase request.');state.purchaseRequests.unshift({id:documentId||`PR-MRP-${Date.now()}`,prNo:reference,date:date(releasedAt),requester:releasedBy,sku:order.sku,warehouse:order.warehouse,qty:order.quantity,needDate:order.needDate,priority:order.priority||'NORMAL',budgetStatus:'PENDING',status:'DRAFT',source:'TIME_PHASED_MRP',plannedOrderId:order.id,sourceOrders:[order.sourceOrderNo]});order.releasedReference=reference;
  }else{
    state.orders??=[];const product=makeProduct(state,order.sku);if(!product)throw new Error(`No producible item is defined for ${order.sku}.`);const reference=documentNo||`MO-${String(state.orders.length+1).padStart(4,'0')}`;if(state.orders.some(row=>row.plannedOrderId===order.id))throw new Error('This planned order already has a manufacturing order.');state.orders.unshift({id:documentId||`MO-MRP-${Date.now()}`,orderNo:reference,date:date(releasedAt),customer:'Internal MRP',productCode:product.code,qty:order.quantity,due:order.needDate,priority:order.priority||'NORMAL',notes:`Released from ${order.plannedOrderNo}; pegged to ${order.sourceOrderNo}`,productionStatus:'',source:'TIME_PHASED_MRP',plannedOrderId:order.id,parentOrderNo:order.sourceOrderNo});order.releasedReference=reference;
  }
  order.status='RELEASED';order.releasedAt=releasedAt;order.releasedBy=releasedBy;return order
}

export function cancelPlannedSupply(state,id,{cancelledBy='planner',cancelledAt=new Date().toISOString()}={}){const order=(state.plannedSupplyOrders||[]).find(row=>row.id===id);if(!order)throw new Error('Planned order not found.');if(order.status!=='FIRM')throw new Error('Only a firm planned order can be cancelled.');order.status='CANCELLED';order.cancelledBy=cancelledBy;order.cancelledAt=cancelledAt;return order}
