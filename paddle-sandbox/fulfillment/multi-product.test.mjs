import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { openStore, seed, TEST_PASSWORD } from './store.mjs';
import { login,session,resolveOwner } from './auth.mjs';
import { PLANS,buildCatalog,publicCatalog } from './catalog.mjs';
import { createCheckout } from './checkout.mjs';
import { acceptEvent } from './webhooks.mjs';
import { project,forActor } from './lifecycle.mjs';
import { createServer } from './server.mjs';
const now=Date.parse('2026-01-15T12:00:00Z'),secret='synthetic_multi_product_test_secret';
const id=(p,n)=>p+'_'+String(n).padStart(26,'0');
const actor=(db,name)=>{const l=login(db,name,TEST_PASSWORD,now);return session(db,`hamvara_sandbox_session=${l.token}`,now);};
function fixture(){const db=openStore(':memory:');seed(db);return db;}
function deliver(db,type,data,n){const raw=Buffer.from(JSON.stringify({event_id:id('evt',n),event_type:type,occurred_at:'2026-01-02T00:00:00Z',data})),ts=String(now/1000);acceptEvent(db,raw,`ts=${ts};h1=${createHmac('sha256',secret).update(ts+':').update(raw).digest('hex')}`,secret,now);}
function paid(db,key,owner,n){
 const p=PLANS[key],period={starts_at:'2026-01-01T00:00:00Z',ends_at:p.interval==='year'?'2027-01-01T00:00:00Z':'2026-02-01T00:00:00Z'};
 const intent=db.prepare('SELECT * FROM intents WHERE owner_id=? AND plan=?').get(owner,key);
 const items=[{quantity:1,price:{id:p.priceId,product_id:p.productId,unit_price:{amount:p.amount,currency_code:'USD'},billing_cycle:{interval:p.interval,frequency:1},tax_mode:'external',trial_period:null,unit_price_overrides:[]}}];
 const shared={currency_code:'USD',collection_mode:'automatic',customer_id:id('ctm',n),items};
 deliver(db,'transaction.completed',{...shared,id:intent.transaction_id,status:'completed',subscription_id:id('sub',n),origin:'api',custom_data:{sandbox_purchase_intent:intent.id},billing_period:period,details:{totals:{currency_code:'USD',subtotal:p.amount,discount:'0',tax:'0',total:p.amount,balance:'0'}}},n*2);
 deliver(db,'subscription.created',{...shared,id:id('sub',n),status:'active',current_billing_period:period,scheduled_change:null},n*2+1);
}
test('one account buys two products; company members receive only company access; canceling SKU preserves MRP',async()=>{
 const db=fixture();try{
 const a=actor(db,'mrp-owner');let n=0;const paddle={createTransaction:async()=>({id:id('txn',++n),status:'draft'})};
 await createCheckout(db,a,{plan:'skuMonthly',requestKey:'multi-product-request-1'},paddle,now);
 await createCheckout(db,a,{plan:'mrpAnnual',requestKey:'multi-product-request-2'},paddle,now);
 paid(db,'skuMonthly','mrp-owner',1);paid(db,'mrpAnnual','test-company-a',2);
 assert.deepEqual(forActor(db,a,now).filter(e=>e.access).map(e=>e.product).sort(),['mrp','sku']);
 assert.deepEqual(forActor(db,actor(db,'mrp-member'),now).map(e=>e.product),['mrp']);
 assert.equal(forActor(db,actor(db,'mrp-other-owner'),now).length,0);
 const data=JSON.parse(db.prepare("SELECT payload FROM events WHERE event_type='subscription.created' ORDER BY event_id LIMIT 1").get().payload).data;
 deliver(db,'subscription.canceled',{...data,status:'canceled',current_billing_period:null},99);
 // Newer occurrence is needed; don't let equal-time contradictions masquerade as cancellation.
 db.prepare("UPDATE events SET occurred_at=?,payload=? WHERE event_id=?").run('2026-01-10T00:00:00Z',JSON.stringify({event_id:id('evt',99),event_type:'subscription.canceled',occurred_at:'2026-01-10T00:00:00Z',data:{...data,status:'canceled',current_billing_period:null}}),id('evt',99));
 const ents=forActor(db,a,now);assert.equal(ents.find(e=>e.product==='sku').access,false);assert.equal(ents.find(e=>e.product==='mrp').access,true);
 }finally{db.close();}
});
test('legacy identity metadata never grants company ownership or cross-user access',()=>{
 const db=fixture();try{const a=actor(db,'mrp-member');assert.equal(resolveOwner(db,a,PLANS.skuAnnual),'mrp-member');assert.throws(()=>resolveOwner(db,a,PLANS.mrpAnnual));db.prepare('UPDATE users SET kind=? WHERE id=?').run('mrp','sku-alice');assert.throws(()=>resolveOwner(db,actor(db,'sku-alice'),PLANS.mrpAnnual));}finally{db.close();}
});
test('catalog response requires a session and accurately reports eligibility without exposing credentials',async()=>{
 const db=fixture(),server=createServer({db,port:0,clock:()=>now});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://localhost:${server.address().port}`;
 try{assert.equal((await fetch(base+'/api/sandbox/catalog')).status,401);const l=login(db,'mrp-owner',TEST_PASSWORD,now),res=await fetch(base+'/api/sandbox/catalog',{headers:{Cookie:`hamvara_sandbox_session=${l.token}`}}),catalog=await res.json();assert.equal(catalog.plans.length,3);assert.ok(catalog.plans.every(p=>p.eligible));assert.equal(JSON.stringify(catalog).includes(TEST_PASSWORD),false);assert.equal((await fetch(base+'/api/sandbox/product/unknown',{headers:{Cookie:`hamvara_sandbox_session=${l.token}`}})).status,404);}finally{await new Promise(r=>server.close(r));db.close();}
});
test('catalog validation rejects duplicate prices, unknown products and invalid limits',()=>{
 const p=PLANS.skuMonthly,product={name:'Test',description:'Test',scope:'user',limits:{users:2},graceDays:3};
 assert.throws(()=>buildCatalog({test:product},{bad:{...p,product:'unknown'}}));
 assert.throws(()=>buildCatalog({test:product},{one:{...p,product:'test'},two:{...p,product:'test'}}));
 assert.throws(()=>buildCatalog({test:{...product,limits:{users:0}}},{one:{...p,product:'test'}}));
 assert.equal(publicCatalog().length,3);assert.ok(Object.isFrozen(PLANS.skuMonthly.limits));
});
test('fresh request keys and alternate billing periods cannot create a second purchase for the same owner/product',async()=>{
 const db=fixture();try{let calls=0;const a=actor(db,'sku-alice'),paddle={createTransaction:async()=>({id:id('txn',++calls),status:'draft'})};
 const request={plan:'skuMonthly',requestKey:'deduplicate-request-1'};await createCheckout(db,a,request,paddle,now);await createCheckout(db,a,request,paddle,now);assert.equal(calls,1);
 await assert.rejects(createCheckout(db,a,{plan:'skuMonthly',requestKey:'deduplicate-request-2'},paddle,now));
 await assert.rejects(createCheckout(db,a,{plan:'skuAnnual',requestKey:'deduplicate-request-3'},paddle,now));assert.equal(calls,1);
 }finally{db.close();}
});
