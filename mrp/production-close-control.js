import {appendAudit} from './audit-workflow.js';

const metaFields=(meta={})=>({user:meta.user||'unknown',role:meta.role||'',workspace:meta.workspace||'',device:meta.device||'unknown'});
const normalizedRole=value=>String(value||'').trim().toUpperCase().replace(/[\s-]+/g,'_');

export function activeWorkOrderSettlement(state,{jobId='',workOrderNo=''}={}){return(state.wipSettlements||[]).find(item=>!item.reopenedAt&&!item.reversedAt&&(jobId&&item.jobId===jobId||workOrderNo&&item.workOrderNo===workOrderNo))||null}

export function assertWorkOrderUnlocked(state,{jobId='',workOrderNo=''}={}){const settlement=activeWorkOrderSettlement(state,{jobId,workOrderNo});if(settlement)throw Error(`Work order ${settlement.workOrderNo} is closed. Reopen it through the controlled WIP process first.`);return true}

export function reopenSettledWorkOrder(state,jobId,{reason='',meta={}}={}){
  const settlement=activeWorkOrderSettlement(state,{jobId});if(!settlement)throw Error('An active WIP settlement was not found.');const role=normalizedRole(meta.role);if(!['FACTORY_MANAGER','ACCOUNTING','CEO'].includes(role))throw Error('Factory Manager, Accounting or CEO role is required to reopen a work order.');const explanation=String(reason||'').trim();if(explanation.length<10)throw Error('A reopening reason of at least 10 characters is required.');const actor=String(meta.user||'unknown').trim().toLowerCase(),settler=String(settlement.settledBy?.user||'unknown').trim().toLowerCase();if(actor==='unknown')throw Error('An identified user is required to reopen a work order.');if(actor===settler)throw Error('The user who settled the work order cannot reopen it.');const at=meta.at||new Date().toISOString();settlement.reopenedAt=at;settlement.reopenedBy=metaFields(meta);settlement.reopenReason=explanation;const job=(state.productionJobs||[]).find(item=>item.id===jobId);if(job){job.productionCloseStatus='REOPENED';job.reopenedAt=at;job.reopenedBy=metaFields(meta);job.reopenReason=explanation}appendAudit(state,{...metaFields(meta),action:'WIP_WORK_ORDER_REOPENED',entity:'PRODUCTION',reference:settlement.workOrderNo,at,details:explanation});return settlement;
}
