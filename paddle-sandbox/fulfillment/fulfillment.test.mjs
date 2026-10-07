import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, seed, TEST_PASSWORD } from './store.mjs';
import { login, session, requireCsrf, resolveOwner } from './auth.mjs';
import { PLANS } from './catalog.mjs';
import { createCheckout } from './checkout.mjs';
import { acceptEvent, verifySignature } from './webhooks.mjs';
import { project, forActor } from './lifecycle.mjs';
import { createServer } from './server.mjs';
import { makePaddle } from './paddle.mjs';
import { request as httpRequest } from 'node:http';
import { reconcile } from './reconcile.mjs';
const NOW=Date.parse('2026-01-15T12:00:00Z'),SECRET='simulated-webhook-secret-not-a-real-credential',DAY=86400000;
const pid=(prefix,n)=>prefix+'_'+String(n).padStart(26,'0');
function dbFixture(){const db=openStore(':memory:');seed(db);return db;}
function actor(db,name='sku-alice'){const result=login(db,name,TEST_PASSWORD,NOW);return session(db,`hamvara_sandbox_session=${result.token}`,NOW);}
function price(key='skuMonthly'){const p=PLANS[key];return {id:p.priceId,product_id:p.productId,unit_price:{amount:p.amount,currency_code:'USD'},billing_cycle:{interval:p.interval,frequency:1},tax_mode:'external',trial_period:null,unit_price_overrides:[]};}
function payment(key='skuMonthly',n=1,start='2026-01-01T00:00:00Z',end='2026-02-01T00:00:00Z'){
  const p=PLANS[key];return {id:pid('txn',n),status:'completed',subscription_id:pid('sub',1),customer_id:pid('ctm',1),currency_code:'USD',collection_mode:'automatic',origin:n===1?'api':'subscription_recurring',custom_data:{sandbox_purchase_intent:'intent-1'},billing_period:{starts_at:start,ends_at:end},items:[{quantity:1,price:price(key)}],details:{totals:{currency_code:'USD',subtotal:p.amount,discount:'0',tax:'240',total:String(Number(p.amount)+240),balance:'0'}}};
}
function subscription(status='active',start='2026-01-01T00:00:00Z',end='2026-02-01T00:00:00Z',key='skuMonthly') {return {id:pid('sub',1),status,customer_id:pid('ctm',1),currency_code:'USD',collection_mode:'automatic',items:[{quantity:1,price:price(key)}],current_billing_period:['paused','canceled'].includes(status)?null:{starts_at:start,ends_at:end},scheduled_change:null};}
let eventNo=0;
function signed(type,data,occurred='2026-01-02T00:00:00Z',id=pid('evt',++eventNo)){
  const raw=Buffer.from(JSON.stringify({event_id:id,event_type:type,occurred_at:occurred,data}));
  const ts=String(Math.floor(NOW/1000));return {raw,header:`ts=${ts};h1=${createHmac('sha256',SECRET).update(ts+':').update(raw).digest('hex')}`};
}
function deliver(db,type,data,occurred,id){const s=signed(type,data,occurred,id);return acceptEvent(db,s.raw,s.header,SECRET,NOW);}
function intent(db,key='skuMonthly',user='sku-alice',owner=user,txn=1,id='intent-1') {db.prepare('INSERT INTO intents VALUES(?,?,?,?,?,?,?,?)').run(id,user,owner,key,'request-key-'+txn,pid('txn',txn),'ready',NOW);}
function paidFixture(){const db=dbFixture();intent(db);deliver(db,'transaction.completed',payment());deliver(db,'subscription.created',subscription());return db;}
test('raw signature validation rejects forgery, changed bytes, stale/future timestamps and missing secrets',()=>{
  const s=signed('transaction.completed',payment());verifySignature(s.raw,s.header,SECRET,NOW);
  assert.throws(()=>verifySignature(Buffer.concat([s.raw,Buffer.from(' ')]),s.header,SECRET,NOW));
  assert.throws(()=>verifySignature(s.raw,s.header,'wrong',NOW));assert.throws(()=>verifySignature(s.raw,s.header,SECRET,NOW+6000));assert.throws(()=>verifySignature(s.raw,s.header,SECRET,NOW-6000));assert.throws(()=>verifySignature(s.raw,s.header,'',NOW));
  verifySignature(s.raw,s.header+';h1='+'0'.repeat(64),SECRET,NOW);
});
test('test identities are independent; only assigned company billing owner can purchase',()=>{
  const db=dbFixture();const a=actor(db),owner=actor(db,'mrp-owner'),member=actor(db,'mrp-member');
  assert.equal(resolveOwner(db,a,PLANS.skuMonthly),'sku-alice');assert.equal(resolveOwner(db,owner,PLANS.mrpAnnual),'test-company-a');
  assert.throws(()=>resolveOwner(db,member,PLANS.mrpAnnual));assert.throws(()=>resolveOwner(db,a,PLANS.mrpAnnual));assert.equal(resolveOwner(db,owner,PLANS.skuMonthly),'mrp-owner');
  assert.throws(()=>login(db,'sku-alice','wrong',NOW));assert.throws(()=>session(db,'hamvara_sandbox_session=forged',NOW));assert.throws(()=>requireCsrf(a,'0'.repeat(64)));requireCsrf(a,a.csrf);
  const result=login(db,'sku-alice',TEST_PASSWORD,NOW);assert.throws(()=>session(db,`hamvara_sandbox_session=${result.token}`,NOW+3600001));db.close();
});
test('server chooses owner and one allowlisted price, rejects browser ownership and reuses request keys',async()=>{
  const db=dbFixture(),a=actor(db);let calls=0,body;
  const paddle={createTransaction:async value=>{calls++;body=value;return{id:pid('txn',1),status:'draft'};}};
  const request={plan:'skuMonthly',requestKey:'request-key-123456789'};
  const one=await createCheckout(db,a,request,paddle,NOW);const two=await createCheckout(db,a,request,paddle,NOW);
  assert.equal(one.transactionId,two.transactionId);assert.equal(calls,1);assert.deepEqual(body.items,[{price_id:PLANS.skuMonthly.priceId,quantity:1}]);assert.equal(body.currency_code,'USD');
  assert.equal(db.prepare('SELECT owner_id FROM intents').get().owner_id,'sku-alice');
  await assert.rejects(createCheckout(db,a,{...request,ownerId:'sku-bob'},paddle,NOW));await assert.rejects(createCheckout(db,a,{...request,plan:'mrpAnnual'},paddle,NOW));await assert.rejects(createCheckout(db,a,{...request,plan:'unknown'},paddle,NOW));db.close();
});
test('uncertain API creation cannot be retried with a fresh key; secrets cannot route to live',async()=>{
  const db=dbFixture(),a=actor(db),paddle={createTransaction:async()=>{throw Error('timeout');}};
  await assert.rejects(createCheckout(db,a,{plan:'skuMonthly',requestKey:'request-key-123456789'},paddle,NOW));
  await assert.rejects(createCheckout(db,a,{plan:'skuMonthly',requestKey:'different-key-123456789'},paddle,NOW));
  assert.throws(()=>makePaddle('pdl_live_apikey_fake'));assert.equal(makePaddle(''),null);
  let target;await makePaddle('pdl_sdbx_apikey_fake',async(url)=>{target=url;return{ok:true,json:async()=>({data:{id:'test'}})};}).getTransaction(pid('txn',1));assert.match(target,/^https:\/\/sandbox-api\.paddle.com\//);db.close();
});
test('only verified payment plus active subscription grants access, in either arrival order',()=>{
  for(const reverse of [false,true]){const db=dbFixture();intent(db);const events=[['transaction.completed',payment()],['subscription.created',subscription()]];if(reverse)events.reverse();deliver(db,...events[0]);assert.equal(project(db,NOW).entitlements.some(e=>e.access),false);deliver(db,...events[1]);assert.equal(project(db,NOW).entitlements[0].access,true);assert.equal(forActor(db,actor(db,'sku-bob'),NOW).length,0);db.close();}
});
test('duplicate delivery is idempotent; event ID with changed signed payload is rejected',()=>{
  const db=dbFixture(),id=pid('evt',999);const s=signed('subscription.created',subscription(),undefined,id);acceptEvent(db,s.raw,s.header,SECRET,NOW);assert.equal(acceptEvent(db,s.raw,s.header,SECRET,NOW).duplicate,true);
  const other=signed('subscription.created',subscription('past_due'),undefined,id);assert.throws(()=>acceptEvent(db,other.raw,other.header,SECRET,NOW));assert.equal(db.prepare('SELECT COUNT(*) n FROM events').get().n,1);db.close();
});
test('out-of-order active cannot undo cancellation; equal-time contradictory status fails closed',()=>{
  const db=paidFixture();deliver(db,'subscription.canceled',subscription('canceled'),'2026-01-10T00:00:00Z');deliver(db,'subscription.updated',subscription(),'2026-01-03T00:00:00Z');assert.equal(project(db,NOW).entitlements[0].reason,'canceled');
  deliver(db,'subscription.updated',subscription(),'2026-01-10T00:00:00Z');assert.equal(project(db,NOW).entitlements[0].access,false);assert.equal(project(db,NOW).entitlements[0].reason,'subscription_timestamp_conflict');db.close();
});
test('renewal needs payment and current subscription period, and extends the paid-through date',()=>{
  const db=paidFixture();const start='2026-02-01T00:00:00Z',end='2026-03-01T00:00:00Z';deliver(db,'subscription.updated',subscription('active',start,end),'2026-01-14T00:00:00Z');assert.equal(project(db,Date.parse(start)+DAY).entitlements[0].access,false);
  deliver(db,'transaction.completed',payment('skuMonthly',2,start,end),'2026-01-14T01:00:00Z');const e=project(db,Date.parse(start)+DAY).entitlements[0];assert.equal(e.access,true);assert.equal(Date.parse(e.paidThrough),Date.parse(end));db.close();
});
test('past-due grace ends exactly seven days after paid-through; repeated events do not extend it; recovery needs payment',()=>{
  const db=paidFixture();deliver(db,'subscription.past_due',subscription('past_due'),'2026-01-10T00:00:00Z');deliver(db,'subscription.updated',subscription('past_due'),'2026-01-14T00:00:00Z');
  const expiry=Date.parse('2026-02-01T00:00:00Z')+7*DAY;assert.equal(project(db,expiry-1).entitlements[0].access,true);assert.equal(project(db,expiry).entitlements[0].access,false);assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,5);
  deliver(db,'subscription.updated',subscription('active','2026-02-01T00:00:00Z','2026-03-01T00:00:00Z'),'2026-01-15T00:00:00Z');assert.equal(project(db,expiry).entitlements[0].access,false);deliver(db,'transaction.completed',payment('skuMonthly',2,'2026-02-01T00:00:00Z','2026-03-01T00:00:00Z'),'2026-01-15T01:00:00Z');assert.equal(project(db,expiry).entitlements[0].access,true);db.close();
});
test('scheduled cancel stops access at effective time; pause revokes, resume requires paid period',()=>{
  const db=paidFixture(),s=subscription();s.scheduled_change={action:'cancel',effective_at:'2026-01-20T00:00:00Z'};deliver(db,'subscription.updated',s,'2026-01-10T00:00:00Z');assert.equal(project(db,NOW).entitlements[0].access,true);assert.equal(project(db,Date.parse(s.scheduled_change.effective_at)).entitlements[0].access,false);
  deliver(db,'subscription.paused',subscription('paused'),'2026-01-11T00:00:00Z');assert.equal(project(db,NOW).entitlements[0].access,false);deliver(db,'subscription.resumed',subscription(),'2026-01-12T00:00:00Z');assert.equal(project(db,NOW).entitlements[0].access,true);db.close();
});
test('unassigned old checkouts and forged ownership metadata never grant access',()=>{
  const db=dbFixture();deliver(db,'transaction.completed',payment());deliver(db,'subscription.created',subscription());assert.equal(project(db,NOW).entitlements.length,0);
  intent(db,'skuMonthly','sku-alice','sku-alice',5);const p=payment('skuMonthly',3);p.custom_data.sandbox_purchase_intent='intent-1';deliver(db,'transaction.completed',p);assert.equal(project(db,NOW).entitlements.length,0);
  assert.equal(project(db,NOW).review.some(r=>r.reason==='unsupported_payment_origin'||r.reason==='unassigned_payment'),true);db.close();
});
test('mismatched currency, price, quantity, totals, customer and unsupported trial cannot grant access',()=>{
  const mutations=[p=>p.currency_code='EUR',p=>p.items[0].quantity=5,p=>p.items[0].price.id=pid('pri',4),p=>p.details.totals.total='1',p=>p.items[0].price.trial_period={interval:'day',frequency:7},p=>p.custom_data.sandbox_purchase_intent='somebody-else'];
  for(const mutate of mutations){const db=dbFixture();intent(db);const p=payment();mutate(p);deliver(db,'transaction.completed',p);deliver(db,'subscription.created',subscription());assert.equal(project(db,NOW).entitlements.some(e=>e.access),false);db.close();}
  const db=paidFixture(),s=subscription();s.customer_id=pid('ctm',9);deliver(db,'subscription.updated',s,'2026-01-14T00:00:00Z');assert.equal(project(db,NOW).entitlements[0].access,false);db.close();
});
test('company access is scoped to membership and billing owner; annual plan records fixed limits',()=>{
  const db=dbFixture();intent(db,'mrpAnnual','mrp-owner','test-company-a');deliver(db,'transaction.completed',payment('mrpAnnual',1,'2026-01-01T00:00:00Z','2027-01-01T00:00:00Z'));deliver(db,'subscription.created',subscription('active','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z','mrpAnnual'));
  assert.equal(forActor(db,actor(db,'mrp-member'),NOW)[0].access,true);assert.equal(forActor(db,actor(db,'mrp-other-owner'),NOW).length,0);assert.deepEqual(project(db,NOW).entitlements[0].limits,{companies:1,sites:1,users:5});db.close();
});
test('durable events survive restart; inbox drops checkout email and payment-method details',()=>{
  const dir=mkdtempSync(join(tmpdir(),'hamvara-fulfillment-'));let db;try{const file=join(dir,'test.sqlite');db=openStore(file);seed(db);intent(db);const p=payment();p.customer={email:'do-not-store@example.test'};p.payments=[{secret:'private'}];deliver(db,'transaction.completed',p);deliver(db,'subscription.created',subscription());db.close();db=openStore(file);assert.equal(project(db,NOW).entitlements[0].access,true);const payload=db.prepare('SELECT payload FROM events WHERE event_type=?').get('transaction.completed').payload;assert.equal(payload.includes('do-not-store'),false);assert.equal(payload.includes('private'),false);}finally{db?.close();assert.equal(dir.startsWith(join(tmpdir(),'hamvara-fulfillment-')),true);rmSync(dir,{recursive:true,force:true});}
});
test('HTTP enforces sessions, host, origin, CSRF, static allowlist, ownership and authenticated logout',async()=>{
  const db=dbFixture();const server=createServer({db,port:0,clock:()=>NOW,paddle:{createTransaction:async()=>({id:pid('txn',8),status:'draft'})},webhookSecret:SECRET});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://localhost:${server.address().port}`,origin=base;
  const request=(path,options={})=>fetch(base+path,options);
  try{
    assert.equal((await request('/api/sandbox/entitlements')).status,401);assert.equal((await request('/paddle-sandbox/fulfillment/data/sandbox.sqlite')).status,404);
    const invalidHost=await new Promise((resolve,reject)=>{const req=httpRequest(base+'/paddle-sandbox/',{headers:{Host:'evil.example'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});assert.equal(invalidHost,403);
    assert.equal((await request('/api/sandbox/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'})).status,403);
    const response=await request('/api/sandbox/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({username:'sku-alice',password:TEST_PASSWORD})});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);const cookie=response.headers.get('set-cookie').split(';')[0],credentials=await response.json();
    assert.equal((await request('/api/sandbox/product/sku',{headers:{Cookie:cookie}})).status,403);
    const post=body=>request('/api/sandbox/checkout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-Sandbox-CSRF':credentials.csrf},body:JSON.stringify(body)});
    assert.equal((await post({plan:'skuMonthly',requestKey:'request-key-123456789',companyId:'test-company-b'})).status,400);
    assert.equal((await post({plan:'mrpAnnual',requestKey:'request-key-123456789'})).status,403);
    assert.equal((await post({plan:'skuMonthly',requestKey:'request-key-123456789'})).status,200);
    const missing=await request('/api/sandbox/logout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:'{}'});assert.equal(missing.status,403);
    const s=signed('transaction.completed',payment());assert.equal((await request('/api/sandbox/webhook',{method:'POST',headers:{'Paddle-Signature':s.header},body:s.raw})).status,200);
    intent(db);deliver(db,'subscription.created',subscription());
    assert.equal((await request('/api/sandbox/product/sku',{headers:{Cookie:cookie}})).status,200);
    assert.equal((await request('/api/sandbox/product/mrp',{headers:{Cookie:cookie}})).status,403);
    assert.equal((await request('/api/sandbox/webhook',{method:'POST',headers:{'Paddle-Signature':'bad'},body:s.raw})).status,401);
    assert.equal((await request('/api/sandbox/logout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-Sandbox-CSRF':credentials.csrf},body:'{}'})).status,200);
    assert.equal((await request('/api/sandbox/entitlements',{headers:{Cookie:cookie}})).status,401);
  }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
test('ambiguous billing owners and more than five company members fail closed',()=>{
  const db=dbFixture(),owner=actor(db,'mrp-owner');
  db.prepare('INSERT INTO companies VALUES(?,?,?,?,1)').run('test-company-c','Extra company','mrp-owner','extra-site');db.prepare('INSERT INTO memberships VALUES(?,?)').run('mrp-owner','test-company-c');assert.throws(()=>resolveOwner(db,owner,PLANS.mrpAnnual));
  intent(db,'mrpAnnual','mrp-owner','test-company-a');deliver(db,'transaction.completed',payment('mrpAnnual',1,'2026-01-01T00:00:00Z','2027-01-01T00:00:00Z'));deliver(db,'subscription.created',subscription('active','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z','mrpAnnual'));
  for(let n=0;n<4;n++){db.prepare('INSERT INTO users VALUES(?,?,?,?,?,1)').run('extra-'+n,'extra-'+n,'salt','00'.repeat(32),'mrp');db.prepare('INSERT INTO memberships VALUES(?,?)').run('extra-'+n,'test-company-a');}
  assert.equal(project(db,NOW).entitlements[0].reason,'company_test_user_limit_exceeded');assert.equal(project(db,NOW).entitlements[0].access,false);db.close();
});
test('reconciliation uses authenticated sandbox API snapshots, is idempotent and does not match emails',async()=>{
  const db=dbFixture();intent(db);const txn={...payment(),updated_at:'2026-01-02T00:00:00Z'},sub={...subscription(),updated_at:'2026-01-02T00:00:00Z'};
  const paddle={listAdjustments:async()=>({data:[],meta:{pagination:{has_more:false}}}),getTransaction:async id=>{assert.equal(id,pid('txn',1));return txn;},getSubscription:async id=>{assert.equal(id,pid('sub',1));return sub;},listCompletedTransactions:async()=>({data:[txn],meta:{pagination:{has_more:false}}})};
  await reconcile(db,paddle,NOW);assert.equal(project(db,NOW).entitlements[0].access,true);await reconcile(db,paddle,NOW);assert.equal(db.prepare('SELECT COUNT(*) n FROM events').get().n,2);assert.match(db.prepare('SELECT payload FROM events LIMIT 1').get().payload,/sandbox-api/);db.close();
});
