#!/usr/bin/env node
// Five unauthenticated, read-only GETs to the FIXED isolated staging origin.
// No credentials, mutations, retries, polling, or Cloudflare API access.
const ORIGIN='https://hamvara-pilot-staging.yahya-mazdarani.workers.dev';
async function get(path){
 const url=new URL(path,ORIGIN);
 if(url.origin!==ORIGIN)throw Error('Refusing an unexpected origin.');
 const response=await fetch(url,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{Accept:path==='/health'?'application/json':'text/html,application/javascript'}});
 if(response.status!==200)throw Error(path+' returned HTTP '+response.status);
 return response;
}
function check(source,marker,path){if(!source.includes(marker))throw Error(path+' does not contain expected pilot feature '+marker);}
try{
 const health=await (await get('/health')).json();
 if(health.ok!==true||health.environment!=='pilot-staging'||health.databaseConfigured!==true)throw Error('Staging health does not confirm the isolated pilot environment with D1.');
 console.log('PASS /health: pilot-staging with D1 binding');
 const routes=[
  ['/mrp/','Version 0.47.0'],
  ['/mrp/mobile-receipts.html','mobile-receipts-console.js'],
  ['/mrp/mobile-receipt.html','id="receiptForm"'],
  ['/mrp/mobile-receipt-phone.mjs','signedRequest']
 ];
 for(const [path,marker] of routes){
  const page=await (await get(path)).text();
  check(page,marker,path);
  console.log('PASS '+path+': required published asset found');
 }
 console.log('PASS: read-only public staging smoke. This does not prove release SHA, account access, billing, scanner hardware, or production readiness.');
}catch(error){console.error('STAGING RELEASE BLOCKED:',error.message);process.exitCode=1;}
