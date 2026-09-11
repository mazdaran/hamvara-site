import {appendAudit} from './audit-workflow.js';
import {productionCostVariance} from './production-cost-variance.js';

const num=value=>Number.isFinite(Number(value))?Number(value):0;
const money=value=>Math.round((num(value)+Number.EPSILON)*100)/100;
const metaFields=(meta={})=>({user:meta.user||'unknown',role:meta.role||'',workspace:meta.workspace||'',device:meta.device||'unknown'});

export function normalizeWipSettlement(state){state.wipSettlements??=[];return state}

export function wipReconciliation(state,jobId){
  normalizeWipSettlement(state);const job=(state.productionJobs||[]).find(item=>item.id===jobId);if(!job)throw Error('Work order not found.');const variance=productionCostVariance(state,jobId),activeSessions=(state.operationSessions||[]).filter(item=>item.jobId===jobId&&['RUNNING','PAUSED'].includes(item.status)).length,physicalWip=money((job.materials||[]).reduce((sum,line)=>sum+num(state.stock?.[line.sku]?.['WH-SF'])*num(line.actualUnitCost??line.standardUnitCost),0)),settlement=state.wipSettlements.find(item=>item.jobId===jobId&&!item.reversedAt),issues=[];
  if(!['AWAITING_FQC','QUALITY_HOLD','COMPLETED'].includes(job.status))issues.push('Production has not been reported.');if(activeSessions)issues.push(`${activeSessions} shop-floor operation(s) remain active.`);if(physicalWip)issues.push(`Shop Floor still carries ${physicalWip} of material value.`);if(variance.totalVariance&&!variance.posted)issues.push('Production cost variance is not posted.');
  return{jobId,workOrderNo:job.workOrderNo,batchNo:job.batchNo,status:job.status,physicalWip,standardOutputValue:variance.standardGoodOutput,actualProductionCost:variance.actualProductionCost,totalVariance:variance.totalVariance,activeSessions,issues,readiness:settlement?'SETTLED':issues.length?'BLOCKED':'READY',settled:!!settlement,settlement};
}

export function wipSettlementSummary(state){const rows=(state.productionJobs||[]).filter(job=>job.status!=='CANCELLED').map(job=>wipReconciliation(state,job.id));return{rows,ready:rows.filter(row=>row.readiness==='READY').length,blocked:rows.filter(row=>row.readiness==='BLOCKED').length,settled:rows.filter(row=>row.readiness==='SETTLED').length,physicalWip:money(rows.reduce((sum,row)=>sum+row.physicalWip,0)),unsettledCost:money(rows.filter(row=>!row.settled).reduce((sum,row)=>sum+row.actualProductionCost,0))}}

export function settleWipWorkOrder(state,jobId,meta={}){const control=wipReconciliation(state,jobId);if(control.settled)throw Error('Work order has already been settled.');if(control.issues.length)throw Error(control.issues[0]);const at=meta.at||new Date().toISOString(),record={id:`WIP-${jobId}-${at}`,jobId,workOrderNo:control.workOrderNo,batchNo:control.batchNo,standardOutputValue:control.standardOutputValue,actualProductionCost:control.actualProductionCost,totalVariance:control.totalVariance,settledAt:at,settledBy:metaFields(meta)};state.wipSettlements.unshift(record);appendAudit(state,{...metaFields(meta),action:'WIP_WORK_ORDER_SETTLED',entity:'PRODUCTION',reference:control.workOrderNo,at,details:`${control.batchNo} · actual cost ${control.actualProductionCost}`});return record}
