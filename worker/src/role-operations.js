import {isManager,isWarehouseUser} from '../../mrp/access-policy.mjs';
import {parseQuantity} from '../../mrp/numeric-input.mjs';
import {rolePolicyEnabled,accessError as fail,requireWarehouse,projectRoleState,applyRolePatch} from './role-access.js';
import {createInventoryTransaction,submitInventoryTransaction,approveInventoryTransaction,postInventoryTransaction,reverseInventoryTransaction} from '../../mrp/inventory-issue-transfer.js';
import {createCycleCount,submitCycleCount,approveCycleCount} from '../../mrp/cycle-counting.js';
import {createAccountingPeriod,closeAccountingPeriod,postJournalEntry,reverseJournalEntry,setAccountingProfile,normalizeFinancialState,trialBalance} from '../../mrp/financial-core.js';
import {ensureInventoryCostCoverage,receiveInventoryCost,issueInventoryCost,setInventoryCostMethod} from '../../mrp/inventory-costing.js';
import {createMrpAuditSeal} from './mrp.js';
import {createProductionJob,releaseProductionJob,issueProductionJob,completeProductionJob,cancelProductionJob,applyProductionQualityDecision} from '../../mrp/production-workflow.js';
import {updateBackflushQuantity,submitBackflush,approveBackflush} from '../../mrp/controlled-backflush.js';
import {startOperation,pauseOperation,resumeOperation,completeOperation,raiseAndon,updateAndon} from '../../mrp/shop-floor-live.js';
import {completeThreeWayMatch} from '../../mrp/procurement-workflow.js';
import {applyReceiptQcDecision,applyManagerReceiptDecision} from '../../mrp/receipt-workflow.js';
import {postProductionCostVariance} from '../../mrp/production-cost-variance.js';
import {settleWipWorkOrder} from '../../mrp/wip-settlement.js';
import {reopenSettledWorkOrder} from '../../mrp/production-close-control.js';

const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json','cache-control':'no-store'}});
const text=(v,max=500)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u001f]/.test(v))fail(422,'Invalid text.');return v.trim();};
const number=v=>{const n=parseQuantity(v);if(!Number.isFinite(n)||n<0||n>1e9)fail(422,'Invalid quantity or amount.');return n;};
const manager=actor=>{if(!isManager(actor.user.role))fail(403,'Operations manager required.');};
const ceo=actor=>{if(actor.user.role!=='CEO')fail(403,'CEO / Finance role required.');};
const independent=(actor,item)=>{if([item.createdBy,item.requestedById,item.submittedById,item.counterId].includes(actor.user.id)||[item.createdByUsername,item.requestedBy,item.submittedBy,item.counter].includes(actor.user.username))fail(403,'An independent reviewer is required.');};
const find=(state,collection,id)=>{const row=(state[collection]||[]).find(x=>x.id===id);if(!row)fail(404,'Record not found.');return row;};
const date=value=>{const v=text(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail(422,'Invalid date.');return v;};

export async function handleRoleOperations(request,env,url,actor){
 if(!rolePolicyEnabled(env,actor))fail(404,'Role operations are not enabled.');
 if(request.method!=='POST')fail(405,'POST required.');
 const raw=await request.text();if(new TextEncoder().encode(raw).length>5*1024*1024)fail(413,'Request too large.');
 let body;try{body=JSON.parse(raw);}catch{fail(400,'Invalid JSON.');}
 const row=await env.DB.prepare('SELECT state_json,revision FROM mrp_state WHERE workspace_id=?').bind(actor.workspace.id).first();
 if(!row?.state_json)fail(409,'Company state is not initialized.');
 if(!Number.isInteger(body.expectedRevision)||body.expectedRevision!==row.revision)fail(409,'Data changed. Refresh before continuing.');
 let state=JSON.parse(row.state_json);const before=structuredClone(state),action=text(body.action||'',80),input=body.input||{},user=actor.user.username;
 const meta={user,role:actor.user.role,workspace:actor.workspace.slug,device:'server',at:new Date().toISOString(),deferPosting:actor.user.role!=='CEO'};
 let result;
 try{
  if(action==='edit'){if(input.changes?.shipments)await requireWarehouse(env,actor,state,'WH-FG');state=applyRolePatch(actor,state,input.changes);}
  else if(action.startsWith('inventory.')){
   if(!isWarehouseUser(actor.user.role))fail(403,'Warehouse role required.');
   if(action==='inventory.create'){
    await requireWarehouse(env,actor,state,input.sourceWarehouse);
    if(input.type==='TRANSFER')await requireWarehouse(env,actor,state,input.destinationWarehouse);
    result=createInventoryTransaction(state,{type:input.type,purpose:input.purpose,sku:text(input.sku),sourceWarehouse:input.sourceWarehouse,destinationWarehouse:input.destinationWarehouse,quantity:number(input.quantity),reference:text(input.reference||''),reason:text(input.reason||''),requestedBy:user});
    result.requestedById=actor.user.id;
   }else{
    const item=find(state,'inventoryTransactions',input.id);await requireWarehouse(env,actor,state,item.sourceWarehouse);
    if(item.destinationWarehouse)await requireWarehouse(env,actor,state,item.destinationWarehouse);
    if(action==='inventory.submit'){if(item.requestedById!==actor.user.id&&actor.user.role!=='CEO')fail(403,'Only the requester can submit this document.');result=submitInventoryTransaction(state,item.id,{submittedBy:user});item.submittedById=actor.user.id;}
    else if(action==='inventory.approve'){manager(actor);independent(actor,item);approveInventoryTransaction(state,item.id,{approvedBy:user});result=postInventoryTransaction(state,item.id,{postedBy:user,deferFinance:actor.user.role!=='CEO'});}
    else if(action==='inventory.post'){manager(actor);independent(actor,item);result=postInventoryTransaction(state,item.id,{postedBy:user,deferFinance:actor.user.role!=='CEO'});}
    else if(action==='inventory.reverse'){ceo(actor);independent(actor,item);result=reverseInventoryTransaction(state,item.id,{reversedBy:user,reason:text(input.reason||'')});}
    else fail(400,'Unknown inventory action.');
   }
  }else if(action.startsWith('count.')){
   if(!isWarehouseUser(actor.user.role))fail(403,'Warehouse role required.');
   if(action==='count.create'){await requireWarehouse(env,actor,state,input.warehouse);result=createCycleCount(state,{warehouse:input.warehouse,scope:input.scope==='DUE'?'DUE':'ALL',requestedBy:user});result.requestedById=actor.user.id;}
   else{
    const item=find(state,'cycleCounts',input.id);await requireWarehouse(env,actor,state,item.warehouse);
    if(action==='count.submit'){const counts=Object.fromEntries(Object.entries(input.counts||{}).map(([key,v])=>[key,number(v)]));result=submitCycleCount(state,item.id,{counter:user,counts,allowRequesterCount:true});item.counterId=actor.user.id;}
    else if(action==='count.review'){manager(actor);independent(actor,item);if(!['SUBMITTED','REVIEW_REQUIRED'].includes(item.status))fail(409,'Submitted count required.');item.status='REVIEWED';item.reviewedBy=user;item.reviewedById=actor.user.id;result=item;}
    else if(action==='count.approve'){
     ceo(actor);independent(actor,item);if(item.status!=='REVIEWED'||!item.reviewedById)fail(409,'Manager review required.');
     for(const line of item.lines){
      if(Number(state.stock?.[line.sku]?.[item.warehouse]||0)!==line.expectedQty)fail(409,'Stock moved since counting. Create a fresh count.');
      const sku=(state.skus||[]).find(x=>x.code===line.sku);if(line.varianceQty&&(sku?.lotTracked||sku?.serialTracked))fail(422,'Tracked stock requires a lot/serial reconciliation before adjustment.');
      if(!line.varianceQty)continue;
      ensureInventoryCostCoverage(state,{sku:line.sku,warehouse:item.warehouse,physicalQuantity:line.expectedQty,unitCost:sku?.cost||0,reference:item.countNo},meta);
      const change=line.varianceQty>0?receiveInventoryCost(state,{sku:line.sku,warehouse:item.warehouse,qty:line.varianceQty,unitCost:sku?.cost||0,reference:item.countNo},meta):issueInventoryCost(state,{sku:line.sku,warehouse:item.warehouse,qty:-line.varianceQty,reference:item.countNo},meta);
      const account=({'WH-RM':'1200','WH-PK':'1210','WH-FG':'1230','WH-SF':'1220'})[item.warehouse];
      if(change.value)postJournalEntry(state,{description:'Inventory count adjustment',reference:item.countNo,source:'CYCLE_COUNT',sourceId:item.id,lines:[{accountCode:account,debit:line.varianceQty>0?change.value:0,credit:line.varianceQty<0?change.value:0},{accountCode:'6000',credit:line.varianceQty>0?change.value:0,debit:line.varianceQty<0?change.value:0}]},meta);
     }
     item.status='SUBMITTED';result=approveCycleCount(state,item.id,{approver:user});
    }else fail(400,'Unknown count action.');
   }
  }else if(action.startsWith('quality.')){
   manager(actor);
   if(action==='quality.create'){
    const type=['IPQC','FQC','OQC'].includes(input.type)?input.type:'IQC';
    state.qualityInspections??=[];result={id:crypto.randomUUID(),inspectionNo:`QC-${crypto.randomUUID().slice(0,8)}`,type,reference:text(input.reference||''),sku:text(input.sku||''),qty:number(input.qty||0),date:meta.at.slice(0,10),result:'PENDING',released:false,notes:'',createdBy:actor.user.id};state.qualityInspections.unshift(result);
   }else{
    const inspection=find(state,'qualityInspections',input.id);
    if(inspection.receiptId?.startsWith('MOB-'))fail(409,'Use the receipt review console for this receipt.');
    if(inspection.released)fail(409,'This inspection already has a decision.');
    if(!['ACCEPTED','REJECTED','CONDITIONAL'].includes(input.result))fail(422,'Select a quality result.');
    inspection.result=input.result;inspection.notes=text(input.notes||'',1000);inspection.inspector=user;
    if(inspection.productionJobId){await requireWarehouse(env,actor,state,'WH-FG');result=applyProductionQualityDecision(state,inspection.id,{ncrNo:`NCR-${inspection.id}`,meta});}
    else if(inspection.receiptId){const receipt=find(state,'receipts',inspection.receiptId);await requireWarehouse(env,actor,state,receipt.targetWarehouse);independent(actor,receipt);applyReceiptQcDecision(state,inspection.id,`NCR-${inspection.id}`);if(inspection.result==='ACCEPTED')applyManagerReceiptDecision(state,receipt.id,true,'',meta);}
    else {inspection.released=true;inspection.decidedBy=user;inspection.decidedAt=meta.at;if(inspection.result!=='ACCEPTED')inspection.ncrNo=`NCR-${inspection.id}`;
     if(inspection.type==='FQC'){const order=(state.salesOrders||[]).find(x=>x.orderNo===inspection.reference);if(!order||order.sku!==inspection.sku||inspection.qty<=0||inspection.qty>order.qty)fail(422,'A matching sales order, SKU and quantity are required.');order.qcStatus=inspection.result;}
     if(inspection.type==='OQC'){const shipment=(state.shipments||[]).find(x=>x.shipmentNo===inspection.reference),order=(state.salesOrders||[]).find(x=>x.orderNo===shipment?.orderNo);if(!shipment||!order||order.sku!==inspection.sku||inspection.qty<=0||inspection.qty>shipment.pickQty)fail(422,'A matching shipment, SKU and quantity are required.');shipment.oqcStatus=inspection.result;}
    }
   }
  }else if(action.startsWith('production.')){
   manager(actor);
   if(action==='production.create'){
    const order=find(state,'orders',input.orderId);result=createProductionJob(state,{id:crypto.randomUUID(),workOrderNo:`WO-${crypto.randomUUID().slice(0,8)}`,order,meta});
    for(const line of result.materials)await requireWarehouse(env,actor,state,line.warehouse);
   }else{
    const job=find(state,'productionJobs',input.id);for(const line of job.materials||[])await requireWarehouse(env,actor,state,line.warehouse);await requireWarehouse(env,actor,state,'WH-SF');await requireWarehouse(env,actor,state,'WH-FG');
    if(action==='production.release')result=releaseProductionJob(state,job.id,meta.at,meta);
    else if(action==='production.issue')result=issueProductionJob(state,job.id,meta.at,meta);
    else if(action==='production.cancel')result=cancelProductionJob(state,job.id,meta);
    else if(action==='production.backflush-edit')result=updateBackflushQuantity(state,job.id,text(input.sku),number(input.quantity));
    else if(action==='production.submit-backflush')result=submitBackflush(state,job.id,meta);
    else if(action==='production.approve-backflush')result=approveBackflush(state,job.id,meta);
    else if(action==='production.complete')result=completeProductionJob(state,job.id,{completedQty:number(input.completedQty),scrapQty:number(input.scrapQty||0),inspectionId:crypto.randomUUID(),inspectionNo:`FQC-${crypto.randomUUID().slice(0,8)}`,meta});
    else fail(400,'Unknown production action.');
   }
  }else if(action.startsWith('floor.')){
   manager(actor);await requireWarehouse(env,actor,state,'WH-SF');
   if(action==='floor.start')result=startOperation(state,{operatorId:input.operatorId,jobId:input.jobId,workCenterId:input.workCenterId,stage:input.stage,inputQty:number(input.inputQty)},meta);
   else if(action==='floor.pause')result=pauseOperation(state,input.id,{reason:text(input.reason||''),meta});
   else if(action==='floor.resume')result=resumeOperation(state,input.id,{meta});
   else if(action==='floor.complete')result=completeOperation(state,input.id,{goodQty:number(input.goodQty),scrapQty:number(input.scrapQty||0),reworkQty:number(input.reworkQty||0),notes:text(input.notes||'')},meta);
   else if(action==='floor.andon')result=raiseAndon(state,{jobId:input.jobId,sessionId:input.sessionId,operatorId:input.operatorId,category:text(input.category||'OTHER'),severity:text(input.severity||'HIGH'),message:text(input.message||'')},meta);
   else if(action==='floor.andon-update')result=updateAndon(state,input.id,input.status,meta);
   else fail(400,'Unknown shop floor action.');
  }else if(action==='purchase.advance'){
   manager(actor);const po=find(state,'purchaseOrders',input.id);
   if(po.status==='DRAFT'){
    independent(actor,po);const supplier=(state.suppliers||[]).find(x=>x.code===po.supplierCode),pr=(state.purchaseRequests||[]).find(x=>x.prNo===po.prNo);
    if(!supplier?.approved||pr?.status!=='APPROVED'||pr.budgetStatus!=='APPROVED'||!Number(po.qty)||!(state.skus||[]).some(x=>x.code===po.sku))fail(422,'Approved supplier, request, budget, SKU and quantity required.');
    po.status='APPROVED';po.approvedBy=user;
   }else if(po.status==='ACCEPTED')completeThreeWayMatch(state,po);
   else fail(409,'Receive goods through the receipt console.');
  }else if(action==='sales.reserve'){
   manager(actor);await requireWarehouse(env,actor,state,'WH-FG');const order=find(state,'salesOrders',input.id);if(['SHIPPED','PARTIALLY_SHIPPED'].includes(order.status))fail(409,'Shipped order cannot be changed.');
   const balances=state.stock?.[order.sku];if(!balances||number(order.qty)<=0)fail(422,'Valid item and quantity required.');
   const own=Number(order.reservedQty||0),reserved=Number(balances.reserved||0),free=Number(balances['WH-FG']||0)-reserved+own;
   if(free<order.qty)fail(422,'Insufficient finished goods stock.');
   balances.reserved=reserved-own+Number(order.qty);order.reservedQty=Number(order.qty);order.status=order.qcStatus==='ACCEPTED'&&(order.paymentStatus==='PAID'||order.creditApproved)?'READY_TO_SHIP':'RESERVED';
  }else if(action==='shipment.advance'){
   manager(actor);await requireWarehouse(env,actor,state,'WH-FG');const shipment=find(state,'shipments',input.id);independent(actor,shipment);
   if(shipment.status==='SHIPPED')fail(409,'Shipment is already posted.');
   const order=(state.salesOrders||[]).find(x=>x.orderNo===shipment.orderNo),fin=(state.financeApprovals||[]).find(x=>x.type==='SALES_RELEASE'&&x.reference===shipment.orderNo&&x.status==='APPROVED');
   if(!order||!fin||order.qcStatus!=='ACCEPTED'||!(order.paymentStatus==='PAID'||order.creditApproved)||shipment.oqcStatus!=='ACCEPTED'||!shipment.packingList||!shipment.invoiceNo||!(number(shipment.pickQty)>0)||shipment.pickQty>Number(order.reservedQty||0))fail(422,'Reservation, finance, quality, packing list and invoice are required.');
   const transaction=createInventoryTransaction(state,{type:'ISSUE',purpose:'SALES',sku:order.sku,sourceWarehouse:'WH-FG',quantity:shipment.pickQty,reference:shipment.shipmentNo,reason:'Approved sales shipment',requestedBy:shipment.createdByUsername||'legacy-shipping'});
   submitInventoryTransaction(state,transaction.id,{submittedBy:transaction.requestedBy});approveInventoryTransaction(state,transaction.id,{approvedBy:user});
   state.stock[order.sku].reserved-=shipment.pickQty;postInventoryTransaction(state,transaction.id,{postedBy:user,deferFinance:actor.user.role!=='CEO'});
   order.reservedQty-=shipment.pickQty;order.status=order.reservedQty?'PARTIALLY_SHIPPED':'SHIPPED';shipment.status='SHIPPED';shipment.shippingRelease='RELEASED';shipment.shippedAt=meta.at;shipment.postedBy=user;
  }else if(action.startsWith('finance.')){
   ceo(actor);normalizeFinancialState(state);
   if(action==='finance.period-create')result=createAccountingPeriod(state,{startDate:date(input.startDate),endDate:date(input.endDate),code:text(input.code||'')},meta);
   else if(action==='finance.period-close')result=closeAccountingPeriod(state,input.id,meta);
   else if(action==='finance.journal-post'){
    if(input.id){const draft=find(state,'journalEntries',input.id);if(draft.status!=='DRAFT')fail(409,'Draft journal required.');state.journalEntries=state.journalEntries.filter(x=>x.id!==draft.id);result=postJournalEntry(state,{...draft,date:date(input.date||draft.date)},meta);}
    else result=postJournalEntry(state,{date:date(input.date),description:text(input.description||''),reference:text(input.reference||''),lines:(input.lines||[]).map(x=>({accountCode:text(x.accountCode,30),debit:number(x.debit||0),credit:number(x.credit||0)}))},meta);
   }else if(action==='finance.journal-reverse')result=reverseJournalEntry(state,input.id,{reason:text(input.reason||''),date:date(input.date),meta});
   else if(action==='finance.settings'){setAccountingProfile(state,input.profile,meta);if(!/^[A-Z]{3}$/.test(input.baseCurrency||''))fail(422,'Three-letter currency required.');if((state.journalEntries||[]).length&&input.baseCurrency!==state.accountingSettings.baseCurrency)fail(409,'Currency is locked after journal creation.');const fiscal=text(input.fiscalYearStart||'01-01',5);date('2024-'+fiscal);state.accountingSettings.baseCurrency=input.baseCurrency;state.accountingSettings.fiscalYearStart=fiscal;}
   else if(action==='finance.cost-method')result=setInventoryCostMethod(state,text(input.sku),text(input.method),meta);
   else if(action==='finance.approval'){const item=find(state,'financeApprovals',input.id);item.status=item.documentMatch&&item.qcApproved&&(item.type==='PURCHASE_PAYMENT'||item.creditApproved)?'APPROVED':'BLOCKED';item.approvedBy=user;}
   else if(action==='finance.budget'){find(state,'purchaseRequests',input.id).budgetStatus=input.approved?'APPROVED':'REJECTED';}
   else if(action==='finance.settlement'){const order=find(state,'salesOrders',input.id);if(!['PENDING','PARTIAL','PAID','CREDIT'].includes(input.paymentStatus))fail(422,'Invalid settlement status.');order.paymentStatus=input.paymentStatus;order.creditApproved=!!input.creditApproved;}
   else if(action==='finance.variance')result=postProductionCostVariance(state,input.id,{meta});
   else if(action==='finance.wip-settle')result=settleWipWorkOrder(state,input.id,meta);
   else if(action==='finance.wip-reopen')result=reopenSettledWorkOrder(state,input.id,{reason:text(input.reason||''),meta});
   else fail(400,'Unknown finance action.');
  }else fail(400,'Unknown role operation.');
 }catch(error){if(error.status)throw error;fail(422,error.message);}
 // Financial effects produced by an operational action remain drafts for CEO review.
 if(actor.user.role!=='CEO')for(const item of state.inventoryTransactions||[])if((state.journalEntries||[]).some(j=>j.id===item.journalEntryId&&j.status==='DRAFT'))item.accountingStatus='AWAITING_FINANCE';
 const seals=[];
 const released=new Set((before.mrpRuns||[]).filter(x=>['RELEASED','SUPERSEDED'].includes(x.status)).map(x=>`${x.id}|${x.resultFingerprint}`));
 for(const run of (state.mrpRuns||[]).filter(x=>x.status==='RELEASED'&&!released.has(`${x.id}|${x.resultFingerprint}`))){
  manager(actor);if(String(env.MRP_AUDIT_HMAC_SECRET||'').length<32)fail(503,'MRP audit sealing requires a configured server secret.');
  const payload={workspaceId:actor.workspace.id,runId:String(run.id||''),runNo:String(run.runNo||''),resultFingerprint:String(run.resultFingerprint||''),checkpointHeadHash:String(run.timeBucketCheckpoints?.headHash||''),deltaHeadHash:String(run.deltaAnchor?.headHash||''),releasedAt:String(run.releasedAt||'')};
  const signature=await createMrpAuditSeal(payload,env.MRP_AUDIT_HMAC_SECRET),id=`MRPSEAL-${signature}`;
  run.serverAuditSeal={id,runId:run.id,signature,algorithm:'HMAC-SHA-256',sealedAt:meta.at};
  seals.push(env.DB.prepare("INSERT OR IGNORE INTO mrp_audit_seals (id,workspace_id,run_id,payload_json,signature,algorithm,created_by,created_at) SELECT ?,?,?,?,?, 'HMAC-SHA-256',?,? WHERE EXISTS(SELECT 1 FROM mrp_state WHERE workspace_id=? AND revision=?)").bind(id,actor.workspace.id,run.id,JSON.stringify(payload),signature,actor.user.id,meta.at,actor.workspace.id,row.revision));
 }
 const serialized=JSON.stringify(state);if(new TextEncoder().encode(serialized).length>5*1024*1024)fail(413,'Workspace size limit reached.');
 const stamp=meta.at,details=JSON.stringify({action,id:input.id||result?.id||null,revision:row.revision+1});
 const changes=await env.DB.batch([
  ...seals,env.DB.prepare('UPDATE mrp_state SET state_json=?,revision=revision+1,updated_by=?,updated_at=? WHERE workspace_id=? AND revision=?').bind(serialized,actor.user.id,stamp,actor.workspace.id,row.revision),
  env.DB.prepare('INSERT INTO mrp_audit_log (workspace_id,user_id,action,details_json,created_at) SELECT ?,?,?,?,? WHERE changes()=1').bind(actor.workspace.id,actor.user.id,`role_operation.${action}`,details,stamp)
 ]);
 if(!changes[seals.length].meta.changes)fail(409,'Data changed. Refresh and retry.');
 return json({ok:true,revision:row.revision+1,state:await projectRoleState(env,actor,state)});
}
