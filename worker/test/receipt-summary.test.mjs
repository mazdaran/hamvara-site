import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readReceiptSummary, RECEIPT_SUMMARY_SQL} from '../src/receipt-summary.js';

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE mrp_mobile_receipts(id TEXT, workspace_id TEXT, status TEXT, payload_json TEXT);
    CREATE TABLE mrp_state(workspace_id TEXT, state_json TEXT);
    CREATE TABLE mrp_mobile_warehouse_grants(workspace_id TEXT,user_id TEXT,warehouse TEXT);`);
  const env = {DB: {prepare(sql) {
    assert.equal(sql, RECEIPT_SUMMARY_SQL, 'only the reviewed SELECT is executed');
    return {bind(workspace, user, role) {return {async all() {
      return {success: true, results: db.prepare(sql).all({'1':workspace,'2':user,'3':role})};
    }}}};
  }}};
  const inbox = (id,status='SUBMITTED',warehouse='WH-FG',workspace='tr') => db.prepare(
    'INSERT INTO mrp_mobile_receipts VALUES (?,?,?,?)'
  ).run(id,workspace,status,JSON.stringify({destinationWarehouse:warehouse,supplier:'PRIVATE',amount:100}));
  const state = (receipts,workspace='tr') => db.prepare('INSERT INTO mrp_state VALUES (?,?)').run(workspace,JSON.stringify({receipts}));
  const grant = (warehouse='WH-FG',workspace='tr',user='u') => db.prepare('INSERT INTO mrp_mobile_warehouse_grants VALUES (?,?,?)').run(workspace,user,warehouse);
  const actor = (role='OPERATOR',workspace='tr',user='u') => ({workspace:{id:workspace},user:{id:user,role}});
  return {db,env,inbox,state,grant,actor};
}

test('counts all submitted receipts, not only the latest 100; no database writes', async t => {
  const f=fixture(t);f.grant();f.state([]);
  for(let i=0;i<125;i++)f.inbox('pending-'+i);
  for(let i=0;i<150;i++)f.inbox('posted-'+i,'POSTED');
  f.inbox('rejected','REJECTED');
  const before=f.db.prepare('SELECT total_changes() AS n').get().n;
  const result=await readReceiptSummary(f.env,f.actor());
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{pendingCount:125,byStatus:{SUBMITTED:125}});
  assert.equal(f.db.prepare('SELECT total_changes() AS n').get().n,before);
  assert(!JSON.stringify(result).includes('PRIVATE'));
});

test('deduplicates both mobileReceiptId and MOB-id; posted inbox is authoritative', async t => {
  const f=fixture(t);f.grant();
  f.inbox('pending','PENDING_QC');f.inbox('done','POSTED');f.inbox('held','HOLD_NCR');
  f.state([
    {id:'MOB-pending',status:'PENDING_QC',targetWarehouse:'WH-FG'},
    {id:'other-id',mobileReceiptId:'done',status:'PENDING_MANAGER',targetWarehouse:'WH-FG'},
    {id:'legacy',status:'PENDING_MANAGER',targetWarehouse:'WH-FG'},
    {id:'MOB-orphan',status:'PENDING_QC',targetWarehouse:'WH-FG'},
    {id:'old-done',status:'POSTED',warehouse:'WH-FG'}
  ]);
  const result=await readReceiptSummary(f.env,f.actor());
  assert.equal(result.pendingCount,4);
  assert.equal(result.byStatus.PENDING_QC,2);
  assert.equal(result.byStatus.PENDING_MANAGER,1);
  assert.equal(result.byStatus.HOLD_NCR,1);
});

test('TR/US and per-user warehouse grants remain isolated; CEO is tenant-scoped', async t => {
  const f=fixture(t);f.grant();f.grant('WH-FG','us');
  f.inbox('tr-fg');f.inbox('tr-rm','SUBMITTED','WH-RM');
  f.inbox('us-fg','SUBMITTED','WH-FG','us');f.inbox('us-rm','SUBMITTED','WH-RM','us');
  f.state([]);f.state([],'us');
  assert.equal((await readReceiptSummary(f.env,f.actor())).pendingCount,1);
  assert.equal((await readReceiptSummary(f.env,f.actor('PRODUCTION_MANAGER'))).pendingCount,1);
  assert.equal((await readReceiptSummary(f.env,f.actor('OPERATOR','us'))).pendingCount,1);
  assert.equal((await readReceiptSummary(f.env,f.actor('CEO'))).pendingCount,2);
  assert.equal((await readReceiptSummary(f.env,f.actor('CEO','us'))).pendingCount,2);
  assert.equal((await readReceiptSummary(f.env,f.actor('OPERATOR','tr','no-grants'))).pendingCount,0);
  assert.equal((await readReceiptSummary(f.env,f.actor('CEO',"tr' OR 1=1 --"))).pendingCount,0);
});

test('legacy receipt visibility checks both source/target and destination; QA needs manager', async t => {
  const f=fixture(t);f.grant();
  f.state([
    {id:'fg',status:'PENDING_QC',warehouse:'WH-FG'},
    {id:'restricted-source',status:'PENDING_QC',sourceWarehouse:'WH-RM',destinationWarehouse:'WH-FG'},
    {id:'restricted-dest',status:'PENDING_QC',warehouse:'WH-FG',destinationWarehouse:'WH-RM'},
    {id:'qa',status:'PENDING_QC',warehouse:'WH-QA'}
  ]);
  assert.equal((await readReceiptSummary(f.env,f.actor())).pendingCount,1);
  assert.equal((await readReceiptSummary(f.env,f.actor('PRODUCTION_MANAGER'))).pendingCount,2);
  assert.equal((await readReceiptSummary(f.env,f.actor('FACTORY_MANAGER'))).pendingCount,2);
  assert.equal((await readReceiptSummary(f.env,f.actor('CEO'))).pendingCount,4);
});

test('missing identity and unsupported roles fail before querying', async () => {
  const env={DB:{prepare(){throw Error('must not query');}}};
  for (const actor of [undefined,{}, {workspace:{id:'tr'},user:{id:'u',role:'ACCOUNTING'}}]) {
    await assert.rejects(readReceiptSummary(env,actor),e=>e.status===403);
  }
});

test('empty result is zero; failed or invalid results are unavailable, not zero', async () => {
  const actor={workspace:{id:'tr'},user:{id:'u',role:'CEO'}};
  const env=result=>({DB:{prepare(){return{bind(){return{async all(){return result;}};}};}}});
  assert.equal((await readReceiptSummary(env({success:true,results:[]}),actor)).pendingCount,0);
  for(const result of [{success:false,results:[]},{},{results:[{status:'SUBMITTED',count:-1}]}]) {
    await assert.rejects(readReceiptSummary(env(result),actor),e=>e.status===503);
  }
});
