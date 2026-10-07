// Local sandbox access policy. Only verified transaction IDs establish ownership.
const actions=new Set(['refund','credit','chargeback','chargeback_warning','chargeback_reverse','chargeback_warning_reverse','credit_reverse']);
const states=new Set(['pending_approval','approved','rejected','reversed']);
const money=v=>typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v));
export function adjustmentEffects(events,transactions,review) {
  const groups=new Map(),excluded=new Set(),holds=new Map(),refunds=new Map();
  for(const e of events.filter(e=>e.event_type.startsWith('adjustment.'))){
    const list=groups.get(e.data.id)||[];list.push(e);groups.set(e.data.id,list);
  }
  for(const history of groups.values()){
    history.sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at));
    const e=history.at(-1),d=e.data,txn=transactions.get(d.transaction_id)?.data;
    const fail=reason=>{review.push({eventId:e.event_id,reason});for(const h of history){const t=transactions.get(h.data.transaction_id)?.data;if(t)holds.set(t.subscription_id,reason);}};
    if(!txn){fail('unassigned_adjustment');continue;}
    const identity=h=>JSON.stringify([h.id,h.transaction_id,h.subscription_id,h.customer_id,h.currency_code,h.action]);
    if(history.some(h=>identity(h.data)!==identity(d))||history.some(h=>h!==e&&Date.parse(h.occurred_at)===Date.parse(e.occurred_at)&&JSON.stringify(h.data)!==JSON.stringify(d))){fail('adjustment_conflict');continue;}
    if(!/^adj_[a-z0-9]{26}$/.test(d.id)||d.subscription_id!==txn.subscription_id||d.customer_id!==txn.customer_id||d.currency_code!==txn.currency_code||!actions.has(d.action)||!states.has(d.status)) {fail('adjustment_mismatch');continue;}
    // A final approved refund cannot be undone by an invalid pending/rejected update.
    if(d.action==='refund'&&history.some(h=>h.data.status==='approved')&&d.status!=='approved'){fail('refund_state_conflict');continue;}
    if(['pending_approval','rejected'].includes(d.status))continue;
    if(d.status==='reversed'){
      if(!['chargeback','chargeback_warning','credit'].includes(d.action))fail('unsupported_adjustment_reversal');
      continue;
    }
    if(d.action.endsWith('_reverse')){
      // A standalone reverse record must not clear another adjustment's hold.
      review.push({eventId:e.event_id,reason:'reversal_requires_original_status'});continue;
    }
    if(['chargeback','chargeback_warning'].includes(d.action)){holds.set(txn.subscription_id,'payment_dispute');continue;}
    if(d.action==='credit'){fail('credit_requires_review');continue;}
    if(!['full','partial',null].includes(d.type)||!money(d.totals?.total)||d.totals.currency_code!==txn.currency_code||Number(d.totals.total)>Number(txn.details?.totals?.total)) {fail('adjustment_amount_invalid');continue;}
    const amount=Number(d.totals.total),total=Number(txn.details.totals.total);
    if(d.type==='full'&&amount!==total){fail('adjustment_amount_invalid');continue;}
    const sum=(refunds.get(txn.id)||0)+amount;
    if(!Number.isSafeInteger(sum)||sum>total){fail('adjustment_amount_invalid');continue;}
    refunds.set(txn.id,sum);
    if(sum===total)excluded.add(txn.id);
  }
  return {excluded,holds};
}
