const encoder=new TextEncoder();
const bytes=value=>encoder.encode(typeof value==='string'?value:JSON.stringify(value)).byteLength;
const copy=value=>JSON.parse(JSON.stringify(value));
const checkpointRecords=manifest=>(manifest?.checkpoints||[]).reduce((count,item)=>count+(item.records?.length||0),0);

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
