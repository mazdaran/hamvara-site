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
const NOW=Date.parse('2026-01-15T12:00:00Z'),SECRET='local-adjustment-test-secret',DAY=86400000;
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

function adj(overrides={}){return {id:pid('adj',1),transaction_id:pid('txn',1),subscription_id:pid('sub',1),customer_id:pid('ctm',1),currency_code:'USD',action:'refund',type:'full',status:'approved',totals:{total:'1440',currency_code:'USD'},...overrides};}
const state=db=>project(db,NOW).entitlements[0];
test('full approved refund removes paid access and grace, pending/rejected do not',()=>{
 for(const status of ['pending_approval','rejected','approved']){const db=paidFixture();deliver(db,'adjustment.created',adj({status}));assert.equal(state(db).access,status!=='approved');if(status==='approved'){deliver(db,'subscription.past_due',subscription('past_due'),'2026-01-12T00:00:00Z');assert.equal(state(db).access,false);}db.close();}
});
test('partial refunds accumulate once per adjustment and full aggregate revokes',()=>{
 const db=paidFixture(),a=adj({type:'partial',totals:{total:'720',currency_code:'USD'}});deliver(db,'adjustment.created',a);deliver(db,'adjustment.updated',a,'2026-01-03T00:00:00Z');assert.equal(state(db).access,true);deliver(db,'adjustment.created',{...a,id:pid('adj',2)});assert.equal(state(db).access,false);db.close();
});
test('out of order pending cannot undo approval; duplicate delivery is idempotent',()=>{
 const db=paidFixture(),event=pid('evt',90000);deliver(db,'adjustment.updated',adj(),'2026-01-04T00:00:00Z',event);assert.equal(deliver(db,'adjustment.updated',adj(),'2026-01-04T00:00:00Z',event).duplicate,true);deliver(db,'adjustment.created',adj({status:'pending_approval'}),'2026-01-03T00:00:00Z');assert.equal(state(db).access,false);db.close();
});
test('adjustment before payment still revokes after binding arrives',()=>{
 const db=dbFixture();intent(db);deliver(db,'adjustment.created',adj());deliver(db,'transaction.completed',payment());deliver(db,'subscription.created',subscription());assert.equal(state(db).access,false);db.close();
});
test('chargeback warning/chargeback hold only clears on original reversed status',()=>{
 for(const action of ['chargeback','chargeback_warning']){const db=paidFixture();deliver(db,'adjustment.created',adj({action}));assert.equal(state(db).reason,'payment_dispute');deliver(db,'adjustment.created',adj({id:pid('adj',2),action:action+'_reverse'}),'2026-01-03T00:00:00Z');assert.equal(state(db).access,false);deliver(db,'adjustment.updated',adj({action,status:'reversed'}),'2026-01-04T00:00:00Z');assert.equal(state(db).access,true);db.close();}
});
test('reversal never restores canceled subscription or refunded payment',()=>{
 for(const canceled of [true,false]){const db=paidFixture();deliver(db,'adjustment.created',adj({action:'chargeback'}));if(canceled)deliver(db,'subscription.canceled',subscription('canceled'));else deliver(db,'adjustment.created',adj({id:pid('adj',2)}));deliver(db,'adjustment.updated',adj({action:'chargeback',status:'reversed'}),'2026-01-04T00:00:00Z');assert.equal(state(db).access,false);db.close();}
});
test('mismatched references, currency, totals and equal-time conflicts fail closed',()=>{
 for(const changes of [{customer_id:pid('ctm',2)},{subscription_id:pid('sub',2)},{currency_code:'EUR'},{totals:{total:'-1',currency_code:'USD'}},{totals:{total:'1441',currency_code:'USD'}},{action:'unknown'}]){const db=paidFixture();deliver(db,'adjustment.created',adj(changes));assert.equal(state(db).access,false);assert.ok(project(db,NOW).review.length);db.close();}
 const db=paidFixture();deliver(db,'adjustment.created',adj());deliver(db,'adjustment.updated',adj({status:'rejected'}));assert.equal(state(db).access,false);db.close();
});
test('unbound adjustment cannot revoke another customer/product',()=>{
 const db=paidFixture();deliver(db,'adjustment.created',adj({transaction_id:pid('txn',999)}));assert.equal(state(db).access,true);db.close();
});
test('refund of old period does not remove separately paid renewal',()=>{
 const db=paidFixture();const start='2026-02-01T00:00:00Z',end='2026-03-01T00:00:00Z';deliver(db,'transaction.completed',payment('skuMonthly',2,start,end));deliver(db,'subscription.updated',subscription('active',start,end),'2026-01-05T00:00:00Z');deliver(db,'adjustment.created',adj());assert.equal(project(db,Date.parse('2026-02-15T00:00:00Z')).entitlements[0].access,true);db.close();
});
test('lean adjustment inbox does not retain reason, email or payment details',()=>{
 const db=paidFixture();deliver(db,'adjustment.created',adj({reason:'private complaint',email:'private@example.test',payment_method:{secret:'private'}}));const row=db.prepare("SELECT payload FROM events WHERE event_type='adjustment.created'").get();assert.equal(row.payload.includes('private'),false);db.close();
});
test('API reconciliation recovers missing approved refund and is idempotent',async()=>{
 const db=paidFixture(),txn={...payment(),updated_at:'2026-01-02T00:00:00Z'},sub={...subscription(),updated_at:'2026-01-02T00:00:00Z'};
 const paddle={getTransaction:async()=>txn,getSubscription:async()=>sub,listCompletedTransactions:async()=>({data:[txn]}),listAdjustments:async()=>({data:[{...adj(),updated_at:'2026-01-05T00:00:00Z'}]})};
 await reconcile(db,paddle,NOW);assert.equal(state(db).access,false);const n=db.prepare('SELECT COUNT(*) n FROM events').get().n;await reconcile(db,paddle,NOW);assert.equal(db.prepare('SELECT COUNT(*) n FROM events').get().n,n);db.close();
});
