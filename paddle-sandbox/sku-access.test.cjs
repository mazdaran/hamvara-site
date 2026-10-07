const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'sku-access.js'),'utf8');
function fixture() {
  const nodes=new Map(),calls=[],downloads=[];let access={exportAllowed:false,previewRows:200,batchRows:10000,username:'sku-alice',reason:'no_verified_payment'},error=null,offline=false;
  const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:''});return nodes.get(id);};
  const fetch=async(url,options={})=>{
    calls.push({url,options});if(offline)throw Error('offline');
    if(url.endsWith('/session'))return {ok:true,json:async()=>({csrf:'synthetic'})};
    if(url.endsWith('/access'))return {ok:true,json:async()=>({...access})};
    if(url.endsWith('/export'))return error?{ok:false,json:async()=>({error})}:{ok:true,blob:async()=>new Blob(['sku\r\nTEST\r\n'])};
    throw Error('unexpected_route');
  };
  const window={addEventListener(){}},document={getElementById:get,hidden:false,addEventListener(){},createElement:()=>({click(){downloads.push(this.download)}})};
  vm.runInNewContext(source,{window,document,fetch,AbortSignal,Blob,URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL(){}},setTimeout:f=>f(),setInterval(){}});
  return {api:window.SkuSandbox,get,calls,downloads,paid:()=>{access={...access,exportAllowed:true,reason:'paid_active'}},lock:()=>{access={...access,exportAllowed:false,reason:'payment_refunded'}},error:e=>{error=e},offline:()=>{offline=true}};
}
test('SKU UI preview expands only after a verified response and contracts on refund',async()=>{
  const f=fixture(),rows=Array.from({length:201},(_,i)=>({sku:String(i)}));
  assert.equal(f.api.preview(rows).length,200);await f.api.refresh();assert.equal(f.api.preview(rows).length,200);
  f.paid();await f.api.refresh();assert.equal(f.api.preview(rows).length,201);assert.match(f.get('sku-access-status').textContent,/Paid export enabled/);
  f.lock();await f.api.refresh();assert.equal(f.api.preview(rows).length,200);assert.match(f.get('sku-access-status').textContent,/payment_refunded/);
});
test('SKU UI cannot download from cached paid access after export is revoked',async()=>{
  const f=fixture();f.paid();await f.api.refresh();f.error('verified_sku_payment_required');f.lock();
  assert.equal(await f.api.exportRows([{sku:'TEST',approved:true}]),false);assert.equal(f.downloads.length,0);assert.match(f.get('sku-export-message').textContent,/locked/);
});
test('SKU UI uses same-origin session CSRF and only downloads the server response',async()=>{
  const f=fixture();f.paid();await f.api.refresh();assert.equal(await f.api.exportRows([{sku:'TEST',approved:true}]),true);
  const call=f.calls.find(x=>x.url.endsWith('/export'));assert.equal(call.options.credentials,'same-origin');assert.equal(call.options.headers['X-Sandbox-CSRF'],'synthetic');
  assert.deepEqual(Object.keys(JSON.parse(call.options.body)),['rows']);assert.deepEqual(f.downloads,['Hamvara-approved-SKU.csv']);
});
test('SKU UI fails closed when the server becomes unavailable',async()=>{
  const f=fixture();f.paid();await f.api.refresh();f.offline();await f.api.refresh();assert.equal(f.api.preview(Array(201).fill({})).length,200);
  assert.equal(await f.api.exportRows([{sku:'TEST'}]),false);assert.equal(f.downloads.length,0);
});
