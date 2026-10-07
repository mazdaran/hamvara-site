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
import { recordApiSnapshot, acceptEvent, verifySignature } from './webhooks.mjs';
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

function apiPayment() {
 const d=payment();d.updated_at='2026-01-03T00:00:00Z';
 d.items[0].price.import_meta=null;d.details.totals.exchange_rate='1';
 d.billing_period={ends_at:d.billing_period.ends_at,starts_at:d.billing_period.starts_at};
 return d;
}
test('API optional metadata and object ordering preserve active payment',()=>{
 const db=paidFixture();recordApiSnapshot(db,'transaction.completed',apiPayment(),NOW);
 assert.equal(state(db).access,true);assert.deepEqual(project(db,NOW).review,[]);db.close();
});
test('approved refund stays linked after repeated API reconciliation in either order',()=>{
 for(const reverse of [false,true]){
 const db=dbFixture();intent(db);
 if(reverse)recordApiSnapshot(db,'transaction.completed',apiPayment(),NOW);
 deliver(db,'transaction.completed',payment());deliver(db,'subscription.created',subscription());
 deliver(db,'adjustment.updated',adj());recordApiSnapshot(db,'transaction.completed',apiPayment(),NOW);
 recordApiSnapshot(db,'transaction.completed',apiPayment(),NOW);
 assert.equal(state(db).access,false);assert.equal(state(db).reason,'payment_refunded');
 assert.deepEqual(project(db,NOW).review,[]);db.close();}
});
test('real identity, amount, period, currency and rate changes still conflict',()=>{
 const mutations=[d=>d.customer_id=pid('ctm',2),d=>d.subscription_id=pid('sub',2),d=>d.details.totals.total='1441',d=>d.billing_period.ends_at='2026-02-02T00:00:00Z',d=>d.currency_code='EUR',d=>d.items[0].quantity=2,d=>d.items[0].price.unit_price.amount='1',d=>d.custom_data.sandbox_purchase_intent='other',d=>d.details.totals.exchange_rate='2',d=>d.items[0].price.import_meta={external_id:'different'}];
 for(const mutate of mutations){const db=paidFixture(),d=apiPayment();mutate(d);recordApiSnapshot(db,'transaction.completed',d,NOW);const p=project(db,NOW);assert.ok(p.review.some(r=>r.reason==='transaction_payload_conflict'));assert.equal(p.entitlements.some(e=>e.access),false);db.close();}
});
