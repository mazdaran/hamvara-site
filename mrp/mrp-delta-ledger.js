import {stableFingerprint} from './mrp-input-snapshot.js';

const text=value=>String(value??'').trim();
export function normalizeMrpDeltaLedger(state){state.mrpDeltaLedger??={schemaVersion:2,hashAlgorithm:'SHA-256',lastSequence:0,headHash:'GENESIS',entries:[],enforced:false};const ledger=state.mrpDeltaLedger;ledger.entries??=[];if(Number(ledger.schemaVersion||1)<2||ledger.hashAlgorithm!=='SHA-256'){ledger.legacyArchive={schemaVersion:ledger.schemaVersion||1,hashAlgorithm:ledger.hashAlgorithm||'FNV-1A-32',lastSequence:ledger.lastSequence||0,headHash:ledger.headHash||'GENESIS',entryCount:ledger.entries.length,archivedAt:new Date().toISOString()};ledger.schemaVersion=2;ledger.hashAlgorithm='SHA-256';ledger.entries=[];ledger.lastSequence=0;ledger.headHash='GENESIS';ledger.enforced=false;ledger.requiresFullBaseline=true}return ledger}
export function appendMrpDelta(state,{entityType='UNKNOWN',entityKey='',operation='UPDATE',effectiveAt=new Date().toISOString(),transactionId,actor='',source='UI',details=''}={}){
  const ledger=normalizeMrpDeltaLedger(state);if(ledger.enforced!==false&&!ledger.requiresFullBaseline)ledger.enforced=true;const sequence=ledger.lastSequence+1,entry={sequence,entityType:text(entityType).toUpperCase()||'UNKNOWN',entityKey:text(entityKey),operation:text(operation).toUpperCase()||'UPDATE',effectiveAt,transactionId:transactionId||`MRPD-${sequence}-${Date.now()}`,actor:text(actor),source:text(source),details:text(details),previousHash:ledger.headHash};
  entry.hash=stableFingerprint(entry);ledger.entries.push(entry);ledger.lastSequence=sequence;ledger.headHash=entry.hash;return entry;
}
export function verifyMrpDeltaLedger(state){const ledger=normalizeMrpDeltaLedger(state);let previous='GENESIS',sequence=0;for(const entry of ledger.entries){sequence++;const hash=entry.hash,{hash:ignored,...unsigned}=entry;if(entry.sequence!==sequence||entry.previousHash!==previous||stableFingerprint(unsigned)!==hash)return{valid:false,sequence:entry.sequence,reason:'BROKEN_SEQUENCE_OR_HASH'};previous=hash}return{valid:sequence===ledger.lastSequence&&previous===ledger.headHash,sequence,headHash:previous,reason:sequence===ledger.lastSequence&&previous===ledger.headHash?'VALID':'BROKEN_HEAD'}}
export function deltasAfter(state,sequence){const ledger=normalizeMrpDeltaLedger(state);return ledger.entries.filter(entry=>entry.sequence>Number(sequence||0))}
export function ledgerChangesSince(state,anchor){
  const ledger=normalizeMrpDeltaLedger(state),integrity=verifyMrpDeltaLedger(state),sequence=Number(anchor?.sequence||0),expected=sequence?ledger.entries[sequence-1]?.hash:'GENESIS';
  if(ledger.requiresFullBaseline)return{trusted:false,entries:[],integrity,reason:'FULL_BASELINE_REQUIRED'};
  if(ledger.enforced!==true)return{trusted:false,entries:[],integrity,reason:'LEDGER_NOT_ENFORCED'};
  if(!integrity.valid||sequence>ledger.lastSequence||expected!==String(anchor?.headHash||'GENESIS'))return{trusted:false,entries:[],integrity,reason:'ANCHOR_MISMATCH'};
  const entries=deltasAfter(state,sequence),trusted=entries.every(entry=>['ITEM','DEMAND','PRODUCT','FORECAST'].includes(entry.entityType)&&entry.entityKey);
  return{trusted,entries,integrity,reason:trusted?'TRUSTED':entries.some(entry=>entry.entityType==='UNKNOWN')?'UNKNOWN_DELTA':'UNROUTABLE_DELTA'};
}
export function dirtyFromLedger(entries){
  const dirtyProducts=new Set(),dirtyItems=new Set(),dirtyOrders=new Set();let forecastChanged=false;
  for(const entry of entries){if(entry.entityType==='PRODUCT')dirtyProducts.add(entry.entityKey);else if(entry.entityType==='ITEM')dirtyItems.add(entry.entityKey);else if(entry.entityType==='DEMAND')dirtyOrders.add(entry.entityKey);else if(entry.entityType==='FORECAST')forecastChanged=true}
  const reasons=[];if(dirtyProducts.size)reasons.push('PRODUCT_OR_BOM');if(dirtyItems.size)reasons.push('ITEM_STOCK_OR_SUPPLY');if(dirtyOrders.size)reasons.push('DEMAND');if(forecastChanged)reasons.push('FORECAST');
  return{changed:entries.length>0,compatible:true,contextChanged:false,dirtyProducts:[...dirtyProducts].sort(),dirtyItems:[...dirtyItems].sort(),dirtyOrders:[...dirtyOrders].sort(),forecastChanged,reasons,source:'DELTA_LEDGER'};
}
