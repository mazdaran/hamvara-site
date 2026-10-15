#!/usr/bin/env node
// Exactly five unauthenticated, read-only GETs to the FIXED staging origin.
// No credentials, mutations, retries, polling, or Cloudflare API access.
const ORIGIN='https://hamvara-pilot-staging.yahya-mazdarani.workers.dev';
async function get(path){
 const url=new URL(path,ORIGIN);
 if(url.origin!==ORIGIN)throw Error('Refusing an unexpected origin.');
 let response;
 try{
  response=await fetch(url,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{Accept:path==='/health'?'application/json':'text/html,application/javascript'}});
 }catch(error){
  const cause=error?.cause?.code||error?.cause?.name||error?.name||'unknown';
  throw Error(path+' network error ('+cause+'); a GitHub runner failure is not proof of a Cloudflare outage.');
 }
 if(response.status!==200)throw Error(path+' returned HTTP '+response.status);
 return response;
}
function check(source,marker,path){if(!source.includes(marker))throw Error(path+' does not contain expected pilot feature '+marker);}
const checks=[
 ['/mrp/','Version 0.47.0'],
 ['/mrp/mobile-receipts.html','mobile-receipts-console.js'],
 ['/mrp/mobile-receipt.html','id="receiptForm"'],
 ['/mrp/mobile-receipt-phone.mjs','signedRequest']
];
let failures=0;
try{
 const health=await (await get('/health')).json();
 if(health.ok!==true||health.environment!=='pilot-staging'||health.databaseConfigured!==true)throw Error('Staging health does not confirm the isolated pilot environment with D1.');
 console.log('PASS /health: pilot-staging with D1 binding');
}catch(error){failures++;console.error('FAIL /health:',error.message);}
for(const [path,marker] of checks){
 try{
  const page=await (await get(path)).text();
  check(page,marker,path);
  console.log('PASS '+path+': required published asset found');
 }catch(error){failures++;console.error('FAIL '+path+':',error.message);}
}
if(failures){
 console.error('STAGING RELEASE BLOCKED: '+failures+' of 5 independent read-only route checks failed. Investigate before accepting the staging release.');
 process.exitCode=1;
}else{
 console.log('PASS: public staging smoke. Not proof of deployed commit SHA, accounts, billing, hardware, or production readiness.');
}
