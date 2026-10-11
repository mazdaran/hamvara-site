import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {checkout,accountStatus,keyHash} from './commerce.mjs';
import {handle} from './worker.mjs';
import {PLANS} from '../paddle-sandbox/fulfillment/catalog.mjs';
const now=Date.parse('2026-10-11T14:00:00Z'),secret='test-signature-secret',apiKey='pdl_sdbx_apikey_test';
const id=(prefix,n)=>prefix+'_'+String(n).padStart(26,'0');
function fixture(){const sql=new DatabaseSync(':memory:');for(const name of ['0001_inbox.sql','0002_checkout.sql'])sql.exec(readFileSync(new URL('./migrations/'+name,import.meta.url),'utf8'));sql.exec("INSERT INTO billing_users VALUES('a','Alice',1),('b','Bob',1); INSERT INTO billing_companies VALUES('ca','Company A','a',1),('cb','Company B','b',1); INSERT INTO billing_memberships VALUES('a','ca'),('b','cb');");
 const DB={prepare(query){const statement={values:[],bind(...values){return {...statement,values};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...this.values).changes)}};},async first(){return sql.prepare(query).get(...this.values)||null;},async all(){return {results:sql.prepare(query).all(...this.values)};}};return statement;},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.all());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return {sql,DB,env:{DB,BILLING_ENV:'sandbox',PADDLE_SANDBOX_WEBHOOK_SECRET:secret}};
}
const actor={id:'a',name:'Alice'};
const requestKey='test-request-key-123456';
const upstream=async()=>Response.json({data:{id:id('txn',1),status:'ready'}});
async function setup(f,plan='mrpAnnual'){await checkout(f.DB,actor,{plan,requestKey},apiKey,now,upstream);return f.sql.prepare('SELECT * FROM billing_intents').get();}
function data(intent){const plan=PLANS[intent.plan],period={starts_at:'2026-10-01T00:00:00Z',ends_at:plan.interval==='year'?'2027-10-01T00:00:00Z':'2026-11-01T00:00:00Z'},items=[{quantity:1,proration:null,price:{id:plan.priceId,product_id:plan.productId,unit_price:{amount:plan.amount,currency_code:'USD'},tax_mode:'external',trial_period:null,billing_cycle:{interval:plan.interval,frequency:1},unit_price_overrides:[]}}];
 const common={customer_id:id('ctm',1),currency_code:'USD',collection_mode:'automatic',items};
 return {payment:{...common,id:id('txn',1),status:'completed',subscription_id:id('sub',1),origin:'api',custom_data:{sandbox_purchase_intent:intent.id},billing_period:period,details:{totals:{currency_code:'USD',subtotal:plan.amount,discount:'0',tax:'0',total:plan.amount,balance:'0'}}},subscription:{...common,id:id('sub',1),status:'active',current_billing_period:period,scheduled_change:null}};
}
let seq=0;
async function deliver(f,type,data,options={}){const raw=JSON.stringify({event_id:options.id||id('evt',++seq),event_type:type,occurred_at:options.at||'2026-10-02T00:00:00Z',data});const ts=Math.floor(now/1000);return handle(new Request('https://billing.test/webhooks/paddle',{method:'POST',headers:{'paddle-signature':`ts=${ts};h1=${createHmac('sha256',secret).update(ts+':'+raw).digest('hex')}`},body:raw}),f.env,now);}
async function access(f,who=actor,time=now){return (await accountStatus(f.DB,who,time)).entitlements;}
test('checkout binds server-side owner and prevents concurrent and uncertain duplicate purchases',async()=>{const f=fixture();let calls=0;const send=async()=>{calls++;return upstream();};const body={plan:'mrpAnnual',requestKey};const results=await Promise.allSettled([checkout(f.DB,actor,body,apiKey,now,send),checkout(f.DB,actor,body,apiKey,now,send)]);assert.equal(calls,1);assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(f.sql.prepare('SELECT owner_id FROM billing_intents').get().owner_id,'ca');assert.equal((await checkout(f.DB,actor,{...body,requestKey:'another-request-key'},apiKey,now,send)).transactionId,id('txn',1));assert.equal(calls,1);await assert.rejects(checkout(f.DB,actor,{...body,owner_id:'cb'},apiKey,now,send));const g=fixture();await assert.rejects(checkout(g.DB,actor,body,apiKey,now,async()=>{throw Error('timeout');}));await assert.rejects(checkout(g.DB,actor,{...body,requestKey:'new-request-key-1234'},apiKey,now,send));assert.equal(calls,1);});
test('signed payment and subscription grant only the owning company in either arrival order',async()=>{for(const reverse of [false,true]){const f=fixture(),intent=await setup(f),d=data(intent),events=[['transaction.completed',d.payment],['subscription.created',d.subscription]];if(reverse)events.reverse();assert.equal((await deliver(f,...events[0])).status,200);assert.equal((await access(f)).some(e=>e.access),false);assert.equal((await deliver(f,...events[1])).status,200);assert.equal((await access(f))[0].access,true);assert.equal((await access(f,{id:'b'})).length,0);assert.equal((await accountStatus(f.DB,{id:'b'},now)).checkouts.length,0);}});
test('simulations, unassigned transactions and forged intent references never activate accounts',async()=>{for(const mode of ['simulation','transaction','intent']){const f=fixture(),intent=await setup(f),d=data(intent);if(mode==='transaction')d.payment.id=id('txn',9);if(mode==='intent')d.payment.custom_data.sandbox_purchase_intent='forged';await deliver(f,'transaction.completed',d.payment,mode==='simulation'?{id:id('ntfsimevt',1)}:{});await deliver(f,'subscription.created',d.subscription);assert.equal((await access(f)).some(e=>e.access),false);}});
test('cancellation wins over old active event, refund removes access and inactive identities fail closed',async()=>{for(const mode of ['cancel','refund','inactive']){const f=fixture(),intent=await setup(f),d=data(intent);await deliver(f,'transaction.completed',d.payment);await deliver(f,'subscription.created',d.subscription);assert.equal((await access(f))[0].access,true);if(mode==='cancel'){await deliver(f,'subscription.canceled',{...d.subscription,status:'canceled'},{at:'2026-10-05T00:00:00Z'});await deliver(f,'subscription.updated',d.subscription,{at:'2026-10-03T00:00:00Z'});}else if(mode==='refund'){await deliver(f,'adjustment.created',{id:id('adj',1),transaction_id:d.payment.id,subscription_id:d.payment.subscription_id,customer_id:d.payment.customer_id,currency_code:'USD',action:'refund',status:'approved',type:'full',totals:{total:PLANS.mrpAnnual.amount,currency_code:'USD'}});}else f.sql.exec("UPDATE billing_companies SET active=0 WHERE id='ca'");assert.equal((await access(f))[0].access,false);}});
test('unknown price, altered totals, overrides and discounts survive lean storage and fail validation',async()=>{for(const mutate of [p=>p.items[0].price.id=id('pri',9),p=>p.details.totals.total='1',p=>p.items[0].price.unit_price_overrides=[{country_codes:['US'],unit_price:{amount:'1',currency_code:'USD'}}],p=>p.discount={id:'discount'}]){const f=fixture(),intent=await setup(f),d=data(intent);mutate(d.payment);await deliver(f,'transaction.completed',d.payment);await deliver(f,'subscription.created',d.subscription);assert.equal((await access(f)).some(e=>e.access),false);}});
test('same signed event deduplicates, conflicting payload rejected',async()=>{const f=fixture(),intent=await setup(f),d=data(intent),options={id:id('evt',9999)};await deliver(f,'transaction.completed',d.payment,options);const r=await deliver(f,'transaction.completed',d.payment,options);assert.equal((await r.json()).duplicate,true);assert.equal((await deliver(f,'transaction.completed',{...d.payment,status:'draft'},options)).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM billing_events').get().n,1);});
test('API keys expire/revoke; cross-origin requests rejected; secrets absent from health and pages',async()=>{const f=fixture(),key='hbc_'+'a'.repeat(64);await f.DB.prepare('INSERT INTO billing_keys VALUES(?,?,?,0)').bind(await keyHash(key),'a',now+1000).run();const req=(origin)=>new Request('https://billing.test/api/billing/account',{headers:{authorization:'Bearer '+key,...(origin?{origin}:{})}});assert.equal((await handle(req(),f.env,now)).status,200);assert.equal((await handle(req('https://evil.test'),f.env,now)).status,403);assert.equal((await handle(req(),f.env,now+1000)).status,401);f.sql.exec('UPDATE billing_keys SET revoked=1');assert.equal((await handle(req(),f.env,now)).status,401);const page=await handle(new Request('https://billing.test/billing'),f.env,now);assert.equal(page.status,200);assert.ok(page.headers.get('Content-Security-Policy'));assert.doesNotMatch(await page.text(),/pdl_sdbx_apikey|test-signature-secret/);});
test('existing inbox hashes stay compatible with empty overrides and null discounts',async()=>{const f=fixture(),intent=await setup(f),d=data(intent),options={id:id('evt',8888)};const before=structuredClone(d.payment);delete before.items[0].price.unit_price_overrides;assert.equal((await deliver(f,'transaction.completed',before,options)).status,200);d.payment.discount=null;const after=await deliver(f,'transaction.completed',d.payment,options);assert.equal(after.status,200);assert.equal((await after.json()).duplicate,true);});
test('same-time creation and activation ignore only originating transaction metadata',async()=>{
 for(const reverse of [false,true]){
  const f=fixture(),intent=await setup(f),d=data(intent);
  await deliver(f,'transaction.completed',d.payment);
  const events=[['subscription.created',{...d.subscription,transaction_id:d.payment.id}],['subscription.activated',d.subscription]];
  if(reverse)events.reverse();
  for(const event of events)await deliver(f,...event);
  assert.equal((await access(f))[0].access,true);
  assert.equal((await access(f,{id:'b'})).length,0);
 }
});
test('same-time subscription state conflicts still deny access in either arrival order',async()=>{
 for(const mutate of [s=>s.status='canceled',s=>s.customer_id=id('ctm',2),s=>s.items[0].price.id=id('pri',9),s=>s.current_billing_period.ends_at='2028-10-01T00:00:00Z',s=>s.scheduled_change={action:'cancel',effective_at:'2026-10-10T00:00:00Z'}]){
  for(const reverse of [false,true]){
   const f=fixture(),intent=await setup(f),d=data(intent),changed=structuredClone(d.subscription);
   mutate(changed);await deliver(f,'transaction.completed',d.payment);
   const events=[d.subscription,changed];if(reverse)events.reverse();
   for(const event of events)await deliver(f,'subscription.updated',event);
   const entitlement=(await access(f))[0];assert.equal(entitlement.access,false);assert.equal(entitlement.reason,'subscription_timestamp_conflict');
  }
 }
});
test('checkout diagnostics preserve failure stage, hide secrets and keep duplicate lock',async()=>{
 const logs=[],original=console.error;console.error=value=>logs.push(value);
 try{
  for(const mode of ['rejected','network','invalid','binding']){
   const f=fixture();let calls=0;
   const send=async(url,options)=>{
    calls++;assert.equal(options.headers.Authorization,'Bearer '+apiKey);
    if(mode==='rejected')return Response.json({error:{code:'forbidden',detail:'PRIVATE '+apiKey},meta:{request_id:'12345678-1234-1234-1234-123456789abc'}},{status:403});
    if(mode==='network')throw Error('PRIVATE '+apiKey);
    if(mode==='invalid')return Response.json({data:{id:'bad'}});
    f.sql.exec("CREATE TRIGGER fail_binding BEFORE UPDATE OF transaction_id ON billing_intents BEGIN SELECT RAISE(FAIL,'PRIVATE'); END;");
    return upstream();
   };
   const body={plan:'skuMonthly',requestKey};
   await assert.rejects(checkout(f.DB,actor,body,'  '+apiKey+'\n',now,send),error=>{
    assert.match(error.message,/checkout_uncertain_requires_review/);
    assert.doesNotMatch(error.message,/PRIVATE|pdl_sdbx/);return true;
   });
   const log=JSON.parse(logs.at(-1));
   assert.equal(log.stage,{rejected:'paddle_rejected',network:'request',invalid:'response_validation',binding:'binding_save'}[mode]);
   if(mode==='rejected'){assert.equal(log.httpStatus,403);assert.equal(log.paddleCode,'forbidden');assert.ok(log.requestId);}
   assert.equal(f.sql.prepare('SELECT state FROM billing_intents').get().state,'review');
   await assert.rejects(checkout(f.DB,actor,body,apiKey,now,send),/existing_checkout_requires_review/);
   assert.equal(calls,1);
  }
  assert.doesNotMatch(logs.join(''),/PRIVATE|pdl_sdbx/);
 }finally{console.error=original;}
});

test('checkout uses Worker-compatible manual redirects and rejects redirect responses',async()=>{
 const f=fixture();let calls=0;
 await assert.rejects(checkout(f.DB,actor,{plan:'skuMonthly',requestKey},apiKey,now,async(url,options)=>{
  calls++;assert.equal(options.redirect,'manual');
  return new Response(null,{status:302,headers:{location:'https://untrusted.invalid/'}});
 }),/paddle_rejected HTTP 302/);
 assert.equal(calls,1);assert.equal(f.sql.prepare('SELECT state FROM billing_intents').get().state,'review');
});
test('internal company decision returns only matching MRP entitlement',async()=>{
 const {companyAccess}=await import('./company-access.mjs');const f=fixture();
 f.sql.exec("BEGIN; PRAGMA defer_foreign_keys=ON; UPDATE billing_companies SET id='billing-company-b' WHERE id='ca'; UPDATE billing_memberships SET company_id='billing-company-b' WHERE company_id='ca'; COMMIT;");
 const intent=await setup(f),d=data(intent);await deliver(f,'transaction.completed',d.payment);await deliver(f,'subscription.created',d.subscription);
 const b=await companyAccess(f.env,'billing-company-b',now);assert.equal(b.access,true);assert.equal(b.maxUsers,5);
 assert.equal((await companyAccess(f.env,'billing-company-a',now)).access,false);
 await assert.rejects(companyAccess(f.env,'other-company',now));
 const r=await handle(new Request('https://billing.test/companyAccess?companyId=billing-company-b'),f.env,now);assert.equal(r.status,404);
 await deliver(f,'subscription.canceled',{...d.subscription,status:'canceled'},{at:'2026-10-05T00:00:00Z'});
 assert.equal((await companyAccess(f.env,'billing-company-b',now)).access,false);
});
