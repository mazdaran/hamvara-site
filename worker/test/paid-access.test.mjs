import test from 'node:test';
import assert from 'node:assert/strict';
import {sandboxPaidAccess} from '../src/paid-access.js';
import {enforceTrial,getTrialAccess} from '../src/trials.js';
const now=Date.now();
const decision={environment:'sandbox',companyId:'billing-company-b',product:'mrp',access:true,accessUntil:new Date(now+60000).toISOString(),maxUsers:5,checkedAt:now};
function env(d=decision,count=3){return {PILOT_STAGING:'true',MRP_BILLING_SANDBOX:'true',BILLING_ACCESS:{async companyAccess(id){assert.equal(id,'billing-company-b');return d;}},DB:{prepare(){return {bind(id){assert.equal(id,'pilot-us-workspace');return {async first(){return {count};}};}};}}};}
test('paid sandbox access enables the authenticated workspace and enforces its active user count',async()=>{
 const e=env();const access=await getTrialAccess(e.DB,'pilot-us-workspace',e);assert.equal(access.canWrite,true);
 enforceTrial(access,new Request('https://test/api/mrp/state',{method:'PUT'}),'/api/mrp/state');
 assert.equal((await sandboxPaidAccess(env(decision,6),'pilot-us-workspace',now)).canWrite,false);
});
test('unpaid or expired access denies web and mobile mutations but allows status',async()=>{
 for(const d of [{...decision,access:false},{...decision,accessUntil:new Date(now-1).toISOString()}]){
  const access=await sandboxPaidAccess(env(d),'pilot-us-workspace',now);
  for(const path of ['/api/mrp/state','/api/mrp/mobile-receipts','/api/mrp/mobile-scan/events'])assert.throws(()=>enforceTrial(access,new Request('https://test'+path,{method:'POST'}),path),e=>e.status===403);
  enforceTrial(access,new Request('https://test/api/mrp/session'),'/api/mrp/session');
 }
});
test('cross-company, wrong environment, stale result and service outage fail closed',async()=>{
 for(const d of [{...decision,companyId:'billing-company-a'},{...decision,environment:'live'},{...decision,checkedAt:now-60000}])await assert.rejects(sandboxPaidAccess(env(d),'pilot-us-workspace',now),e=>e.status===503);
 const e=env();e.BILLING_ACCESS.companyAccess=async()=>{throw Error('offline');};await assert.rejects(sandboxPaidAccess(e,'pilot-us-workspace',now),e=>e.status===503);
 e.PILOT_STAGING='false';await assert.rejects(sandboxPaidAccess(e,'pilot-us-workspace',now),e=>e.status===503);
});
test('disabled integration preserves existing trials; mapping is server-controlled',async()=>{
 assert.equal(await sandboxPaidAccess({},'pilot-tr-workspace',now),null);
 assert.equal(await sandboxPaidAccess(env(),'unmapped-workspace',now),null);
 const e=env();let requested;e.BILLING_ACCESS.companyAccess=async id=>{requested=id;return {...decision,companyId:id,access:false};};
 assert.equal((await sandboxPaidAccess(e,'pilot-tr-workspace',now)).canWrite,false);assert.equal(requested,'billing-company-a');
});
