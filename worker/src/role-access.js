import {isManager,isWarehouseUser,editableStateFields,businessFields,privateMoneyField,prepareRoleEdit} from '../../mrp/access-policy.mjs';

export const rolePolicyEnabled=(env,actor)=>String(env.MRP_ROLE_POLICY_WORKSPACES||'').split(',').map(x=>x.trim()).includes(actor.workspace.slug);
export const accessError=(status,message)=>{throw Object.assign(Error(message),{status});};
const copy=value=>value===undefined?undefined:structuredClone(value);
export async function warehouseAccess(env,actor){
 if(actor.user.role==='CEO')return null;
 const result=await env.DB.prepare('SELECT warehouse FROM mrp_mobile_warehouse_grants WHERE workspace_id=? AND user_id=?').bind(actor.workspace.id,actor.user.id).all();
 return new Set((result.results||[]).map(x=>x.warehouse));
}
export async function requireWarehouse(env,actor,state,code,{quality=false}={}){
 if(!isWarehouseUser(actor.user.role))accessError(403,'Warehouse role required.');
 if(!(state.warehouses||[]).some(x=>x.code===code&&x.active!==false))accessError(422,'Unknown or inactive warehouse.');
 if(code==='WH-QA') {if(!quality||!isManager(actor.user.role))accessError(403,'Quarantine requires a quality decision.');return;}
 const allowed=await warehouseAccess(env,actor);if(allowed&&!allowed.has(code))accessError(403,'Warehouse permission is required.');
}
function stripMoney(value,{prices=false}={}){
 if(Array.isArray(value))return value.map(v=>stripMoney(v,{prices}));
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!privateMoneyField(key)&&(prices||!(/price/i.test(key)))).map(([key,v])=>[key,stripMoney(v,{prices})]));
}
export async function projectRoleState(env,actor,state){
 if(!state||actor.user.role==='CEO')return state;
 const manager=isManager(actor.user.role),allowed=await warehouseAccess(env,actor);
 const has=code=>!allowed||allowed.has(code)||(manager&&code==='WH-QA');
 const selected=['schemaVersion','appVersion','company','settings','warehouses','products','skus','stock','receipts','qualityInspections','inventoryLots','inventoryMovements','inventoryTransactions','cycleCounts',...(manager?businessFields.concat(['productionJobs','operationSessions','andonAlerts','mrpRuns','sopPlans','mpsSnapshots']):['purchaseOrders','salesOrders','shipments'])];
 const result={};for(const key of new Set(selected))if(state[key]!==undefined)result[key]=stripMoney(state[key],{prices:manager});
 result.settings={language:'en',currency:state.settings?.currency||'TRY',barcodeStandard:state.settings?.barcodeStandard||'EAN_13'};
 result.warehouses=(result.warehouses||[]).filter(x=>has(x.code));
 result.stock=Object.fromEntries(Object.entries(result.stock||{}).map(([sku,balances])=>[sku,Object.fromEntries(Object.entries(balances).filter(([wh])=>has(wh)||(manager&&wh==='reserved')))]));
 for(const key of ['receipts','inventoryLots','inventoryMovements','inventoryTransactions','cycleCounts'])result[key]=(result[key]||[]).filter(x=>[x.targetWarehouse||x.sourceWarehouse||x.warehouse,x.destinationWarehouse].filter(Boolean).every(has));
 const receiptIds=new Set(result.receipts.map(x=>x.id));
 result.qualityInspections=(result.qualityInspections||[]).filter(x=>x.receiptId?receiptIds.has(x.receiptId):manager);
 if(!manager){
  if(!has('WH-FG')){result.shipments=[];result.salesOrders=[];}
  result.purchaseOrders=(result.purchaseOrders||[]).filter(po=>has(po.destinationWarehouse||(state.skus||[]).find(x=>x.code===po.sku)?.warehouse||'WH-RM'));
 }
 for(const count of result.cycleCounts)if(count.status==='OPEN')for(const line of count.lines||[]){delete line.expectedQty;delete line.varianceQty;}
 // Read-only settlement status is useful to purchasing/sales; no financial documents.
 if(manager)for(const key of ['salesOrders','purchaseRequests'])for(const row of result[key]||[]){const original=(state[key]||[]).find(x=>x.id===row.id);if(original?.paymentStatus)row.paymentStatus=original.paymentStatus;if(original?.budgetStatus)row.budgetStatus=original.budgetStatus;}
 return result;
}
const equal=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const controlled={
 financeApprovals:['status'],
 skus:['cost','standardCost','costMethod'],
 purchaseRequests:['budgetStatus'],
 purchaseOrders:['status','received','receivedQty','matchedAt'],
 salesOrders:['status','reservedQty','paymentStatus','creditApproved','qcStatus'],
 shipments:['status','shippingRelease','shippedAt','oqcStatus'],
 invoices:['status','postedAt','journalEntryId','paidAmount','paymentStatus'],
};
export function applyRolePatch(actor,state,changes){
 if(!changes||typeof changes!=='object'||Array.isArray(changes))accessError(400,'An explicit changes object is required.');
 const allowed=new Set(editableStateFields(actor.user.role)),ceo=actor.user.role==='CEO',next=structuredClone(state);
 for(const [key,value] of Object.entries(changes)){
  if(!allowed.has(key))accessError(403,`Your role cannot edit ${key}.`);
  if(key==='company'||key==='settings'){next[key]=copy(value);continue;}
  if(!['boms','bomProfiles','bomHistory','capacityCalendar','planningTimeFences','mrpPlanningSettings'].includes(key)&&!Array.isArray(value))accessError(422,'A list of records is required.');
  if(Array.isArray(value)){
   const prior=state[key]||[],ids=new Set();
   next[key]=value.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row))accessError(422,'Invalid record.');
    const id=row.id||row.code;if(typeof id!=='string'||!id||id.length>256||ids.has(id))accessError(422,'Records need unique identifiers.');ids.add(id);
    const old=prior.find(x=>(x.id||x.code)===id);
    if(key==='purchaseRequests'&&row.status==='APPROVED'&&old?.status!=='APPROVED'){
     if(!old||old.createdBy===actor.user.id)accessError(403,'An independent purchase-request approver is required.');
    }
    if(!ceo&&!equal(prepareRoleEdit(actor.user.role,row),row))accessError(403,'Financial fields are restricted to the CEO.');
    if(key==='purchaseOrders'&&old&&old.status!=='DRAFT')for(const field of ['sku','qty','unitPrice','supplierCode','prNo','poNo'])if(!equal(row[field],old[field]))accessError(403,'Approved purchase lines cannot be rewritten.');
    if(key==='salesOrders'&&old&&Number(old.reservedQty)>0)for(const field of ['sku','qty','unitPrice','customer','orderNo'])if(!equal(row[field],old[field]))accessError(403,'Reserved sales lines cannot be rewritten.');
    if(old&&['POSTED','SHIPPED','MATCHED','CLOSED','REVERSED'].includes(old.status)&&!equal(stripMoney(old,{prices:true}),stripMoney(row,{prices:true})))accessError(403,'Final documents require a controlled correction.');
    const merged=ceo?{...old,...copy(row)}:{...old,...mergeHidden(old,row)};
    for(const field of controlled[key]||[]){
     const defaultValue=field==='status'?(key==='financeApprovals'?'PENDING':'DRAFT'):field==='paymentStatus'||field==='budgetStatus'||field==='qcStatus'||field==='oqcStatus'?'PENDING':field==='shippingRelease'?'BLOCKED':field==='costMethod'?'STANDARD':field==='received'||field==='creditApproved'?false:field.endsWith('At')||field==='journalEntryId'?'':0;
     const expected=old?.[field]??defaultValue;
     if(row[field]!==undefined&&!equal(row[field],expected)&&!(ceo&&key==='skus'&&['cost','standardCost'].includes(field)))accessError(403,`${field} requires its authorized workflow.`);
     merged[field]=(ceo&&key==='skus'&&['cost','standardCost'].includes(field))?(row[field]??expected):expected;
    }
    merged.createdBy=old?(old.createdBy||'legacy'):actor.user.id;merged.createdByUsername=old?(old.createdByUsername||'legacy'):actor.user.username;
    if(actor.user.role==='OPERATOR'){
     const fields=new Set(['id','shipmentNo','orderNo','pickQty','packingList','invoiceNo','podNo','status','shippingRelease','oqcStatus','createdBy','createdByUsername']);
     for(const k of Object.keys(row))if(!fields.has(k)&&!equal(row[k],old?.[k]))accessError(403,'Warehouse operators may edit shipment preparation only.');
     if(old&&!equal(old.orderNo,row.orderNo))accessError(403,'Create a new draft for a different order.');
    }
    if(!ceo)for(const field of Object.keys(row))if(privateMoneyField(field)&&!['paymentTerms','paymentStatus','budgetStatus'].includes(field)){
     if(!equal(row[field],old?.[field])&&!(row[field]===0||row[field]===''||row[field]===false))accessError(403,'Financial fields are restricted to the CEO.');
     if(old?.[field]===undefined)delete merged[field];else merged[field]=old[field];
    }
    return merged;
   });
   for(const old of prior)if(!ids.has(old.id||old.code)&&(!['DRAFT',undefined].includes(old.status)||(key==='skus'&&Object.values(state.stock?.[old.code]||{}).some(v=>Number(v)!==0))))accessError(403,'Active or final records cannot be deleted.');
  }else{
   if(value===null||typeof value!=='object')accessError(422,'Invalid collection.');
   if(!ceo&&!equal(prepareRoleEdit(actor.user.role,value),value))accessError(403,'Financial fields are restricted to the CEO.');
   next[key]=ceo?copy(value):mergeHidden(state[key],value);
  }
 }
 return next;
}
function mergeHidden(old,value){
 if(Array.isArray(value))return value.map((v,i)=>mergeHidden(Array.isArray(old)?old.find(x=>x?.id&&x.id===v?.id)||old[i]:undefined,v));
 if(!value||typeof value!=='object')return copy(value);
 const merged={};for(const [key,v] of Object.entries(old||{}))if(privateMoneyField(key))merged[key]=copy(v);
 for(const [key,v] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))accessError(400,'Invalid field.');merged[key]=mergeHidden(old?.[key],v);}return merged;
}
