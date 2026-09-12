import {effectiveDemandSchedule} from './advanced-manufacturing.js';
import {llcMaterialPlanRows} from './llc-planning-engine.js';

const num=value=>Number.isFinite(Number(value))?Number(value):0;
const round=value=>Number(num(value).toFixed(6));
const date=value=>String(value||'').slice(0,10);
const dayMs=86400000;
const addDays=(value,days)=>new Date(new Date(`${value}T12:00:00Z`).getTime()+days*dayMs).toISOString().slice(0,10);
const openStatus=status=>!['CLOSED','CANCELLED','REJECTED','COMPLETED','RECEIVED'].includes(String(status||'').toUpperCase());

export function normalizeTimePhasedMrp(state){state.plannedSupplyOrders??=[];state.mrpPlanningSettings??={horizonDays:90};state.mrpPlanningSettings.horizonDays=Math.max(1,num(state.mrpPlanningSettings.horizonDays)||90);return state}

function makeProduct(state,sku){return(state.products||[]).find(product=>product.code===sku||product.outputSku===sku)}

export function timePhasedMaterialPlan(state,{asOf=new Date().toISOString().slice(0,10),horizonDays,demandSchedule}={}){
  normalizeTimePhasedMrp(state);const horizon=Math.max(1,num(horizonDays)||state.mrpPlanningSettings.horizonDays),cutoff=addDays(asOf,horizon);
  const orders=[...(demandSchedule||effectiveDemandSchedule(state,{cutoff}))].sort((a,b)=>(a.due||cutoff).localeCompare(b.due||cutoff)||(a.orderNo||'').localeCompare(b.orderNo||''));
  const rows=llcMaterialPlanRows(state,orders,{asOf,cutoff});
  return{asOf,horizonDays:horizon,cutoff,rows,exceptions:rows.filter(row=>['PAST_DUE','BLOCKED'].includes(row.status)),plannedBuy:round(rows.filter(row=>row.action==='BUY').reduce((sum,row)=>sum+row.plannedQuantity,0)),plannedMake:round(rows.filter(row=>row.action==='MAKE').reduce((sum,row)=>sum+row.plannedQuantity,0))};
}

export function plannedSupplyExceptions(state,{asOf=new Date().toISOString().slice(0,10),horizonDays}={}){
  normalizeTimePhasedMrp(state);const rows=[];
  for(const order of state.plannedSupplyOrders.filter(item=>['FIRM','SUBMITTED','APPROVED','RELEASED'].includes(item.status))){
    const withoutCurrent={...state,plannedSupplyOrders:state.plannedSupplyOrders.filter(item=>item.id!==order.id)},plan=timePhasedMaterialPlan(withoutCurrent,{asOf,horizonDays}),requirement=plan.rows.find(row=>`${row.orderNo}|${row.productCode}|${row.sku}|${row.warehouse}|${row.needDate}`===order.peggingKey)||plan.rows.find(row=>row.orderNo===order.sourceOrderNo&&row.productCode===order.sourceProductCode&&row.sku===order.sku&&row.warehouse===order.warehouse),actions=[];
    if(!requirement||!requirement.plannedQuantity)actions.push('CANCEL_REVIEW');
    else{if(requirement.plannedQuantity>num(order.quantity))actions.push('INCREASE');else if(requirement.plannedQuantity<num(order.quantity))actions.push('REDUCE');if(requirement.releaseDate<order.releaseDate)actions.push('EXPEDITE');else if(requirement.releaseDate>order.releaseDate)actions.push('DEFER')}
    rows.push({plannedOrderId:order.id,plannedOrderNo:order.plannedOrderNo,status:order.status,sku:order.sku,sourceOrderNo:order.sourceOrderNo,currentQuantity:num(order.quantity),suggestedQuantity:num(requirement?.plannedQuantity),currentReleaseDate:order.releaseDate,suggestedReleaseDate:requirement?.releaseDate||'',currentNeedDate:order.needDate,suggestedNeedDate:requirement?.needDate||order.needDate,actions:actions.length?actions:['ALIGNED'],severity:actions.includes('CANCEL_REVIEW')||actions.includes('INCREASE')||actions.includes('EXPEDITE')?'ACTION_REQUIRED':actions.length?'REVIEW':'ALIGNED'});
  }
  return{asOf,rows,actionRequired:rows.filter(row=>row.severity==='ACTION_REQUIRED').length,review:rows.filter(row=>row.severity==='REVIEW').length,aligned:rows.filter(row=>row.severity==='ALIGNED').length}
}

export function firmPlannedSupply(state,row,{id,createdAt=new Date().toISOString(),createdBy='planner'}={}){
  normalizeTimePhasedMrp(state);if(!row?.sku||!(num(row.plannedQuantity)>0)||!['BUY','MAKE'].includes(row.action))throw new Error('Select a valid uncovered MRP requirement.');const peggingKey=`${row.orderNo}|${row.productCode}|${row.sku}|${row.warehouse}|${row.needDate}`;const existing=state.plannedSupplyOrders.find(order=>order.peggingKey===peggingKey&&openStatus(order.status));if(existing)throw new Error('An open planned order already covers this pegged requirement.');const order={id:id||`MPO-${Date.now()}`,plannedOrderNo:`MPO-${String(state.plannedSupplyOrders.length+1).padStart(5,'0')}`,type:row.action,sku:row.sku,warehouse:row.warehouse,quantity:num(row.plannedQuantity),releaseDate:row.releaseDate,needDate:row.needDate,status:'FIRM',priority:row.priority||'NORMAL',sourceOrderNo:row.orderNo,sourceProductCode:row.productCode,peggingKey,createdAt,createdBy,history:[{action:'FIRMED',at:createdAt,user:createdBy}]};state.plannedSupplyOrders.unshift(order);return order
}

function findPlannedOrder(state,id){const order=(state.plannedSupplyOrders||[]).find(row=>row.id===id);if(!order)throw new Error('Planned order not found.');order.history??=[];return order}
function history(order,action,user,at,details=''){order.history.push({action,user,at,details})}

export function updatePlannedSupply(state,id,{quantity,releaseDate,needDate,user='planner',at=new Date().toISOString()}={}){const order=findPlannedOrder(state,id);if(order.status!=='FIRM')throw new Error('Only a firm planned order can be edited.');const qty=num(quantity);if(!(qty>0))throw new Error('Planned quantity must be greater than zero.');if(!date(releaseDate)||!date(needDate))throw new Error('Release and need dates are required.');if(date(releaseDate)>date(needDate))throw new Error('Release date cannot be after the need date.');const before=`${order.quantity}|${order.releaseDate}|${order.needDate}`;order.quantity=qty;order.releaseDate=date(releaseDate);order.needDate=date(needDate);history(order,'EDITED',user,at,`${before} → ${order.quantity}|${order.releaseDate}|${order.needDate}`);return order}

export function submitPlannedSupply(state,id,{submittedBy='planner',submittedAt=new Date().toISOString()}={}){const order=findPlannedOrder(state,id);if(order.status!=='FIRM')throw new Error('Only a firm planned order can be submitted.');if(!String(submittedBy).trim())throw new Error('Planner identity is required.');order.status='SUBMITTED';order.submittedBy=String(submittedBy).trim();order.submittedAt=submittedAt;history(order,'SUBMITTED',order.submittedBy,submittedAt);return order}

export function approvePlannedSupply(state,id,{approvedBy='manager',approvedAt=new Date().toISOString()}={}){const order=findPlannedOrder(state,id);if(order.status!=='SUBMITTED')throw new Error('Submit the planned order before approval.');const approver=String(approvedBy).trim();if(!approver)throw new Error('Approver identity is required.');if([order.createdBy,order.submittedBy].filter(Boolean).some(user=>String(user).toLowerCase()===approver.toLowerCase()))throw new Error('Approver must be independent from the planner.');order.status='APPROVED';order.approvedBy=approver;order.approvedAt=approvedAt;history(order,'APPROVED',approver,approvedAt);return order}

export function rejectPlannedSupply(state,id,{rejectedBy='manager',reason='',rejectedAt=new Date().toISOString()}={}){const order=findPlannedOrder(state,id);if(order.status!=='SUBMITTED')throw new Error('Only a submitted planned order can be rejected.');const reviewer=String(rejectedBy).trim(),note=String(reason).trim();if(!reviewer)throw new Error('Reviewer identity is required.');if(!note)throw new Error('Rejection reason is required.');if([order.createdBy,order.submittedBy].filter(Boolean).some(user=>String(user).toLowerCase()===reviewer.toLowerCase()))throw new Error('Reviewer must be independent from the planner.');order.status='REJECTED';order.rejectedBy=reviewer;order.rejectedAt=rejectedAt;order.rejectionReason=note;history(order,'REJECTED',reviewer,rejectedAt,note);return order}

export function releasePlannedSupply(state,id,{releasedAt=new Date().toISOString(),releasedBy='planner',documentId,documentNo}={}){
  normalizeTimePhasedMrp(state);const order=findPlannedOrder(state,id);if(order.status!=='APPROVED')throw new Error('Management approval is required before release.');
  if(order.type==='BUY'){
    state.purchaseRequests??=[];const reference=documentNo||`PR-${String(state.purchaseRequests.length+1).padStart(4,'0')}`;if(state.purchaseRequests.some(row=>row.plannedOrderId===order.id))throw new Error('This planned order already has a purchase request.');state.purchaseRequests.unshift({id:documentId||`PR-MRP-${Date.now()}`,prNo:reference,date:date(releasedAt),requester:releasedBy,sku:order.sku,warehouse:order.warehouse,qty:order.quantity,needDate:order.needDate,priority:order.priority||'NORMAL',budgetStatus:'PENDING',status:'DRAFT',source:'TIME_PHASED_MRP',plannedOrderId:order.id,sourceOrders:[order.sourceOrderNo]});order.releasedReference=reference;
  }else{
    state.orders??=[];const product=makeProduct(state,order.sku);if(!product)throw new Error(`No producible item is defined for ${order.sku}.`);const reference=documentNo||`MO-${String(state.orders.length+1).padStart(4,'0')}`;if(state.orders.some(row=>row.plannedOrderId===order.id))throw new Error('This planned order already has a manufacturing order.');state.orders.unshift({id:documentId||`MO-MRP-${Date.now()}`,orderNo:reference,date:date(releasedAt),customer:'Internal MRP',productCode:product.code,qty:order.quantity,due:order.needDate,priority:order.priority||'NORMAL',notes:`Released from ${order.plannedOrderNo}; pegged to ${order.sourceOrderNo}`,productionStatus:'',source:'TIME_PHASED_MRP',plannedOrderId:order.id,parentOrderNo:order.sourceOrderNo});order.releasedReference=reference;
  }
  order.status='RELEASED';order.releasedAt=releasedAt;order.releasedBy=releasedBy;history(order,'RELEASED',releasedBy,releasedAt,order.releasedReference);return order
}

export function cancelPlannedSupply(state,id,{cancelledBy='planner',cancelledAt=new Date().toISOString()}={}){const order=(state.plannedSupplyOrders||[]).find(row=>row.id===id);if(!order)throw new Error('Planned order not found.');if(order.status!=='FIRM')throw new Error('Only a firm planned order can be cancelled.');order.status='CANCELLED';order.cancelledBy=cancelledBy;order.cancelledAt=cancelledAt;return order}
