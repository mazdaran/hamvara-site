import { randomUUID } from 'node:crypto';
import { PLANS } from './catalog.mjs';
import { HttpError, resolveOwner } from './auth.mjs';
export async function createCheckout(db, actor, body, paddle, now=Date.now()) {
  if(!body||Object.keys(body).some(k=>!['plan','requestKey'].includes(k))) throw new HttpError(400,'only_plan_and_request_key_allowed');
  const plan=Object.hasOwn(PLANS,body.plan)?PLANS[body.plan]:null;
  if(!plan||! /^[a-zA-Z0-9-]{16,80}$/.test(body.requestKey||'')) throw new HttpError(400,'invalid_plan_or_request_key');
  const owner=resolveOwner(db,actor,plan);
  if(!paddle) throw new HttpError(503,'sandbox_api_key_not_configured');
  const existing=db.prepare('SELECT * FROM intents WHERE user_id=? AND request_key=?').get(actor.user_id,body.requestKey);
  if(existing) {
    if(existing.plan!==body.plan||existing.owner_id!==owner) throw new HttpError(409,'request_key_conflict');
    if(existing.state==='ready') return {transactionId:existing.transaction_id};
    throw new HttpError(409,'checkout_creation_pending_review');
  }
  if(db.prepare("SELECT * FROM intents WHERE owner_id=? AND state IN ('creating','review','ready')").all(owner).some(i=>PLANS[i.plan]?.product===plan.product && PLANS[i.plan]?.scope===plan.scope)) throw new HttpError(409,'uncertain_checkout_requires_review');
  const id=randomUUID();
  db.prepare('INSERT INTO intents VALUES(?,?,?,?,?,NULL,?,?)').run(id,actor.user_id,owner,body.plan,body.requestKey,'creating',now);
  try {
    const transaction=await paddle.createTransaction({items:[{price_id:plan.priceId,quantity:1}],currency_code:'USD',collection_mode:'automatic',custom_data:{sandbox_purchase_intent:id}});
    if(!/^txn_[a-z0-9]{26}$/.test(transaction.id)||!['draft','ready'].includes(transaction.status)) throw new Error('invalid_transaction');
    db.prepare("UPDATE intents SET transaction_id=?,state='ready' WHERE id=?").run(transaction.id,id);
    return {transactionId:transaction.id};
  } catch (_) {
    // A network timeout may follow successful creation. Never automatically create a replacement.
    db.prepare("UPDATE intents SET state='review' WHERE id=?").run(id);
    throw new HttpError(502,'checkout_creation_uncertain_review_required');
  }
}
