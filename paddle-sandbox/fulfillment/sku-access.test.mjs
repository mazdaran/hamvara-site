import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { inflateRawSync, crc32 } from 'node:zlib';
import { openStore, seed, TEST_PASSWORD } from './store.mjs';
import { login } from './auth.mjs';
import { PLANS } from './catalog.mjs';
import { acceptEvent } from './webhooks.mjs';
import { createServer } from './server.mjs';
import { renderSkuPage } from './sku-page.mjs';
const NOW = Date.parse('2026-01-15T12:00:00Z'), SECRET = 'sku-export-synthetic-secret';
const id = (p,n) => p+'_'+String(n).padStart(26,'0');
const row = (sku='SKU-001') => ({sku,description:'Test',barcode:'',uom:'piece',price:'12.00',currency:'USD',stock:'1',warehouse:'Test',min:'',max:'',approved:true,status:'READY'});
async function fixture(t) {
  const db = openStore(':memory:'); seed(db); let time=NOW,eventNo=0;
  const server = createServer({db,port:0,clock:()=>time});
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); const base=`http://localhost:${server.address().port}`;
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
  const alice=login(db,'sku-alice',TEST_PASSWORD,NOW),bob=login(db,'sku-bob',TEST_PASSWORD,NOW);
  const request=(path,{who=alice,method='GET',body,headers={}}={})=>fetch(base+path,{method,headers:{Cookie:`hamvara_sandbox_session=${who.token}`,Origin:base,'Content-Type':'application/json','X-Sandbox-CSRF':who.csrf,...headers},...(body?{body:JSON.stringify(body)}:{})});
  function deliver(type,data,occurred='2026-01-02T00:00:00Z') {
    const raw=Buffer.from(JSON.stringify({event_id:id('evt',++eventNo),event_type:type,occurred_at:occurred,data})),ts=String(time/1000);
    return acceptEvent(db,raw,`ts=${ts};h1=${createHmac('sha256',SECRET).update(ts+':').update(raw).digest('hex')}`,SECRET,time);
  }
  function paid(key='skuMonthly',user='sku-alice',owner=user,n=1) {
    const p=PLANS[key],period={starts_at:'2026-01-01T00:00:00Z',ends_at:p.interval==='year'?'2027-01-01T00:00:00Z':'2026-02-01T00:00:00Z'};
    db.prepare('INSERT INTO intents VALUES(?,?,?,?,?,?,?,?)').run('intent-'+n,user,owner,key,'request-'+n,id('txn',n),'ready',NOW);
    const common={currency_code:'USD',collection_mode:'automatic',customer_id:id('ctm',n),items:[{quantity:1,price:{id:p.priceId,product_id:p.productId,unit_price:{amount:p.amount,currency_code:'USD'},billing_cycle:{interval:p.interval,frequency:1},tax_mode:'external',trial_period:null,unit_price_overrides:[]}}]};
    const payment={...common,id:id('txn',n),status:'completed',subscription_id:id('sub',n),origin:'api',custom_data:{sandbox_purchase_intent:'intent-'+n},billing_period:period,details:{totals:{currency_code:'USD',subtotal:p.amount,discount:'0',tax:'0',total:p.amount,balance:'0'}}};
    const subscription={...common,id:id('sub',n),status:'active',current_billing_period:period,scheduled_change:null};
    deliver('transaction.completed',payment);deliver('subscription.created',subscription);
    return {payment,subscription};
  }
  return {db,base,request,alice,bob,paid,deliver,setTime:n=>{time=n;},export:rows=>request('/api/sandbox/sku/export',{method:'POST',body:{rows}})};
}
test('SKU free preview cannot export; verified payment unlocks actual CSV and other users stay locked',async t=>{
  const f=await fixture(t);
  assert.equal((await fetch(f.base+'/api/sandbox/sku/access')).status,401);
  let access=await (await f.request('/api/sandbox/sku/access')).json();assert.equal(access.previewRows,200);assert.equal(access.exportAllowed,false);
  assert.equal((await f.export([row()])).status,403);
  f.paid();access=await (await f.request('/api/sandbox/sku/access')).json();assert.equal(access.exportAllowed,true);
  const response=await f.export([row()]);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/csv/);
  assert.match(await response.text(),/sku,description,barcode[\s\S]*"SKU-001","Test"/);
  assert.equal((await f.request('/api/sandbox/sku/export',{who:f.bob,method:'POST',body:{rows:[row()],ownerId:'sku-alice',paid:true}})).status,403);
});
test('actual export rechecks refunds and cancellations after an earlier successful access response',async t=>{
  for (const type of ['refund','canceled','paused']) {
    const f=await fixture(t),{subscription}=f.paid();assert.equal((await f.export([row()])).status,200);
    if(type==='refund') f.deliver('adjustment.updated',{id:id('adj',1),transaction_id:id('txn',1),subscription_id:id('sub',1),customer_id:id('ctm',1),currency_code:'USD',action:'refund',type:'full',status:'approved',totals:{total:PLANS.skuMonthly.amount,currency_code:'USD'}},'2026-01-10T00:00:00Z');
    else f.deliver('subscription.'+type,{...subscription,status:type,current_billing_period:null},'2026-01-10T00:00:00Z');
    assert.equal((await f.export([row()])).status,403);
    assert.equal((await (await f.request('/api/sandbox/sku/access')).json()).exportAllowed,false);
  }
});
test('MRP company payment does not unlock personal SKU export for its owner or member',async t=>{
  const f=await fixture(t);f.paid('mrpAnnual','mrp-owner','test-company-a');
  for(const user of ['mrp-owner','mrp-member']) {
    const who=login(f.db,user,TEST_PASSWORD,NOW);
    assert.equal((await f.request('/api/sandbox/sku/export',{who,method:'POST',body:{rows:[row()]}})).status,403);
  }
});
test('export rejects stale login, cross-origin, missing CSRF, invalid method and oversized body',async t=>{
  const f=await fixture(t);f.paid();
  for(const headers of [{'X-Sandbox-CSRF':''},{Origin:'http://example.test'}])assert.equal((await f.request('/api/sandbox/sku/export',{method:'POST',body:{rows:[row()]},headers})).status,403);
  assert.equal((await f.request('/api/sandbox/sku/export')).status,404);
  assert.equal((await f.export([{...row(),description:'x'.repeat(1024*1024)}])).status,413);
  f.setTime(NOW+3600001);assert.equal((await f.export([row()])).status,401);
});
test('server validates approved rows instead of trusting READY; output handles quotes, newlines and spreadsheet formulas',async t=>{
  const f=await fixture(t);f.paid();
  for(const rows of [[{...row(),approved:false}],[row('')],[row(),row()],[{...row(),price:''}],[{...row(),barcode:'invalid'}],[{...row(),description:{value:'bad'}}],[{...row(),price:'1,25',numberFormats:{price:'comma'}}],[{...row(),price:'free'}],[{...row(),stock:'-2'}],[{...row(),min:'10',max:'5'}],[{...row(),barcode:'123456789'}]])assert.equal((await f.export(rows)).status,422);
  assert.equal((await f.export([])).status,400);
  assert.equal((await f.export([row('ABC-1'),row('ABC_1')])).status,200);
  const response=await f.export([{...row(),barcode:'4006381333931',description:'=SUM(1,2)\n"quoted"'}]);assert.equal(response.status,200);
  const csv=await response.text();assert.ok(csv.includes('"\'=SUM(1,2)\n""quoted"""'));assert.ok(csv.endsWith('\r\n'));assert.equal(csv.includes('\\n'),false);
});
test('scheduled cancellation allows current paid period and denies after its effective time',async t=>{
  const f=await fixture(t),{subscription}=f.paid();
  f.deliver('subscription.updated',{...subscription,scheduled_change:{action:'cancel',effective_at:'2026-01-15T12:10:00Z'}},'2026-01-10T00:00:00Z');
  assert.equal((await f.export([row()])).status,200);f.setTime(NOW+600000);assert.equal((await f.export([row()])).status,403);
});
test('local product uses the existing SKU application, removes ungated export and production API/analytics',async t=>{
  const f=await fixture(t),response=await fetch(f.base+'/sku-bridge/');assert.equal(response.status,200);
  const html=await response.text();assert.ok(html.includes('/paddle-sandbox/sku-access.js'));assert.ok(html.includes('/sku-bridge/app.mjs'));
  assert.equal(html.includes('new Blob'),false);assert.equal(html.includes('googletagmanager'),false);assert.equal(html.includes('/growth/config.js'),false);
  assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);
  for(const asset of ['styles.css','core.mjs','app.mjs','i18n.mjs'])assert.equal((await fetch(f.base+'/sku-bridge/'+asset)).status,200);
  assert.equal((await fetch(f.base+'/sku-bridge/core.test.mjs')).status,404);
  for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(script[1]);
  assert.equal((await fetch(f.base+'/paddle-sandbox/sku-access.js')).status,200);
  const source=readFileSync(new URL('../../sku-bridge/index.html',import.meta.url),'utf8');
  assert.throws(()=>renderSkuPage(source.replace('<!-- SKU_ACCESS_ADAPTER -->','<!-- changed -->')),/contract_changed/);
});

// Inspect the actual HTTP ZIP payload; CSV disguised with an Excel extension would fail here.
function unzip(buffer) {
 const entries=new Map();let at=0;
 while(buffer.readUInt32LE(at)===0x04034b50){
   assert.equal(buffer.readUInt16LE(at+6),0);assert.equal(buffer.readUInt16LE(at+8),8);
   const length=buffer.readUInt32LE(at+18),nameLength=buffer.readUInt16LE(at+26),extraLength=buffer.readUInt16LE(at+28),start=at+30+nameLength+extraLength;
   const name=buffer.subarray(at+30,at+30+nameLength).toString();const data=inflateRawSync(buffer.subarray(start,start+length));
   assert.equal(data.length,buffer.readUInt32LE(at+22));assert.equal(crc32(data),buffer.readUInt32LE(at+14));entries.set(name,data.toString());at=start+length;
 }
 assert.equal(buffer.readUInt32LE(at),0x02014b50);assert.equal(buffer.readUInt32LE(buffer.length-22),0x06054b50);
 return entries;
}
test('XLSX retains textual identifiers and numeric prices, with no formula or external links',async t=>{
 const f=await fixture(t);f.paid();
 const rows=[{...row('000012345678901234567890'),barcode:'0012345678905',description:'=HYPERLINK("https://example.test") & <tag>\nİstanbul فارسی 😀 _x000A_\rEnd',price:'1.05',stock:'0'}];
 const response=await f.request('/api/sandbox/sku/export',{method:'POST',body:{rows,format:'xlsx'}});
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');assert.match(response.headers.get('content-disposition'),/Hamvara-approved-SKU.xlsx/);assert.equal(response.headers.get('cache-control'),'no-store');
 const files=unzip(Buffer.from(await response.arrayBuffer())),sheet=files.get('xl/worksheets/sheet1.xml');
 assert.match(sheet,/<c r="A2" s="1" t="inlineStr"><is><t xml:space="preserve">000012345678901234567890<\/t>/);
 assert.match(sheet,/<c r="C2" s="1" t="inlineStr"><is><t xml:space="preserve">0012345678905<\/t>/);
 assert.match(sheet,/<c r="E2" s="2" t="n"><v>1.05<\/v>/);assert.match(sheet,/<c r="G2" s="2" t="n"><v>0<\/v>/);
 assert.match(sheet,/_x005F_x000A__x000D_End/);assert.ok(sheet.includes('&amp; &lt;tag&gt;'));assert.ok(sheet.includes('فارسی 😀'));
 assert.ok(sheet.includes('ySplit="1"'));assert.ok(sheet.includes('autoFilter ref="A1:J2"'));assert.match(files.get('xl/styles.xml'),/numFmtId="49"/);
 assert.equal([...files].some(([name,body])=>name.includes('external')||/<f[ >]|<hyperlink[ >]/.test(body)),false);
});
test('XLSX enforces auth, approval, validation, CSRF and refunds just like CSV',async t=>{
 const f=await fixture(t);const request=(rows,extra={})=>f.request('/api/sandbox/sku/export',{method:'POST',body:{rows,format:'xlsx'},...extra});
 assert.equal((await request([row()])).status,403);const {subscription}=f.paid();
 assert.equal((await request([row()],{who:f.bob})).status,403);
 assert.equal((await request([row()],{headers:{'X-Sandbox-CSRF':''}})).status,403);
 assert.equal((await request([row()],{headers:{Origin:'https://example.test'}})).status,403);
 for(const rows of [[{...row(),approved:false}],[row(),row()],[{...row(),price:'1,25'}],[{...row(),barcode:'bad'}],[{...row(),description:'\uFFFF'}],[{...row(),description:'\uD800'}]])assert.equal((await request(rows)).status,422);
 const tiny=await request([{...row(),price:'0.'+'0'.repeat(400)+'1'}]);assert.equal(tiny.status,422);assert.equal((await tiny.json()).error,'xlsx_number_range');
 assert.equal((await f.request('/api/sandbox/sku/export',{method:'POST',body:{rows:[row()],format:'xlsm'}})).status,400);
 f.deliver('adjustment.updated',{id:id('adj',90),transaction_id:id('txn',1),subscription_id:subscription.id,customer_id:id('ctm',1),currency_code:'USD',action:'refund',type:'full',status:'approved',totals:{total:PLANS.skuMonthly.amount,currency_code:'USD'}},'2026-01-10T00:00:00Z');
 assert.equal((await request([row()])).status,403);f.setTime(NOW+3600001);assert.equal((await request([row()])).status,401);
});
