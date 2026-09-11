import {appendAudit} from './audit-workflow.js';
import {postJournalEntry} from './financial-core.js';

const num=value=>Number.isFinite(Number(value))?Number(value):0;
const money=value=>Math.round((num(value)+Number.EPSILON)*100)/100;
const metaFields=(meta={})=>({user:meta.user||'unknown',role:meta.role||'',workspace:meta.workspace||'',device:meta.device||'unknown'});

export function normalizeProductionCostVariance(state){
  state.productionVariancePostings??=[];
  (state.productionJobs||[]).forEach(job=>(job.materials||[]).forEach(line=>{
    const item=(state.skus||[]).find(value=>value.code===line.sku);
    line.standardUnitCost=num(line.standardUnitCost??item?.cost);
    line.actualQuantity=num(line.actualQuantity??line.required);
    line.actualUnitCost=num(line.actualUnitCost??line.standardUnitCost);
  }));
  return state;
}

export function productionCostVariance(state,jobId){
  normalizeProductionCostVariance(state);
  const job=(state.productionJobs||[]).find(item=>item.id===jobId);if(!job)throw Error('Work order not found.');
  const sessions=(state.operationSessions||[]).filter(item=>item.jobId===jobId&&item.status==='COMPLETED');
  const goodQty=num(job.completedQty),scrapQty=num(job.scrapQty),processedQty=goodQty+scrapQty||num(job.plannedQty),plannedQty=Math.max(1,num(job.plannedQty));
  const materials=(job.materials||[]).map(line=>{const standardQty=num(line.required)*processedQty/plannedQty,actualQty=num(line.actualQuantity),standardRate=num(line.standardUnitCost),actualRate=num(line.actualUnitCost),priceVariance=money(actualQty*(actualRate-standardRate)),usageVariance=money((actualQty-standardQty)*standardRate);return{sku:line.sku,name:line.name||'',warehouse:line.warehouse,standardQty,actualQty,standardRate,actualRate,standardCost:money(standardQty*standardRate),actualCost:money(actualQty*actualRate),priceVariance,usageVariance,totalVariance:money(priceVariance+usageVariance)}});
  const standardLabor=money(num(job.laborCost)*processedQty),standardOverhead=money((num(job.overheadCost)+num(job.otherCost))*processedQty);
  const actualLabor=money(sessions.reduce((sum,session)=>{const worker=(state.operators||[]).find(item=>item.id===session.operatorId);return sum+num(session.actualMinutes)/60*num(worker?.hourlyRate)},0));
  const actualOverhead=money(sessions.reduce((sum,session)=>{const center=(state.workCenters||[]).find(item=>item.id===session.workCenterId);return sum+num(session.actualMinutes)/60*(num(center?.hourlyRate)+num(center?.overheadRate))},0));
  const materialPriceVariance=money(materials.reduce((sum,row)=>sum+row.priceVariance,0)),materialUsageVariance=money(materials.reduce((sum,row)=>sum+row.usageVariance,0));
  const laborVariance=money(actualLabor-standardLabor),overheadVariance=money(actualOverhead-standardOverhead),scrapReworkVariance=money(num(job.scrapLoss)+num(job.reworkCost)),downtimeVariance=money(num(job.downtimeCost));
  const totalVariance=money(materialPriceVariance+materialUsageVariance+laborVariance+overheadVariance+scrapReworkVariance+downtimeVariance),standardGoodOutput=money(goodQty*num(job.standardUnitCost)),actualProductionCost=money(standardGoodOutput+totalVariance);
  const posting=state.productionVariancePostings.find(item=>item.jobId===jobId&&!item.reversedAt);
  return{jobId,workOrderNo:job.workOrderNo,batchNo:job.batchNo,status:job.status,goodQty,scrapQty,materials,standardGoodOutput,actualProductionCost,materialPriceVariance,materialUsageVariance,laborVariance,overheadVariance,scrapReworkVariance,downtimeVariance,totalVariance,result:totalVariance>0?'UNFAVORABLE':totalVariance<0?'FAVORABLE':'ON_STANDARD',posted:!!posting,journalEntryId:posting?.journalEntryId||''};
}

export function productionVarianceSummary(state){
  const rows=(state.productionJobs||[]).filter(job=>!['PLANNED','RELEASED','CANCELLED'].includes(job.status)).map(job=>productionCostVariance(state,job.id));
  const total=key=>money(rows.reduce((sum,row)=>sum+row[key],0));return{rows,materialPriceVariance:total('materialPriceVariance'),materialUsageVariance:total('materialUsageVariance'),laborVariance:total('laborVariance'),overheadVariance:total('overheadVariance'),scrapReworkVariance:total('scrapReworkVariance'),downtimeVariance:total('downtimeVariance'),totalVariance:total('totalVariance'),unfavorable:rows.filter(row=>row.totalVariance>0).length,unposted:rows.filter(row=>!row.posted&&row.totalVariance).length};
}

export function postProductionCostVariance(state,jobId,{date=new Date().toISOString().slice(0,10),meta={}}={}){
  const variance=productionCostVariance(state,jobId);if(!['COMPLETED','AWAITING_FQC','QUALITY_HOLD'].includes(variance.status))throw Error('Production must be reported before variance posting.');if(variance.posted)throw Error('Production variance has already been posted.');if(!variance.totalVariance)throw Error('No production variance exists to post.');
  const categories=[['5110',variance.materialPriceVariance,'Material price variance'],['5100',variance.materialUsageVariance,'Material usage variance'],['5120',variance.laborVariance,'Labor variance'],['5130',variance.overheadVariance,'Production overhead variance'],['5140',variance.scrapReworkVariance,'Scrap and rework loss'],['5150',variance.downtimeVariance,'Production downtime loss']].filter(([,value])=>value);
  const lines=categories.map(([accountCode,value,description])=>({accountCode,description,debit:value>0?value:0,credit:value<0?-value:0,dimension:variance.workOrderNo,reference:variance.batchNo}));
  lines.push({accountCode:'1220',description:'Production variance clearing',debit:variance.totalVariance<0?-variance.totalVariance:0,credit:variance.totalVariance>0?variance.totalVariance:0,dimension:variance.workOrderNo,reference:variance.batchNo});
  const journal=postJournalEntry(state,{date,description:`Production cost variance ${variance.workOrderNo}`,source:'PRODUCTION_VARIANCE',sourceId:jobId,reference:variance.batchNo,lines},meta);
  state.productionVariancePostings.unshift({id:`PCV-${journal.id}`,jobId,journalEntryId:journal.id,entryNo:journal.entryNo,postedAt:journal.postedAt,postedBy:journal.postedBy,totalVariance:variance.totalVariance});appendAudit(state,{...metaFields(meta),action:'PRODUCTION_VARIANCE_POSTED',entity:'PRODUCTION',reference:variance.workOrderNo,at:journal.postedAt,details:`${journal.entryNo} · ${variance.totalVariance}`});return journal;
}
