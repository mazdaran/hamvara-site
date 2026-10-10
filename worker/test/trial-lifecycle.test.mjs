import test from 'node:test';
import assert from 'node:assert/strict';
import {trialAccess} from '../src/trials.js';
import {fixture} from './tenant-fixture.mjs';
const DAY=86400000, admin={Authorization:'Bearer test-only-admin'};
const profile={country:'TR',language:'tr',timezone:'Europe/Istanbul',currency:'TRY',contactEmail:'owner@example.test'};
const denied=(p,status)=>assert.rejects(p,e=>e.status===status);
async function pilot(t){
 const f=await fixture(t);
 const result=await (await f.call('workspaces',{method:'POST',headers:admin,body:{workspace:'pilot-one',name:'Pilot',pilot:true,profile}})).json();
 const headers={'X-Hamvara-Workspace':'pilot-one','X-Hamvara-User':'owner','X-Hamvara-Key':result.accessKey};
 const session=await (await f.call('session',{headers})).json();
 return {...f,headers,id:session.workspace.id};
}
function setTimes(f,start){f.db.prepare('UPDATE mrp_trials SET starts_at=?,ends_at=?,read_until=?,activated_at=? WHERE workspace_id=?').run(start,start+30*DAY,start+44*DAY,start,f.id);}

test('exact server boundaries: scheduled, active, grace and expired',()=>{
 const start=2000000000000,row={plan_version:'pilot-30d-v1',starts_at:start,ends_at:start+30*DAY,read_until:start+44*DAY};
 for(const [now,status,read,write] of [[start-1,'SCHEDULED',false,false],[start,'ACTIVE',true,true],[row.ends_at-1,'ACTIVE',true,true],[row.ends_at,'GRACE',true,false],[row.read_until-1,'GRACE',true,false],[row.read_until,'EXPIRED',false,false]]){
  const actual=trialAccess(row,now);assert.equal(actual.status,status);assert.equal(actual.canRead,read);assert.equal(actual.canWrite,write);
 }
 assert.equal(trialAccess(null).status,'LEGACY');
 assert.throws(()=>trialAccess({...row,ends_at:1}),e=>e.status===503);
});

test('prepared pilot has no ticking clock; activation is admin-only and requires readiness and agreement',async t=>{
 const f=await pilot(t),{call,headers}=f;
 const before=await (await call('trial',{headers})).json();assert.equal(before.trial.status,'PREPARED');assert.equal(before.trial.startsAt,null);
 await denied(call('state',{headers}),403);
 await denied(call('state',{method:'PUT',headers,body:{}}),403);
 await denied(call('workspaces/pilot-one/trial/activate',{method:'POST',headers,body:{ready:true,customerAgreed:true}}),401);
 await denied(call('workspaces/pilot-one/trial/activate',{method:'POST',headers:admin,body:{ready:true}}),400);
 await call('members',{method:'POST',headers,body:{username:'first-operator',role:'OPERATOR'}});
 const active=await (await call('workspaces/pilot-one/trial/activate',{method:'POST',headers:admin,body:{ready:true,customerAgreed:true}})).json();
 assert.equal(active.trial.status,'ACTIVE');assert.equal(active.trial.endsAt-active.trial.startsAt,30*DAY);
 const retry=await (await call('workspaces/pilot-one/trial/activate',{method:'POST',headers:admin,body:{ready:true,customerAgreed:true}})).json();
 assert.equal(retry.trial.startsAt,active.trial.startsAt);
 assert.equal(f.db.prepare("SELECT count(*) AS n FROM mrp_audit_log WHERE action='trial.activated'").get().n,1);
 await denied(call('workspaces/pilot-one/trial/activate',{method:'POST',headers:admin,body:{ready:true,customerAgreed:true,startsAt:new Date(Date.now()+DAY).toISOString()}}),409);
 assert.equal((await call('state',{headers})).status,200);
 assert.equal((await call('scan-sessions',{method:'POST',headers})).status,201);
});

test('explicit UTC scheduling rejects malformed dates/backdating and stays closed before start',async t=>{
 const {call,headers}=await pilot(t);
 for(const startsAt of ['yesterday','2026-10-10',0,new Date(Date.now()-DAY).toISOString(),new Date(Date.now()+91*DAY).toISOString()])await denied(call('workspaces/pilot-one/trial/activate',{method:'POST',headers:admin,body:{ready:true,customerAgreed:true,startsAt}}),400);
 const startsAt=new Date(Date.now()+DAY).toISOString();
 const result=await (await call('workspaces/pilot-one/trial/activate',{method:'POST',headers:admin,body:{ready:true,customerAgreed:true,startsAt}})).json();
 assert.equal(result.trial.status,'SCHEDULED');
 await denied(call('scan-sessions',{method:'POST',headers}),403);
});

test('grace blocks all mutation paths, including an already-paired phone, while retaining saved data',async t=>{
 const f=await pilot(t);setTimes(f,Date.now()-DAY);
 f.db.prepare('UPDATE mrp_state SET state_json=? WHERE workspace_id=?').run(JSON.stringify({companyMarker:'saved-pilot-data'}),f.id);
 const scan=await (await f.call('scan-sessions',{method:'POST',headers:f.headers})).json();
 const phone={'X-Hamvara-Scan-Token':scan.token,'X-Hamvara-Scan-Device':'phone-device-0001'};
 await f.call('mobile-scan/events',{method:'POST',headers:phone,body:{code:'before-expiry'}});
 setTimes(f,Date.now()-31*DAY);
 for(const [path,method,body] of [['state','PUT',{}],['scan-sessions','POST',{}],['backups','POST',{}],['waybill/analyze','POST',{}],['members','POST',{username:'late-user',role:'OPERATOR'}],['company-profile','PUT',profile]])await denied(f.call(path,{method,headers:f.headers,body}),403);
 await denied(f.call('mobile-scan/events',{method:'POST',headers:phone,body:{code:'after-expiry'}}),403);
 assert.equal((await f.call('mobile-scan/session',{headers:phone})).status,200);
 const read=await (await f.call('state',{headers:f.headers})).json();assert.equal(read.state.companyMarker,'saved-pilot-data');assert.equal(read.trial.status,'GRACE');
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM mrp_scan_events').get().n,1);
 await f.call(`scan-sessions/${scan.id}/close`,{method:'POST',headers:f.headers});
});

test('expired denies data access but keeps status, never deletes data or resets the trial',async t=>{
 const f=await pilot(t);setTimes(f,Date.now()-45*DAY);
 f.db.prepare('UPDATE mrp_state SET state_json=? WHERE workspace_id=?').run('{"kept":true}',f.id);
 assert.equal((await (await f.call('session',{headers:f.headers})).json()).trial.status,'EXPIRED');
 await denied(f.call('state',{headers:f.headers}),403);
 const result=await (await f.call('workspaces/pilot-one/trial/activate',{method:'POST',headers:admin,body:{ready:true,customerAgreed:true}})).json();assert.equal(result.trial.status,'EXPIRED');
 assert.equal(f.db.prepare('SELECT state_json FROM mrp_state WHERE workspace_id=?').get(f.id).state_json,'{"kept":true}');
 assert.equal((await f.call('state',{headers:f.a.headers})).status,200);
});

test('a client cannot change its trial through profile/state data or request headers',async t=>{
 const f=await pilot(t);setTimes(f,Date.now()-31*DAY);
 await denied(f.call('state',{method:'PUT',headers:{...f.headers,'X-Trial-Status':'ACTIVE','X-Server-Time':'0'},body:{trial:{endsAt:9999999999999}}}),403);
 assert.equal((await (await f.call('trial',{headers:f.headers})).json()).trial.status,'GRACE');
});
