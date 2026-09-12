import {performance} from 'node:perf_hooks';
import {llcMaterialPlanRows} from '../../mrp/llc-planning-engine.js';
import {buildTimeBucketCheckpoints,patchTimeBucketCheckpoints,verifyRowsAgainstCheckpoints} from '../../mrp/time-bucket-checkpoints.js';

const products=1000,componentsPerProduct=10,asOf='2026-09-01',cutoff='2026-12-31';
const state={products:[],skus:[],boms:{},orders:[],stock:{},purchaseOrders:[],plannedSupplyOrders:[]};
for(let productIndex=0;productIndex<products;productIndex++){
  const productCode=`P-${String(productIndex).padStart(4,'0')}`;state.products.push({code:productCode,outputSku:productCode});state.orders.push({orderNo:`O-${String(productIndex).padStart(4,'0')}`,productCode,qty:100,due:'2026-10-15'});state.boms[productCode]=[];
  for(let itemIndex=0;itemIndex<componentsPerProduct;itemIndex++){const sku=`R-${String(productIndex).padStart(4,'0')}-${String(itemIndex).padStart(2,'0')}`;state.skus.push({code:sku,leadTime:5});state.boms[productCode].push({sku,qty:itemIndex+1,warehouse:'WH-RM'});}
}

const measure=fn=>{const start=performance.now(),value=fn();return{value,ms:performance.now()-start}};
const heapBefore=process.memoryUsage().heapUsed,plan=measure(()=>llcMaterialPlanRows(state,state.orders,{asOf,cutoff})),manifest=measure(()=>buildTimeBucketCheckpoints(plan.value,{asOf,cutoff})),verification=measure(()=>verifyRowsAgainstCheckpoints(plan.value,manifest.value));
const changed=plan.value.slice(0,100).map(row=>({...row,plannedQuantity:row.plannedQuantity+1})),patch=measure(()=>patchTimeBucketCheckpoints(manifest.value,{previousRows:plan.value.slice(0,100),currentRows:changed},{asOf,cutoff})),heapDelta=Math.max(0,process.memoryUsage().heapUsed-heapBefore),compactBytes=Buffer.byteLength(JSON.stringify(manifest.value)),objectBytes=Buffer.byteLength(JSON.stringify(plan.value));
const report={fixture:{products,components:state.skus.length,planRows:plan.value.length},milliseconds:{llcPlan:+plan.ms.toFixed(1),checkpointBuild:+manifest.ms.toFixed(1),streamingParity:+verification.ms.toFixed(1),onePercentPatch:+patch.ms.toFixed(1)},storage:{compactBytes,sourceRowBytes:objectBytes,ratio:+(compactBytes/objectBytes).toFixed(3)},heapDeltaBytes:heapDelta,parity:verification.value.valid,patchMode:patch.value?.mode};
console.log(JSON.stringify(report,null,2));
const failures=[];if(plan.value.length!==10000)failures.push('fixture did not produce 10,000 plan rows');if(plan.ms>5000)failures.push(`LLC planning exceeded 5000 ms (${plan.ms.toFixed(1)})`);if(manifest.ms>3000)failures.push(`checkpoint build exceeded 3000 ms (${manifest.ms.toFixed(1)})`);if(verification.ms>3000||!verification.value.valid)failures.push('streaming parity exceeded budget or failed');if(patch.ms>3000||patch.value?.mode!=='MERKLE_PATCH')failures.push('incremental checkpoint patch exceeded budget or failed');if(compactBytes/objectBytes>.7)failures.push('compact checkpoint storage exceeded 70% of source rows');if(heapDelta>256*1024*1024)failures.push('heap growth exceeded 256 MiB');
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
