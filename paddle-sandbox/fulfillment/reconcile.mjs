import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';
import { makePaddle } from './paddle.mjs';
import { recordApiSnapshot } from './webhooks.mjs';
import { project } from './lifecycle.mjs';
export async function reconcile(db,paddle,now=Date.now()) {
  if(!paddle)throw new Error('sandbox_api_key_not_configured');
  const subscriptionIds=new Set();let snapshots=0;
  for(const row of db.prepare("SELECT transaction_id FROM intents WHERE state='ready'").all()) {
    const txn=await paddle.getTransaction(row.transaction_id);
    if(txn.status==='completed'){recordApiSnapshot(db,'transaction.completed',txn,now);snapshots++;}
    if(txn.subscription_id)subscriptionIds.add(txn.subscription_id);
  }
  for(const row of project(db,now).entitlements)subscriptionIds.add(row.subscriptionId);
  for(const id of subscriptionIds) {
    const sub=await paddle.getSubscription(id);recordApiSnapshot(db,'subscription.updated',sub,now);snapshots++;
    let after,more=true,pages=0;
    while(more&&pages++<50) {
      const page=await paddle.listCompletedTransactions(id,after);
      for(const txn of page.data){if(txn.status==='completed'){recordApiSnapshot(db,'transaction.completed',txn,now);snapshots++;}}
      more=page.meta?.pagination?.has_more===true;
      if(more&&!page.data.length)throw new Error('sandbox_reconciliation_pagination_invalid');
      if(page.data.length)after=page.data.at(-1).id;
    }
    if(more)throw new Error('sandbox_reconciliation_page_limit');
  }
  const transactionIds=new Set(db.prepare("SELECT payload FROM events WHERE event_type='transaction.completed'").all().map(r=>JSON.parse(r.payload).data.id));
  for(const id of transactionIds){
    let after,more=true,pages=0;
    while(more&&pages++<50){
      const page=await paddle.listAdjustments(id,after);
      for(const adjustment of page.data){if(adjustment.transaction_id!==id)throw new Error('adjustment_query_mismatch');recordApiSnapshot(db,'adjustment.updated',adjustment,now);snapshots++;}
      more=page.meta?.pagination?.has_more===true;
      if(more&&(!page.data.length||page.data.at(-1).id===after))throw new Error('adjustment_pagination_invalid');
      if(page.data.length)after=page.data.at(-1).id;
    }
    if(more)throw new Error('adjustment_pagination_limit');
  }
  return {snapshots,reviewCount:project(db,now).review.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const db=openStore();
  try {
    const result=await reconcile(db,makePaddle(process.env.HAMVARA_PADDLE_SANDBOX_API_KEY));
    console.log(`Sandbox API reconciliation complete: ${result.snapshots} snapshots, ${result.reviewCount} review entries. No Paddle records changed.`);
  }catch{console.error('Reconciliation did not complete. Check the server-only sandbox API key, read permissions, and local intents. No secrets are logged.');process.exitCode=1;}
  finally{db.close();}
}
