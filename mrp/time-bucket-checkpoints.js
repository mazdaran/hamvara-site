import {stableFingerprint} from './mrp-input-snapshot.js';

const KEY=0,NEED_DATE=5,PLANNED_QTY=13;
const num=value=>Number.isFinite(Number(value))?Number(value):0;
const date=value=>String(value||'').slice(0,10);
const dayMs=86400000;
const addDays=(value,days)=>new Date(new Date(`${value}T12:00:00Z`).getTime()+days*dayMs).toISOString().slice(0,10);
const daysBetween=(from,to)=>Math.floor((new Date(`${to}T12:00:00Z`)-new Date(`${from}T12:00:00Z`))/dayMs);
const bucketIndex=(asOf,value,width)=>Math.max(0,Math.floor(daysBetween(asOf,date(value)||asOf)/width));
const compact=row=>[row.key||`${row.orderNo||''}|${row.productCode||''}|${row.sku||'BOM'}|${row.warehouse||''}|${row.needDate||''}`,row.orderNo||'',row.productCode||'',row.sku||'',row.warehouse||'',row.needDate||'',row.releaseDate||'',num(row.grossRequired),num(row.safetyStock),num(row.availableBefore),num(row.scheduledReceipts),num(row.projectedAvailable),num(row.netRequired),num(row.plannedQuantity),num(row.leadTimeDays),row.action||'',row.status||'',row.error||'',num(row.llc),row.levels||[],row.priority||'',row.sourceOrders||[]];
const sorted=rows=>rows.map(compact).sort((a,b)=>a[KEY].localeCompare(b[KEY]));
const nodePayload=item=>[item.index,item.from,item.through,item.rowCount,item.plannedQuantity,item.contentHash,item.previousHash];

function makeCheckpoint(records,{index,asOf,cutoff,width,previousHash,contentHash}={}){
  const from=addDays(asOf,index*width),value={index,from,through:index===bucketIndex(asOf,cutoff,width)?cutoff:addDays(from,width-1),rowCount:records.length,plannedQuantity:records.reduce((sum,row)=>sum+num(row[PLANNED_QTY]),0),contentHash:contentHash||stableFingerprint(records),previousHash,records};
  value.hash=stableFingerprint(nodePayload(value));return value;
}

export function buildTimeBucketCheckpoints(rows,{asOf,cutoff,bucketDays=7}={}){
  const width=Math.max(1,Math.floor(num(bucketDays)||7)),groups=new Map();
  for(const row of rows||[]){const index=bucketIndex(asOf,row.needDate||asOf,width);if(!groups.has(index))groups.set(index,[]);groups.get(index).push(row)}
  const last=Math.max(0,bucketIndex(asOf,cutoff||asOf,width)),checkpoints=[];let previousHash='GENESIS';
  for(let index=0;index<=last;index++){const item=makeCheckpoint(sorted(groups.get(index)||[]),{index,asOf,cutoff,width,previousHash});checkpoints.push(item);previousHash=item.hash}
  return{schemaVersion:3,storage:'COMPACT_TUPLES',mode:'FULL_BUILD',asOf,cutoff,bucketDays:width,headHash:previousHash,checkpoints,reusedBuckets:0,rebuiltBuckets:checkpoints.length};
}

export function verifyTimeBucketCheckpoints(manifest,{deep=true}={}){
  let previousHash='GENESIS';for(let index=0;index<(manifest?.checkpoints||[]).length;index++){const item=manifest.checkpoints[index];if(item.index!==index||item.previousHash!==previousHash||stableFingerprint(nodePayload(item))!==item.hash)return{valid:false,index,reason:'BROKEN_CHECKPOINT_CHAIN'};if(deep&&(item.rowCount!==item.records?.length||stableFingerprint(item.records||[])!==item.contentHash))return{valid:false,index,reason:'BROKEN_BUCKET_CONTENT'};previousHash=item.hash}
  return{valid:previousHash===(manifest?.headHash||'GENESIS'),reason:previousHash===(manifest?.headHash||'GENESIS')?'VALID':'BROKEN_CHECKPOINT_HEAD'};
}

export function patchTimeBucketCheckpoints(prior,{previousRows=[],currentRows=[]}={},options={}){
  const {asOf,cutoff,bucketDays=7}=options,width=Math.max(1,Math.floor(num(bucketDays)||7));if(prior?.schemaVersion!==3||prior.asOf!==asOf||prior.cutoff!==cutoff||prior.bucketDays!==width||!verifyTimeBucketCheckpoints(prior,{deep:false}).valid)return null;
  const buckets=prior.checkpoints.map(item=>new Map((item.records||[]).map(row=>[row[KEY],row]))),touched=new Set();
  for(const row of previousRows){const item=compact(row),index=bucketIndex(asOf,item[NEED_DATE]||asOf,width);if(buckets[index]){buckets[index].delete(item[KEY]);touched.add(index)}}
  for(const row of currentRows){const item=compact(row),index=bucketIndex(asOf,item[NEED_DATE]||asOf,width);if(!buckets[index])return null;buckets[index].set(item[KEY],item);touched.add(index)}
  const checkpoints=[];let previousHash='GENESIS';for(let index=0;index<buckets.length;index++){const records=[...buckets[index].values()].sort((a,b)=>a[KEY].localeCompare(b[KEY])),old=prior.checkpoints[index],item=makeCheckpoint(records,{index,asOf,cutoff,width,previousHash,contentHash:touched.has(index)?'':old.contentHash});checkpoints.push(item);previousHash=item.hash}
  return{schemaVersion:3,storage:'COMPACT_TUPLES',mode:'MERKLE_PATCH',asOf,cutoff,bucketDays:width,headHash:previousHash,checkpoints,reusedBuckets:checkpoints.length-touched.size,rebuiltBuckets:touched.size};
}

export function verifyRowsAgainstCheckpoints(rows,manifest){
  const structure=verifyTimeBucketCheckpoints(manifest,{deep:false});if(!structure.valid)return{valid:false,reason:structure.reason,index:structure.index,rowsRead:0,peakBucketRows:0};
  let currentIndex=0,current=[],rowsRead=0,peakBucketRows=0;const finish=index=>{const expected=manifest.checkpoints[index],records=current.sort((a,b)=>a[KEY].localeCompare(b[KEY]));return Boolean(expected)&&expected.rowCount===records.length&&expected.contentHash===stableFingerprint(records)};
  for(const row of rows||[]){const item=compact(row),index=bucketIndex(manifest.asOf,item[NEED_DATE]||manifest.asOf,manifest.bucketDays);if(index<currentIndex)return{valid:false,reason:'NON_MONOTONIC_ROW_STREAM',index,rowsRead,peakBucketRows};while(currentIndex<index){if(!finish(currentIndex))return{valid:false,reason:'ROW_BUCKET_MISMATCH',index:currentIndex,rowsRead,peakBucketRows};current=[];currentIndex++}current.push(item);rowsRead++;peakBucketRows=Math.max(peakBucketRows,current.length)}
  while(currentIndex<manifest.checkpoints.length){if(!finish(currentIndex))return{valid:false,reason:'ROW_BUCKET_MISMATCH',index:currentIndex,rowsRead,peakBucketRows};current=[];currentIndex++}
  return{valid:true,reason:'PARITY_PROVEN',rowsRead,peakBucketRows,headHash:manifest.headHash};
}

export function earliestAffectedBucket(state,dirty,manifest,{previousSnapshot}={}){if(!dirty?.changed)return{index:null,from:'',reason:'UNCHANGED'};if(dirty.contextChanged||dirty.forecastChanged||(dirty.dirtyProducts||[]).length||(dirty.dirtyItems||[]).length)return{index:0,from:manifest?.asOf||'',reason:'GLOBAL_OR_ITEM_EFFECT'};const dates=[];for(const orderNo of dirty.dirtyOrders||[]){const current=(state.orders||[]).find(row=>String(row.orderNo||'')===orderNo);dates.push(date(current?.due),date(previousSnapshot?.demandMeta?.[orderNo]?.due))}const valid=dates.filter(Boolean);if(!valid.length)return{index:0,from:manifest?.asOf||'',reason:'UNRESOLVED_DEMAND_DATE'};const index=Math.min(...valid.map(value=>bucketIndex(manifest.asOf,value,manifest.bucketDays)));return{index,from:addDays(manifest.asOf,index*manifest.bucketDays),reason:'DEMAND_DUE_BUCKET'}}
