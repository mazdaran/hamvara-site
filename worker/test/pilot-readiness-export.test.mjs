import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectPilots,exportReadiness,PILOT_ORIGIN} from '../scripts/export-pilot-readiness.mjs';
const credentials=()=>({databaseId:'873e4f9d-df81-4a3a-bfda-86491e729ae8',adminToken:'NEVER_EXPORT_ADMIN',companies:['pilot-tr','pilot-us'].map((workspace,i)=>({workspace,users:['owner','operator','manager'].map((username,j)=>({username,role:['CEO','OPERATOR','PRODUCTION_MANAGER'][j],accessKey:String(i*3+j+1).repeat(43)}))}))});
function fake(c,{badHealth=false,badIdentity=false,allowForeign=false}={}){
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});assert.equal(new URL(url).origin,PILOT_ORIGIN);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  const reply=(data,status=200)=>Response.json(data,{status}),path=new URL(url).pathname;
  if(path==='/health'){assert.deepEqual(options.headers,{});return reply({ok:true,environment:badHealth?'production':'pilot-staging',databaseConfigured:true});}
  const h=options.headers,company=c.companies.find(v=>v.workspace===h['X-Hamvara-Workspace']),user=company.users.find(u=>u.accessKey===h['X-Hamvara-Key']);
  if(!user)return reply({},allowForeign?200:401);
  const blocked=company.workspace==='pilot-tr';
  if(path.endsWith('/session'))return reply({workspace:{slug:company.workspace,id:company.workspace+'-workspace'},user:{username:user.username,role:badIdentity?'ACCOUNTING':user.role},trial:{status:blocked?'SUBSCRIPTION_REQUIRED':'ACTIVE',source:'paddle_sandbox',canRead:!blocked,canWrite:!blocked},capabilities:{serverReceipts:true},unexpectedSecret:'NEVER_EXPORT_SERVER'});
  if(blocked)return reply({},403);
  if(path.endsWith('/bootstrap'))return reply({warehouses:[{code:'WH-FG'}]});
  if(path.endsWith('/company-profile'))return reply({profile:{country:'US',language:'en',currency:'USD',timezone:'America/New_York',contactEmail:'internal@example.invalid',memberLimit:3}});
  if(path.endsWith('/members'))return reply({memberLimit:3,members:company.users.map(u=>({...u,active:1}))});
  assert.fail(path);
 };
 return {fetcher,calls};
}
test('audits six users read-only and distinguishes blocked TR from sandbox US',async()=>{
 const c=credentials(),f=fake(c),report=await inspectPilots(c,f.fetcher);
 assert.equal(report.companies[0].access.status,'SUBSCRIPTION_REQUIRED');assert.equal(report.companies[0].internalOperationalReady,false);
 assert.equal(report.companies[1].internalOperationalReady,true);assert.ok(report.companies.every(x=>!x.customerReady&&x.users.length===3));
 const serialized=JSON.stringify(report);for(const key of c.companies.flatMap(x=>x.users.map(u=>u.accessKey)).concat(['NEVER_EXPORT_ADMIN','NEVER_EXPORT_SERVER']))assert.ok(!serialized.includes(key));
});
test('rejects wrong database before network and non-staging health before credentials',async()=>{
 const c=credentials();await assert.rejects(inspectPilots({...c,databaseId:'production'},()=>assert.fail('network')),/database/);
 const f=fake(c,{badHealth:true});await assert.rejects(inspectPilots(c,f.fetcher),/health/);assert.equal(f.calls.length,1);
});
test('rejects identity mismatch and cross-company acceptance',async()=>{
 const c=credentials();await assert.rejects(inspectPilots(c,fake(c,{badIdentity:true}).fetcher),/Identity/);await assert.rejects(inspectPilots(c,fake(c,{allowForeign:true}).fetcher),/isolation/);
});
test('transport errors cannot echo credential values',async()=>{
 await assert.rejects(inspectPilots(credentials(),()=>{throw Error('SECRET');}),e=>!e.message.includes('SECRET'));
});
test('exports separate company files using existing keys without admin secrets or overwriting old exports',async()=>{
 const c=credentials(),report=await inspectPilots(c,fake(c).fetcher),dir=await mkdtemp(join(tmpdir(),'pilot-readiness-test-'));
 try{
  const a=await exportReadiness(c,report,dir),b=await exportReadiness(c,report,dir);assert.notEqual(a,b);
  const tr=await readFile(join(a,'pilot-tr-access.txt'),'utf8'),us=await readFile(join(a,'pilot-us-access.txt'),'utf8');
  for(const u of c.companies[0].users){assert.ok(tr.includes(u.accessKey));assert.ok(!us.includes(u.accessKey));}
  for(const u of c.companies[1].users){assert.ok(us.includes(u.accessKey));assert.ok(!tr.includes(u.accessKey));}
  assert.ok(!tr.includes(c.adminToken));assert.match(tr,/INTERNAL TEST/);assert.match(tr,/SUBSCRIPTION_REQUIRED/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
