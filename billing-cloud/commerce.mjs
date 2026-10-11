import {PLANS,publicCatalog} from '../paddle-sandbox/fulfillment/catalog.mjs';
import {projectRecords} from './projection.mjs';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export async function keyHash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');}
async function actorFor(request,db,now){
 const header=request.headers.get('authorization')||'';
 if(!/^Bearer hbc_[a-f0-9]{64}$/.test(header))fail(401,'billing_access_key_required');
 const actor=await db.prepare('SELECT u.id,u.name FROM billing_keys k JOIN billing_users u ON u.id=k.user_id WHERE k.key_hash=? AND k.expires_at>? AND k.revoked=0 AND u.active=1').bind(await keyHash(header.slice(7)),now).first();
 if(!actor)fail(401,'billing_access_key_invalid_or_expired');
 return actor;
}
async function ownerFor(db,actor,plan){
 if(plan.scope==='user')return actor.id;
 const rows=await db.prepare('SELECT c.id FROM billing_companies c JOIN billing_memberships m ON m.company_id=c.id WHERE c.billing_owner=? AND m.user_id=? AND c.active=1').bind(actor.id,actor.id).all();
 if(rows.results.length!==1)fail(403,'single_company_billing_owner_required');
 return rows.results[0].id;
}
export async function checkout(db,actor,body,apiKey,now,upstream=fetch){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['plan','requestKey'].includes(k)))fail(400,'only_plan_and_request_key_allowed');
 const plan=Object.hasOwn(PLANS,body.plan)?PLANS[body.plan]:null;
 if(!plan||typeof body.requestKey!=='string'||! /^[a-zA-Z0-9-]{16,80}$/.test(body.requestKey))fail(400,'invalid_plan_or_request_key');
 const owner=await ownerFor(db,actor,plan);
 if(!/^pdl_sdbx_apikey_/.test(apiKey||''))fail(503,'sandbox_api_key_required');
 // The unique owner/product constraint is the concurrency lock across Worker instances.
 const id=crypto.randomUUID();
 const result=await db.prepare('INSERT OR IGNORE INTO billing_intents (id,user_id,owner_id,scope,product,plan,request_key,state,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,actor.id,owner,plan.scope,plan.product,body.plan,body.requestKey,'creating',now).run();
 if(!result.meta.changes){
  const existing=await db.prepare('SELECT * FROM billing_intents WHERE scope=? AND owner_id=? AND product=?').bind(plan.scope,owner,plan.product).first();
  if(existing?.user_id===actor.id&&existing.plan===body.plan&&existing.state==='ready')return {transactionId:existing.transaction_id,reused:true};
  fail(409,'existing_checkout_requires_review');
 }
 try{
  const response=await upstream('https://sandbox-api.paddle.com/transactions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({items:[{price_id:plan.priceId,quantity:1}],currency_code:'USD',collection_mode:'automatic',custom_data:{sandbox_purchase_intent:id}}),signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw Error('upstream_failed');
  const {data}=await response.json();
  if(!/^txn_[a-z0-9]{26}$/.test(data?.id||'')||!['draft','ready'].includes(data.status))throw Error('invalid_transaction');
  const saved=await db.prepare("UPDATE billing_intents SET transaction_id=?,state='ready' WHERE id=? AND state='creating'").bind(data.id,id).run();
  if(saved.meta.changes!==1)throw Error('binding_not_saved');
  return {transactionId:data.id,reused:false};
 }catch{
  await db.prepare("UPDATE billing_intents SET state='review' WHERE id=? AND state='creating'").bind(id).run();
  fail(502,'checkout_uncertain_requires_review');
 }
}
export async function accountStatus(db,actor,now){
 // Atomic bounded snapshot for the small sandbox pilot, never a timer/polling loop.
 // Fail closed at the cap instead of projecting an incomplete history.
 const queries=["SELECT payload FROM billing_events WHERE environment='sandbox' AND substr(event_id,1,4)='evt_' ORDER BY occurred_at,event_id LIMIT 5001",'SELECT * FROM billing_intents LIMIT 501','SELECT id,active FROM billing_users LIMIT 501','SELECT id,active FROM billing_companies LIMIT 501','SELECT user_id,company_id FROM billing_memberships LIMIT 501'];
 const batch=await db.batch(queries.map(q=>db.prepare(q)));
 if(batch.some((r,i)=>r.results.length>(i===0?5000:500)))fail(503,'sandbox_projection_capacity_requires_review');
 const records={events:batch[0].results.map(r=>JSON.parse(r.payload)),intents:batch[1].results,users:batch[2].results,companies:batch[3].results,memberships:batch[4].results};
 const companies=records.memberships.filter(m=>m.user_id===actor.id).map(m=>m.company_id);
 const projected=projectRecords(records,now);
 return {user:actor,entitlements:projected.entitlements.filter(e=>e.scope==='user'?e.ownerId===actor.id:companies.includes(e.ownerId)),checkouts:records.intents.filter(i=>i.user_id===actor.id).map(i=>({plan:i.plan,state:i.state,transactionId:i.transaction_id})),applicationIntegration:'not_connected'};
}
export async function commerce(request,env,now){
 const path=new URL(request.url).pathname;
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)fail(403,'same_origin_required');
 const allowed=path==='/api/billing/checkout'?'POST':'GET';
 if(request.method!==allowed)fail(405,'method_not_allowed');
 const actor=await actorFor(request,env.DB,now);
 if(path==='/api/billing/account')return {...await accountStatus(env.DB,actor,now),plans:publicCatalog()};
 if(path==='/api/billing/checkout'){
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'json_required');
  // Stream-bound request size, including clients without Content-Length.
  const reader=request.body?.getReader();if(!reader)fail(400,'invalid_json');let length=0,text='';const decoder=new TextDecoder();
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2048){await reader.cancel();fail(413,'body_too_large');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
  let body;try{body=JSON.parse(text);}catch{fail(400,'invalid_json');}
  return checkout(env.DB,actor,body,env.PADDLE_SANDBOX_API_KEY,now);
 }
 fail(404,'not_found');
}
