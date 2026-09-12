import {performance} from 'node:perf_hooks';
import {chunkMrpRunArtifacts,externalizeMrpRunPayloads,streamMrpRunArtifact} from '../../mrp/mrp-run-artifacts.js';

const sizes=[50000,100000],reports=[];
const measure=async fn=>{const started=performance.now(),value=await fn();return{value,ms:performance.now()-started}};

for(const rowCount of sizes){
  const rows=Array.from({length:rowCount},(_,index)=>({key:`RM-${String(index).padStart(6,'0')}|WH-RM|2026-10-${String(index%28+1).padStart(2,'0')}`,sku:`RM-${index%10000}`,warehouse:'WH-RM',needDate:`2026-10-${String(index%28+1).padStart(2,'0')}`,grossRequirement:index%97+1,scheduledReceipt:index%11,projectedAvailable:index%13,netRequirement:index%89,plannedQuantity:index%89,releaseDate:'2026-09-20',sourceOrder:`SO-${index}`}));
  const state={mrpRuns:[{id:`STRESS-${rowCount}`,resultFingerprint:`sha256-${rowCount}`,rows,timeBucketCheckpoints:null}]},heapBefore=process.memoryUsage().heapUsed;
  const external=await measure(()=>externalizeMrpRunPayloads(state,{thresholdBytes:1}));
  const chunked=await measure(()=>chunkMrpRunArtifacts(external.value.artifacts));
  let restoredBytes=0,loaded=0;
  const streamed=await measure(async()=>{for await(const bytes of streamMrpRunArtifact(chunked.value.manifests[0],async(_artifactId,index)=>{loaded++;return chunked.value.chunks[index]}))restoredBytes+=bytes.byteLength});
  const heapDelta=Math.max(0,process.memoryUsage().heapUsed-heapBefore),sourceBytes=external.value.artifacts[0].byteLength;
  reports.push({rowCount,sourceBytes,chunks:chunked.value.chunks.length,loadedChunks:loaded,restoredBytes,parity:restoredBytes===sourceBytes,milliseconds:{externalize:+external.ms.toFixed(1),chunk:+chunked.ms.toFixed(1),verifiedStream:+streamed.ms.toFixed(1)},heapDeltaBytes:heapDelta});
}

console.log(JSON.stringify({storageStress:reports},null,2));
const failures=[];
for(const report of reports){if(!report.parity||report.loadedChunks!==report.chunks)failures.push(`${report.rowCount}: streaming parity failed`);if(report.milliseconds.externalize>10000)failures.push(`${report.rowCount}: externalize exceeded 10 s`);if(report.milliseconds.chunk>10000)failures.push(`${report.rowCount}: chunking exceeded 10 s`);if(report.milliseconds.verifiedStream>10000)failures.push(`${report.rowCount}: verified streaming exceeded 10 s`);if(report.heapDeltaBytes>512*1024*1024)failures.push(`${report.rowCount}: heap growth exceeded 512 MiB`)}
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
