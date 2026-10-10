import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './tenant-fixture.mjs';
const tr = {country:'TR',language:'tr',timezone:'Europe/Istanbul',currency:'TRY',contactEmail:'owner@example.test'};
const us = {...tr,country:'US',language:'en',timezone:'America/New_York',currency:'USD'};
const denied = (promise,status) => assert.rejects(promise,e=>e.status===status);

test('company profiles remain separate, validate values and cannot change the pilot limit',async t=>{
  const {db,call,a,b}=await fixture(t);
  await call('company-profile',{method:'PUT',headers:a.headers,body:tr});
  await call('company-profile',{method:'PUT',headers:b.headers,body:us});
  db.prepare('UPDATE mrp_workspace_profiles SET member_limit=3 WHERE workspace_id=?').run(a.id);
  await call('company-profile',{method:'PUT',headers:a.headers,body:{...tr,memberLimit:99,workspaceId:b.id}});
  const pa=await (await call('company-profile',{headers:a.headers})).json();
  const pb=await (await call('company-profile',{headers:b.headers})).json();
  assert.equal(pa.profile.currency,'TRY'); assert.equal(pa.profile.memberLimit,3); assert.equal(pb.profile.currency,'USD');
  for(const invalid of [{timezone:'US/Invalid'},{currency:'FAKE'},{contactEmail:'bad'},{language:'xx'}]) await denied(call('company-profile',{method:'PUT',headers:a.headers,body:{...tr,...invalid}}),400);
});

test('pilot provisioning requires a profile and installs a three-user limit atomically',async t=>{
  const {db,call}=await fixture(t);
  const headers={Authorization:'Bearer test-only-admin'};
  await denied(call('workspaces',{method:'POST',headers,body:{workspace:'bad-pilot',name:'Bad',pilot:true}}),400);
  assert.equal(db.prepare("SELECT count(*) AS n FROM mrp_workspaces WHERE slug='bad-pilot'").get().n,0);
  const result=await call('workspaces',{method:'POST',headers,body:{workspace:'pilot-tr',name:'Turkish pilot',pilot:true,profile:tr}});
  assert.equal(result.status,201);
  assert.equal(db.prepare("SELECT member_limit FROM mrp_workspace_profiles p JOIN mrp_workspaces w ON w.id=p.workspace_id WHERE w.slug='pilot-tr'").get().member_limit,3);
});

test('member creation enforces pilot seats, hides hashes and respects roles and tenant boundaries',async t=>{
  const {db,call,a,b}=await fixture(t);
  await call('company-profile',{method:'PUT',headers:a.headers,body:tr});
  db.prepare('UPDATE mrp_workspace_profiles SET member_limit=3 WHERE workspace_id=?').run(a.id);
  const create=async username=>(await call('members',{method:'POST',headers:a.headers,body:{username,role:'OPERATOR'}})).json();
  const one=await create('operator-one'); await create('operator-two');
  await denied(create('operator-three'),409);
  await denied(create('operator-one'),409);
  assert.equal(db.prepare("SELECT count(*) AS n FROM mrp_audit_log WHERE action='member.created'").get().n,2);
  const operator={...a.headers,'X-Hamvara-User':'operator-one','X-Hamvara-Key':one.accessKey};
  assert.equal((await call('session',{headers:operator})).status,200);
  for(const path of ['members','company-profile']) await denied(call(path,{headers:operator}),403);
  await denied(call('members',{method:'POST',headers:operator,body:{username:'intruder',role:'CEO'}}),403);
  await denied(call(`members/${one.member.id}/disable`,{method:'POST',headers:b.headers}),404);
  const listing=await (await call('members',{headers:a.headers})).json();
  assert.equal(listing.members.length,3); assert.ok(!JSON.stringify(listing).includes('access_key')); assert.ok(!JSON.stringify(listing).includes(one.accessKey));
  const owner=listing.members.find(m=>m.role==='CEO');
  await denied(call(`members/${owner.id}/disable`,{method:'POST',headers:a.headers}),409);
  const scan=await (await call('scan-sessions',{method:'POST',headers:operator})).json();
  await call(`members/${one.member.id}/disable`,{method:'POST',headers:a.headers});
  await denied(call('session',{headers:operator}),401);
  assert.equal(db.prepare('SELECT status FROM mrp_scan_sessions WHERE id=?').get(scan.id).status,'CLOSED');
  await create('replacement-user');
  assert.equal(db.prepare('SELECT count(*) AS n FROM mrp_users WHERE workspace_id=? AND active=1').get(a.id).n,3);
});

test('legacy workspace data and membership policy are unchanged until explicitly configured',async t=>{
 const {call,a}=await fixture(t);
 assert.equal((await (await call('company-profile',{headers:a.headers})).json()).profile,null);
 assert.equal((await (await call('members',{headers:a.headers})).json()).memberLimit,null);
 await denied(call('members',{method:'POST',headers:a.headers,body:{username:'other-ceo',role:'CEO'}}),400);
});
