import { isDeepStrictEqual } from 'node:util';
// Compare verified payment records without changing their persisted evidence.
function comparablePayment(data) {
  const copy=structuredClone(data);
  for(const item of copy.items||[]) {
    if(item.price?.import_meta===null)delete item.price.import_meta;
  }
  const totals=copy.details?.totals;
  // This sandbox catalog accepts USD only. Preserve any non-identity rate.
  if(copy.currency_code==='USD'&&totals?.currency_code==='USD'&&totals.exchange_rate==='1')delete totals.exchange_rate;
  return copy;
}
function sameVerifiedPayment(a,b) {
  return isDeepStrictEqual(comparablePayment(a),comparablePayment(b));
}
import { adjustmentEffects } from './adjustments.mjs';
import { PLANS, assertItem } from './catalog.mjs';
const DAY=86400000;
function period(value) {
  const start=Date.parse(value?.starts_at), end=Date.parse(value?.ends_at);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) throw new Error('billing_period_missing');
  return {start,end};
}
function validatePayment(data,plan) {
  assertItem(data,plan);
  const totals=data.details?.totals;
  if(data.status!=='completed'||data.collection_mode!=='automatic'||! /^sub_[a-z0-9]{26}$/.test(data.subscription_id||'')||! /^ctm_[a-z0-9]{26}$/.test(data.customer_id||'')||
    !totals||totals.currency_code!=='USD'||String(totals.subtotal)!==plan.amount||Number(totals.discount)!==0||Number(totals.balance)!==0||Number(totals.tax)<0||!Number.isSafeInteger(Number(totals.tax))||Number(totals.total)!==Number(plan.amount)+Number(totals.tax)) throw new Error('payment_mismatch');
  const p=period(data.billing_period),days=(p.end-p.start)/DAY;
  if(plan.interval==='month'?(days<27||days>32):(days<364||days>367)) throw new Error('unexpected_paid_period');
  return p;
}
// Pure projection from the durable, verified inbox. No browser event or email participates.
// Rebuilding on reads/restarts makes processing idempotent and independent of arrival order.
export function project(db, now=Date.now()) {
  const events=db.prepare('SELECT payload FROM events ORDER BY occurred_at,event_id').all().map(r=>JSON.parse(r.payload));
  const intents=db.prepare("SELECT * FROM intents WHERE state='ready'").all();
  const bindings=new Map(), payments=new Map(), review=[], conflictingBindings=new Set();
  const transactions=new Map();
  for(const e of events.filter(e=>e.event_type==='transaction.completed')) {
    const data=e.data, prior=transactions.get(data.id);
    if(prior && !sameVerifiedPayment(prior.data,data)) {transactions.set(data.id,{conflict:true});review.push({eventId:e.event_id,reason:'transaction_payload_conflict'});}
    else if(!prior)transactions.set(data.id,e);
  }
  // Bind only the exact initial transaction created by our authenticated server.
  for(const e of transactions.values()) {
    if(e.conflict) continue;
    const intent=intents.find(i=>i.transaction_id===e.data.id);
    if(!intent)continue;
    try {
      const plan=PLANS[intent.plan];validatePayment(e.data,plan);
      if(e.data.custom_data?.sandbox_purchase_intent!==intent.id)throw new Error('intent_reference_mismatch');
      const id=e.data.subscription_id,prior=bindings.get(id);
      if(prior && prior.intent.id!==intent.id) {conflictingBindings.add(id);throw new Error('subscription_owner_conflict');}
      bindings.set(id,{intent,customerId:e.data.customer_id});
    } catch(error){review.push({eventId:e.event_id,reason:error.message});}
  }
  for(const e of transactions.values()) {
    if(e.conflict)continue;
    const binding=bindings.get(e.data.subscription_id);
    if(!binding){review.push({eventId:e.event_id,reason:'unassigned_payment'});continue;}
    try {
      if(conflictingBindings.has(e.data.subscription_id))throw new Error('subscription_owner_conflict');
      const plan=PLANS[binding.intent.plan],p=validatePayment(e.data,plan);
      if(e.data.customer_id!==binding.customerId)throw new Error('customer_mismatch');
      if(e.data.id!==binding.intent.transaction_id && e.data.origin!=='subscription_recurring')throw new Error('unsupported_payment_origin');
      const list=payments.get(e.data.subscription_id)||[];list.push({...p,transactionId:e.data.id});payments.set(e.data.subscription_id,list);
    }catch(error){review.push({eventId:e.event_id,reason:error.message});}
  }
  const effects=adjustmentEffects(events,transactions,review);
  for(const [id,list] of payments)payments.set(id,list.filter(p=>!effects.excluded.has(p.transactionId)));
  const latest=new Map();
  for(const e of events.filter(e=>e.event_type.startsWith('subscription.'))) {
    const prior=latest.get(e.data.id),at=Date.parse(e.occurred_at);
    if(!prior||at>Date.parse(prior.occurred_at))latest.set(e.data.id,e);
    else if(at===Date.parse(prior.occurred_at)&&JSON.stringify(e.data)!==JSON.stringify(prior.data))latest.set(e.data.id,{...e,conflict:true});
  }
  const entitlements=[];
  for(const [id,binding] of bindings) {
    const intent=binding.intent, plan=PLANS[intent.plan], e=latest.get(id), paid=payments.get(id)||[];
    const paidThrough=paid.reduce((max,p)=>Math.max(max,p.end),0);
    let access=false,reason='awaiting_verified_subscription',until=paidThrough||null;
    try {
      if(conflictingBindings.has(id))throw new Error('subscription_owner_conflict');
      if(e) {
        if(e.conflict)throw new Error('subscription_timestamp_conflict');
        assertItem(e.data,plan);
        if(e.data.customer_id!==binding.customerId||e.data.collection_mode!=='automatic')throw new Error('subscription_mismatch');
        const scheduled=e.data.scheduled_change;
        if(scheduled) {
          const effective=Date.parse(scheduled.effective_at);
          if(!['cancel','pause','resume'].includes(scheduled.action)||!Number.isFinite(effective))throw new Error('scheduled_change_invalid');
          if(['cancel','pause'].includes(scheduled.action))until=Math.min(until||0,effective);
        }
        const s=e.data.status;
        if(['paused','canceled'].includes(s))reason=s;
        else if(s==='active') {
          const current=period(e.data.current_billing_period);
          access=paid.some(p=>p.start<=now&&p.end>now&&p.start<=current.start&&p.end>=current.end) && now<(until||0);
          reason=access?'paid_active':'awaiting_verified_payment_or_expired';
        } else if(s==='past_due') {
          // Only renewals with a previously verified paid period receive grace.
          until=paidThrough?paidThrough+plan.graceDays*DAY:null;
          if(scheduled&&['cancel','pause'].includes(scheduled.action))until=Math.min(until||0,Date.parse(scheduled.effective_at));
          access=Boolean(paidThrough && now<until && paid.some(p=>p.start<=now));
          reason=access?`past_due_${plan.graceDays}_day_grace`:'past_due_suspended';
        } else reason='unsupported_subscription_status';
      }
      if(!paid.length){access=false;reason='awaiting_verified_payment';}
      if(!paid.length&&effects.excluded.has(intent.transaction_id)){access=false;reason='payment_refunded';}
      if(effects.holds.has(id)){access=false;reason=effects.holds.get(id);}
      if(plan.scope==='user') {
        const u=db.prepare('SELECT active FROM users WHERE id=?').get(intent.owner_id);if(!u?.active){access=false;reason='test_identity_inactive';}
      } else {
        const c=db.prepare('SELECT active FROM companies WHERE id=?').get(intent.owner_id);if(!c?.active){access=false;reason='test_company_inactive';}
        const count=db.prepare('SELECT COUNT(*) AS n FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? AND u.active=1').get(intent.owner_id).n;
        if(count>plan.limits.users){access=false;reason='company_test_user_limit_exceeded';}
      }
    }catch(error){access=false;reason=error.message;review.push({eventId:e?.event_id,reason});}
    entitlements.push({product:plan.product,ownerId:intent.owner_id,scope:plan.scope,subscriptionId:id,access,reason,paidThrough:paidThrough?new Date(paidThrough).toISOString():null,accessUntil:until?new Date(until).toISOString():null,limits:{...plan.limits}});
  }
  return {entitlements,review};
}
export function forActor(db,actor,now=Date.now()) {
  const companies=db.prepare('SELECT company_id FROM memberships WHERE user_id=?').all(actor.user_id).map(r=>r.company_id);
  return project(db,now).entitlements.filter(e=>e.scope==='user'?e.ownerId===actor.user_id:companies.includes(e.ownerId));
}
