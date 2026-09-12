const encoder=new TextEncoder();
const bytes=value=>encoder.encode(typeof value==='string'?value:JSON.stringify(value)).byteLength;
const copy=value=>JSON.parse(JSON.stringify(value));
const checkpointRecords=manifest=>(manifest?.checkpoints||[]).reduce((count,item)=>count+(item.records?.length||0),0);
const toBase64Url=value=>{let binary='';for(const byte of value)binary+=String.fromCharCode(byte);return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')};
const fromBase64Url=value=>{const normalized=String(value).replaceAll('-','+').replaceAll('_','/'),padded=normalized+'='.repeat((4-normalized.length%4)%4),binary=atob(padded),result=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)result[index]=binary.charCodeAt(index);return result};

export function mrpRunArtifactId(run){const id=String(run?.id||''),fingerprint=String(run?.resultFingerprint||'');if(!id||!fingerprint)throw new Error('MRP run id and result fingerprint are required for artifact storage.');return`${id}:${fingerprint}`}

export function externalizeMrpRunPayloads(state,{thresholdBytes=256*1024}={}){
  const coreState=copy(state),artifacts=[];
  for(const run of coreState.mrpRuns||[]){
    if(run.storageArtifact||!Array.isArray(run.rows))continue;
    const payload={schemaVersion:1,rows:run.rows,timeBucketCheckpoints:run.timeBucketCheckpoints||null},payloadJson=JSON.stringify(payload),byteLength=bytes(payloadJson);
    if(byteLength<thresholdBytes)continue;
    const reference={schemaVersion:1,artifactId:mrpRunArtifactId(run),byteLength,rowCount:run.rows.length,checkpointRecordCount:checkpointRecords(run.timeBucketCheckpoints)};
    artifacts.push({...reference,runId:run.id,resultFingerprint:run.resultFingerprint,payloadJson});
    run.rows=[];run.timeBucketCheckpoints=null;run.storageArtifact=reference;
  }
  return{coreState,artifacts,coreBytes:bytes(coreState),externalizedRuns:artifacts.length};
}

export function rehydrateMrpRunPayloads(coreState,artifacts){
  const state=copy(coreState),byId=new Map((artifacts||[]).map(item=>[item.artifactId,item]));
  for(const run of state.mrpRuns||[]){
    const reference=run.storageArtifact;if(!reference)continue;const artifact=byId.get(reference.artifactId);
    if(!artifact)throw new Error(`MRP run artifact is missing: ${reference.artifactId}.`);
    if(Number(artifact.byteLength)!==Number(reference.byteLength)||bytes(artifact.payloadJson)!==Number(reference.byteLength))throw new Error(`MRP run artifact length mismatch: ${reference.artifactId}.`);
    let payload;try{payload=JSON.parse(artifact.payloadJson)}catch{throw new Error(`MRP run artifact is invalid JSON: ${reference.artifactId}.`)}
    if(payload.schemaVersion!==reference.schemaVersion||!Array.isArray(payload.rows))throw new Error(`MRP run artifact schema mismatch: ${reference.artifactId}.`);
    if(payload.rows.length!==reference.rowCount||checkpointRecords(payload.timeBucketCheckpoints)!==reference.checkpointRecordCount)throw new Error(`MRP run artifact count mismatch: ${reference.artifactId}.`);
    run.rows=payload.rows;run.timeBucketCheckpoints=payload.timeBucketCheckpoints;delete run.storageArtifact;
  }
  return state;
}

export function chunkMrpRunArtifacts(artifacts,{chunkBytes=192*1024}={}){
  const width=Math.max(1024,Math.floor(Number(chunkBytes)||192*1024)),manifests=[],chunks=[];
  for(const artifact of artifacts||[]){const encoded=encoder.encode(artifact.payloadJson),count=Math.max(1,Math.ceil(encoded.byteLength/width));manifests.push(Object.fromEntries(Object.entries(artifact).filter(([key])=>key!=='payloadJson')));for(let index=0;index<count;index++){const payload=encoded.slice(index*width,Math.min(encoded.byteLength,(index+1)*width));chunks.push({artifactId:artifact.artifactId,index,count,byteLength:payload.byteLength,payloadBase64:toBase64Url(payload)})}}
  return{manifests,chunks};
}

export function assembleMrpRunArtifacts(manifests,chunks){
  const grouped=new Map();for(const chunk of chunks||[]){if(!grouped.has(chunk.artifactId))grouped.set(chunk.artifactId,[]);grouped.get(chunk.artifactId).push(chunk)}
  return(manifests||[]).map(manifest=>{const parts=(grouped.get(manifest.artifactId)||[]).sort((a,b)=>a.index-b.index);if(!parts.length||parts.some((part,index)=>part.index!==index||part.count!==parts.length))throw new Error(`MRP run artifact chunks are incomplete: ${manifest.artifactId}.`);const decoded=parts.map(part=>fromBase64Url(part.payloadBase64)),total=decoded.reduce((sum,part)=>sum+part.byteLength,0);if(total!==Number(manifest.byteLength)||parts.some((part,index)=>part.byteLength!==decoded[index].byteLength))throw new Error(`MRP run artifact chunk length mismatch: ${manifest.artifactId}.`);const joined=new Uint8Array(total);let offset=0;for(const part of decoded){joined.set(part,offset);offset+=part.byteLength}let payloadJson;try{payloadJson=new TextDecoder('utf-8',{fatal:true}).decode(joined)}catch{throw new Error(`MRP run artifact UTF-8 is invalid: ${manifest.artifactId}.`)}return{...manifest,payloadJson}});
}
