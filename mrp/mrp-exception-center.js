import {appendAudit} from './audit-workflow.js';
import {timePhasedMaterialPlan,plannedSupplyExceptions} from './time-phased-mrp.js';
import {supplierScheduleSummary} from './supplier-scheduling.js';
import {planningCycleSummary} from './planning-cycle-control.js';

const text=value=>String(value??'').trim();
const date=value=>text(value).slice(0,10);
const addDays=(value,days)=>new Date(new Date(`${value}T12:00:00Z`).getTime()+days*86400000).toISOString().slice(0,10);
const open=status=>!['RESOLVED','VERIFIED'].includes(status);
const audit=(state,action,item,meta,details='')=>appendAudit(state,{...meta,action,entity:'MRP_EXCEPTION',reference:item.exceptionKey,details});

export function normalizeMrpExceptionCenter(state){
  state.mrpExceptionActions??=[];state.mrpExceptionLastSyncAt??='';
  for(const item of state.mrpExceptionActions){item.history??=[];item.status??='NEW';item.occurrences=Math.max(1,Number(item.occurrences)||1)}
  return state;
}

export function collectMrpExceptions(state,{asOf=new Date().toISOString().slice(0,10),horizonDays=90}={}){
  normalizeMrpExceptionCenter(state);const rows=[];
  const add=(source,code,reference,message,severity='REVIEW')=>rows.push({exceptionKey:`${source}|${code}|${reference}`,source,code,reference:text(reference)||'—',message:text(message),severity});
  const plan=timePhasedMaterialPlan(state,{asOf,horizonDays});
  for(const row of plan.exceptions)add('TIME_PHASED_MRP',row.status,`${row.orderNo||row.productCode}|${row.sku||'BOM'}|${row.needDate}`,row.status==='BLOCKED'?(row.error||'BOM explosion is blocked.'):`Release ${row.action} supply for ${row.sku} before ${row.releaseDate}.`,'ACTION_REQUIRED');
  for(const row of plannedSupplyExceptions(state,{asOf,horizonDays}).rows.filter(item=>item.severity!=='ALIGNED'))add('PLANNED_SUPPLY',row.actions.join('+'),row.plannedOrderNo,`${row.sku}: ${row.actions.join(', ')}; quantity ${row.currentQuantity} → ${row.suggestedQuantity}, release ${row.currentReleaseDate} → ${row.suggestedReleaseDate||'—'}.`,row.severity);
  const frozen=(state.mpsSnapshots||[]).find(item=>item.status==='FROZEN');
  for(const row of frozen?.exceptions||[])add('MPS_RCCP',row.code,row.reference,`${frozen.versionNo||frozen.id}: ${row.message}`,'ACTION_REQUIRED');
  const schedule=(state.productionSchedules||[]).find(item=>item.status==='RELEASED');
  for(const row of schedule?.exceptions||[])add('PRODUCTION_SCHEDULE',row.code,row.reference,`${schedule.scheduleNo||schedule.id}: ${row.message}`,'ACTION_REQUIRED');
  for(const row of supplierScheduleSummary(state,{asOf}).rows.filter(item=>item.status==='REJECTED'||item.status==='RESCHEDULE_PENDING'||['LATE','LATE_PARTIAL','LATE_RECEIPT'].includes(item.executionStatus)))add('SUPPLIER_SCHEDULE',row.executionStatus,row.scheduleNo,`${row.poNo} · ${row.supplierCode} · ${row.sku}: committed ${row.committedQty||row.requestedQty} by ${row.committedDate||row.requestedDate}; received ${row.receivedQty}.`,'ACTION_REQUIRED');
  for(const row of planningCycleSummary(state,{asOf}).rows.filter(item=>item.executionStatus==='OVERDUE'))add('PLANNING_CYCLE','OVERDUE_GATE',`${row.cycleNo}|${row.code}`,`${row.name} was due ${row.dueDate} and has no accepted completion evidence.`,'ACTION_REQUIRED');
  const assessment=(state.mrp2Assessments||[]).find(item=>item.status==='APPROVED');for(const row of assessment?.controls?.filter(item=>item.status==='FAIL')||[])add('MRP2_ASSESSMENT',row.code,`${assessment.assessmentNo}|${row.code}`,`${row.title}: ${row.evidence}. Required action: ${row.action}`,'ACTION_REQUIRED');
  return rows;
}

export function syncMrpExceptions(state,{asOf=new Date().toISOString().slice(0,10),horizonDays=90,defaultOwner='',dueDate='',meta={}}={}){
  normalizeMrpExceptionCenter(state);const at=meta.at||new Date().toISOString(),incoming=collectMrpExceptions(state,{asOf,horizonDays}),seen=new Set(incoming.map(row=>row.exceptionKey));let created=0,reopened=0;
  for(const row of incoming){let item=state.mrpExceptionActions.find(value=>value.exceptionKey===row.exceptionKey);if(!item){item={id:`MRPX-${Date.now()}-${created+1}`,...row,status:text(defaultOwner)?'ASSIGNED':'NEW',owner:text(defaultOwner),dueDate:date(dueDate),decision:'',resolution:'',resolvedBy:'',resolvedAt:'',verifiedBy:'',verifiedAt:'',verificationEvidence:'',createdAt:at,lastSeenAt:at,occurrences:1,history:[{action:'CREATED',at,user:meta.user||'unknown'}]};state.mrpExceptionActions.unshift(item);audit(state,'MRP_EXCEPTION_CREATED',item,meta,row.message);created++;continue}Object.assign(item,{source:row.source,code:row.code,reference:row.reference,message:row.message,severity:row.severity,lastSeenAt:at});item.occurrences++;if(item.status==='VERIFIED'){item.status=text(item.owner)?'ASSIGNED':'NEW';item.resolution='';item.resolvedBy='';item.resolvedAt='';item.verifiedBy='';item.verifiedAt='';item.verificationEvidence='';item.history.push({action:'REOPENED',at,user:meta.user||'unknown'});audit(state,'MRP_EXCEPTION_REOPENED',item,meta,'Exception recurred after verification.');reopened++}}
  for(const item of state.mrpExceptionActions.filter(item=>open(item.status)&&!seen.has(item.exceptionKey)))item.sourceClearedAt??=at;
  state.mrpExceptionLastSyncAt=at;audit(state,'MRP_EXCEPTION_SYNC',{exceptionKey:`SYNC-${date(at)}`},meta,`${incoming.length} active; ${created} created; ${reopened} reopened.`);return{active:incoming.length,created,reopened};
}

function find(state,id){normalizeMrpExceptionCenter(state);const item=state.mrpExceptionActions.find(row=>row.id===id);if(!item)throw new Error('MRP exception action not found.');return item}
export function assignMrpException(state,id,{owner,dueDate,decision,meta={}}={}){const item=find(state,id),who=text(owner),due=date(dueDate),action=text(decision);if(!who||!due||action.length<5)throw new Error('Owner, due date and a meaningful action decision are required.');if(item.status==='VERIFIED')throw new Error('A verified exception must recur through synchronization before reassignment.');Object.assign(item,{owner:who,dueDate:due,decision:action,status:'ASSIGNED',assignedAt:meta.at||new Date().toISOString()});item.history.push({action:'ASSIGNED',at:item.assignedAt,user:meta.user||who,details:action});audit(state,'MRP_EXCEPTION_ASSIGNED',item,meta,`${who}; due ${due}; ${action}`);return item}
export function resolveMrpException(state,id,{resolvedBy,resolution,meta={}}={}){const item=find(state,id),who=text(resolvedBy),note=text(resolution);if(item.status!=='ASSIGNED')throw new Error('Assign the exception before resolution.');if(!who||note.length<10)throw new Error('Resolver and resolution evidence of at least 10 characters are required.');Object.assign(item,{status:'RESOLVED',resolvedBy:who,resolution:note,resolvedAt:meta.at||new Date().toISOString()});item.history.push({action:'RESOLVED',at:item.resolvedAt,user:who,details:note});audit(state,'MRP_EXCEPTION_RESOLVED',item,{...meta,user:who},note);return item}
export function verifyMrpException(state,id,{verifiedBy,evidence,confirmedCleared=false,meta={}}={}){const item=find(state,id),who=text(verifiedBy),proof=text(evidence);if(item.status!=='RESOLVED')throw new Error('Resolve the exception before verification.');if(!confirmedCleared)throw new Error('Confirm that the source condition has been cleared.');if(!who||proof.length<10)throw new Error('Independent verifier and evidence of at least 10 characters are required.');if([item.owner,item.resolvedBy].filter(Boolean).some(value=>text(value).toLowerCase()===who.toLowerCase()))throw new Error('Verifier must be independent from the owner and resolver.');Object.assign(item,{status:'VERIFIED',verifiedBy:who,verificationEvidence:proof,verifiedAt:meta.at||new Date().toISOString()});item.history.push({action:'VERIFIED',at:item.verifiedAt,user:who,details:proof});audit(state,'MRP_EXCEPTION_VERIFIED',item,{...meta,user:who},proof);return item}
export function mrpExceptionSummary(state,{asOf=new Date().toISOString().slice(0,10)}={}){normalizeMrpExceptionCenter(state);const rows=state.mrpExceptionActions;return{total:rows.length,new:rows.filter(item=>item.status==='NEW').length,assigned:rows.filter(item=>item.status==='ASSIGNED').length,resolved:rows.filter(item=>item.status==='RESOLVED').length,verified:rows.filter(item=>item.status==='VERIFIED').length,overdue:rows.filter(item=>open(item.status)&&item.dueDate&&item.dueDate<asOf).length,defaultDueDate:addDays(asOf,3),rows}}
