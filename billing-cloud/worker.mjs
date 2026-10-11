import {commerce} from './commerce.mjs';
import {page} from './pages.mjs';
const encoder=new TextEncoder();
const events=new Set(['adjustment.created','adjustment.updated','transaction.completed','subscription.created','subscription.updated','subscription.activated','subscription.past_due','subscription.paused','subscription.resumed','subscription.canceled']);
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const reply=(status,data)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const hex=buffer=>Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('');
export async function verify(raw,header,secret,now){
 if(!secret)fail(503,'webhook_not_configured');
 if(!header||header.length>2048)fail(401,'invalid_signature');
 const pairs=header.split(';').map(part=>part.trim().split('='));
 const times=pairs.filter(([key])=>key==='ts'),signatures=pairs.filter(([key,value])=>key==='h1'&&/^[a-fA-F0-9]{64}$/.test(value||''));
 const timestamp=times[0]?.[1];
 if(times.length!==1||!/^\d{10}$/.test(timestamp||'')||Math.abs(now-Number(timestamp)*1000)>5000||!signatures.length)fail(401,'invalid_signature');
 const prefix=encoder.encode(timestamp+':'),message=new Uint8Array(prefix.length+raw.length);message.set(prefix);message.set(raw,prefix.length);
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 for(const [,signature] of signatures){const bytes=Uint8Array.from(signature.match(/../g),value=>parseInt(value,16));if(await crypto.subtle.verify('HMAC',key,bytes,message))return;}
 fail(401,'invalid_signature');
}
async function readBody(request){
 const max=1048576;if(Number(request.headers.get('content-length'))>max)fail(413,'body_too_large');
 const reader=request.body?.getReader();if(!reader)fail(400,'empty_body');
 let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail(413,'body_too_large');}chunks.push(value);}}finally{reader.releaseLock();}
 const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}return data;
}
function select(object,keys){return Object.fromEntries(keys.filter(key=>object?.[key]!==undefined).map(key=>[key,object[key]]));}
export function leanEvent(event){
 const d=event.data;
 const data=select(d,['id','status','customer_id','subscription_id','transaction_id','currency_code','collection_mode','origin','discount','discount_id','billing_period','current_billing_period','scheduled_change','action','type','updated_at']);
 if(data.discount==null)delete data.discount;
 data.custom_data=select(d.custom_data,['sandbox_purchase_intent']);
 if(Array.isArray(d.items))data.items=d.items.map(item=>({quantity:item.quantity,proration:item.proration,price:select(item.price,['id','product_id','billing_cycle','trial_period','unit_price','tax_mode','quantity','unit_price_overrides'])}));
 for(const item of data.items||[])if(Array.isArray(item.price.unit_price_overrides)&&item.price.unit_price_overrides.length===0)delete item.price.unit_price_overrides;
 if(d.details?.totals)data.details={totals:d.details.totals};
 if(d.totals)data.totals=select(d.totals,['total','currency_code']);
 return {event_id:event.event_id,event_type:event.event_type,occurred_at:event.occurred_at,data};
}
function canonical(value){if(Array.isArray(value))return '['+value.map(v=>canonical(v??null)).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export async function handle(request,env,now=Date.now()){
 try{
  if(env.BILLING_ENV!=='sandbox')return reply(503,{error:'sandbox_configuration_required'});
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return reply(200,{ok:true,environment:'sandbox',webhookConfigured:!!env.PADDLE_SANDBOX_WEBHOOK_SECRET,databaseConfigured:!!env.DB,fulfillment:'sandbox_entitlements',applicationIntegration:'not_connected',checkoutConfigured:/^pdl_sdbx_apikey_/.test(env.PADDLE_SANDBOX_API_KEY||'')});
  if(request.method==='GET'){const response=page(url.pathname);if(response)return response;}
  if(['/api/billing/account','/api/billing/checkout'].includes(url.pathname))return reply(200,await commerce(request,env,now));
  if(url.pathname!=='/webhooks/paddle')return reply(404,{error:'not_found'});
  if(request.method!=='POST')return reply(405,{error:'post_required'});
  if(!env.DB)fail(503,'database_not_configured');
  const raw=await readBody(request);await verify(raw,request.headers.get('paddle-signature'),env.PADDLE_SANDBOX_WEBHOOK_SECRET,now);
  let event;try{event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{fail(400,'invalid_json');}
  if(!/^(?:evt|ntfsimevt)_[a-z0-9]{26}$/.test(event?.event_id||'')||!Number.isFinite(Date.parse(event.occurred_at))||Date.parse(event.occurred_at)>now+5000||typeof event.data?.id!=='string'||!event.data.id)fail(400,'invalid_event');
  if(!events.has(event.event_type))return reply(200,{ignored:true});
  const payload=canonical(leanEvent(event)),digest=hex(await crypto.subtle.digest('SHA-256',encoder.encode(payload)));
  const inserted=await env.DB.prepare('INSERT OR IGNORE INTO billing_events (environment,event_id,event_type,occurred_at,body_hash,payload,received_at) VALUES (?,?,?,?,?,?,?)').bind('sandbox',event.event_id,event.event_type,event.occurred_at,digest,payload,now).run();
  const saved=await env.DB.prepare('SELECT body_hash FROM billing_events WHERE environment=? AND event_id=?').bind('sandbox',event.event_id).first();
  if(!saved)fail(503,'event_not_stored');
  if(saved.body_hash!==digest)fail(409,'event_payload_conflict');
  return reply(200,{accepted:true,duplicate:!inserted.meta.changes});
 }catch(error){return reply(error.status||503,{error:error.status?error.message:'storage_unavailable'});}
}
export default {fetch(request,env){return handle(request,env);}};
