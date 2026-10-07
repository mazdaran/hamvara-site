import { createHmac, timingSafeEqual } from 'node:crypto';
import { hash, HttpError } from './auth.mjs';
const ALLOWED = new Set(['adjustment.created','adjustment.updated','transaction.completed','subscription.created','subscription.updated','subscription.activated','subscription.past_due','subscription.paused','subscription.resumed','subscription.canceled']);
export function verifySignature(raw, header, secret, now=Date.now()) {
  if(!secret) throw new HttpError(503,'sandbox_webhook_secret_not_configured');
  if(!Buffer.isBuffer(raw)||typeof header!=='string') throw new HttpError(401,'invalid_webhook_signature');
  const parts=header.split(';').map(p=>p.trim().split('='));
  const timestamps=parts.filter(([k])=>k==='ts');
  const signatures=parts.filter(([k,v])=>k==='h1'&&/^[a-fA-F0-9]{64}$/.test(v||''));
  const ts=timestamps[0]?.[1];
  if(timestamps.length!==1||!/^\d{10}$/.test(ts||'')||Math.abs(now-Number(ts)*1000)>5000||!signatures.length) throw new HttpError(401,'invalid_webhook_signature');
  const expected=createHmac('sha256',secret).update(`${ts}:`).update(raw).digest();
  if(!signatures.some(([,v])=>timingSafeEqual(expected,Buffer.from(v,'hex')))) throw new HttpError(401,'invalid_webhook_signature');
}
export function acceptEvent(db, raw, header, secret, now=Date.now()) {
  verifySignature(raw,header,secret,now);
  let event;
  try {event=JSON.parse(raw.toString('utf8'));} catch {throw new HttpError(400,'invalid_webhook_json');}
  if(!/^evt_[a-z0-9]{26}$/.test(event.event_id||'')||!Number.isFinite(Date.parse(event.occurred_at))||Date.parse(event.occurred_at)>now+5000||!event.data?.id) throw new HttpError(400,'invalid_webhook_event');
  return recordVerifiedEvent(db,event,hash(raw),now,'webhook');
}
function recordVerifiedEvent(db,event,digest,now,source) {
  const prior=db.prepare('SELECT body_hash FROM events WHERE event_id=?').get(event.event_id);
  if(prior) { if(prior.body_hash!==digest) throw new HttpError(409,'event_id_payload_conflict'); return {duplicate:true}; }
  if(!ALLOWED.has(event.event_type)) return {ignored:true};
  // Persist a lean inbox, excluding email, addresses, payment-method details and full raw bodies.
  const d=event.data;
  const data=event.event_type.startsWith('adjustment.')?{id:d.id,status:d.status,action:d.action,type:d.type,transaction_id:d.transaction_id,subscription_id:d.subscription_id,customer_id:d.customer_id,currency_code:d.currency_code,totals:{total:d.totals?.total,currency_code:d.totals?.currency_code}}:{id:d.id,status:d.status,customer_id:d.customer_id,subscription_id:d.subscription_id,currency_code:d.currency_code,collection_mode:d.collection_mode,origin:d.origin,discount_id:d.discount_id,discount:d.discount,billing_period:d.billing_period,current_billing_period:d.current_billing_period,scheduled_change:d.scheduled_change,custom_data:{sandbox_purchase_intent:d.custom_data?.sandbox_purchase_intent},items:d.items?.map(i=>({quantity:i.quantity,proration:i.proration,price:i.price})),details:{totals:d.details?.totals}};
  const lean={event_id:event.event_id,event_type:event.event_type,occurred_at:event.occurred_at,source,data};
  db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?)').run(event.event_id,event.event_type,event.occurred_at,digest,JSON.stringify(lean),now);
  return {accepted:true};
}
// Called only by the server-side sandbox API reconciler, never by a browser route.
export function recordApiSnapshot(db,eventType,data,now=Date.now()) {
  if(!['transaction.completed','subscription.updated','adjustment.updated'].includes(eventType)||!Number.isFinite(Date.parse(data.updated_at))||Date.parse(data.updated_at)>now+5000)throw new Error('invalid_api_snapshot');
  const event={event_id:'api_'+hash(eventType+JSON.stringify(data)).slice(0,32),event_type:eventType,occurred_at:data.updated_at,data};
  return recordVerifiedEvent(db,event,hash(JSON.stringify(event)),now,'sandbox-api');
}
