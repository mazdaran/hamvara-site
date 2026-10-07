import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,cpSync,appendFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
test('third synthetic product reaches verified entitlement by registry-only extension',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hamvara-third-product-'));
 try{
 cpSync(dirname(fileURLToPath(import.meta.url)),join(dir,'fulfillment'),{recursive:true,filter:src=>!src.split(/[\\/]/).includes('data')});
 // Use a separate registry fixture; no production or sandbox catalog files are modified.
 writeFileSync(join(dir,'fulfillment','product-registry.mjs'),`export const PRODUCTS={proof:{name:'Proof',description:'Synthetic only',scope:'user',limits:{users:2},graceDays:3}};export const PRICE_DEFINITIONS={proofMonthly:{priceId:'pri_'+ '9'.repeat(26),productId:'pro_'+ '9'.repeat(26),amount:'100',interval:'month',product:'proof'}};`);
 writeFileSync(join(dir,'fulfillment','proof.mjs'),`
 import assert from 'node:assert/strict';import {openStore,seed,TEST_PASSWORD} from './store.mjs';import {login,session} from './auth.mjs';import {createCheckout} from './checkout.mjs';import {project} from './lifecycle.mjs';import {recordApiSnapshot} from './webhooks.mjs';import {PLANS} from './catalog.mjs';
 const db=openStore(':memory:');seed(db);const now=Date.parse('2026-01-15T12:00:00Z'),l=login(db,'sku-alice',TEST_PASSWORD,now),actor=session(db,'hamvara_sandbox_session='+l.token,now),id=p=>p+'_'+ '9'.repeat(26);
 await createCheckout(db,actor,{plan:'proofMonthly',requestKey:'proof-product-request-123'}, {createTransaction:async()=>({id:id('txn'),status:'draft'})},now);
 const intent=db.prepare('SELECT * FROM intents').get(),p=PLANS.proofMonthly,period={starts_at:'2026-01-01T00:00:00Z',ends_at:'2026-02-01T00:00:00Z'},shared={updated_at:'2026-01-02T00:00:00Z',customer_id:id('ctm'),currency_code:'USD',collection_mode:'automatic',items:[{quantity:1,price:{id:p.priceId,product_id:p.productId,unit_price:{amount:p.amount,currency_code:'USD'},billing_cycle:{interval:'month',frequency:1},tax_mode:'external',trial_period:null,unit_price_overrides:[]}}]};
 recordApiSnapshot(db,'transaction.completed',{...shared,id:id('txn'),status:'completed',subscription_id:id('sub'),origin:'api',custom_data:{sandbox_purchase_intent:intent.id},billing_period:period,details:{totals:{currency_code:'USD',subtotal:'100',tax:'0',discount:'0',total:'100',balance:'0'}}},now);
 recordApiSnapshot(db,'subscription.updated',{...shared,id:id('sub'),status:'active',current_billing_period:period,scheduled_change:null},now);
 let e=project(db,now).entitlements[0];assert.equal(e.product,'proof');assert.equal(e.access,true);assert.deepEqual(e.limits,{users:2});
 recordApiSnapshot(db,'subscription.updated',{...shared,updated_at:'2026-01-10T00:00:00Z',id:id('sub'),status:'past_due',current_billing_period:period,scheduled_change:null},now);
 const end=Date.parse(period.ends_at)+3*86400000;assert.equal(project(db,end-1).entitlements[0].access,true);assert.equal(project(db,end).entitlements[0].access,false);db.close();
 `);
 const run=spawnSync(process.execPath,[join(dir,'fulfillment','proof.mjs')],{encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stderr);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
