#!/usr/bin/env node
// Five unauthenticated read-only route checks on the fixed staging host.
// At most one same-origin canonical-HTML redirect per route. No credentials,
// writes, timers or background polling.
const ORIGIN='https://hamvara-pilot-staging.yahya-mazdarani.workers.dev';
async function get(path){
 let url=new URL(path,ORIGIN);
 if(url.origin!==ORIGIN)throw Error('Refusing an unexpected origin.');
 for(let hop=0;hop<2;hop++){
  let response;
  try{response=await fetch(url,{method:'GET',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{Accept:path==='/health'?'application/json':'text/html,application/javascript'}});}
  catch(error){const cause=error?.cause?.code||error?.cause?.message||error?.name||'unknown';throw Error(path+' fetch network error ('+cause+').');}
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');
   if(!location||hop>0)throw Error(path+' returned excessive or incomplete redirects.');
   const next=new URL(location,url);
   if(next.origin!==ORIGIN||!next.pathname.startsWith('/mrp/'))throw Error(path+' tried to redirect outside the fixed MRP staging origin.');
   console.log('NOTE '+path+': same-origin canonical redirect '+response.status+' to '+next.pathname);
   url=next;
   continue;
  }
  if(response.status!==200)throw Error(path+' returned HTTP '+response.status);
  return response;
 }
 throw Error(path+' failed redirect verification.');
}
function check(source,marker,path){if(!source.includes(marker))throw Error(path+' did not contain '+marker);}
const checks=[
 ['/mrp/','Version 0.47.0'],
 ['/mrp/mobile-receipts.html','mobile-receipts-console.js'],
 ['/mrp/mobile-receipt.html','id="receiptForm"'],
 ['/mrp/mobile-receipt-phone.mjs','signedRequest']
];
let failures=0;
try{
 const health=await (await get('/health')).json();
 if(health.ok!==true||health.environment!=='pilot-staging'||health.databaseConfigured!==true)throw Error('Not the isolated D1-backed pilot.');
 console.log('PASS /health: pilot-staging with D1 binding');
}catch(error){failures++;console.error('FAIL /health:',error.message);}
for(const [path,marker] of checks){
 try{const page=await (await get(path)).text();check(page,marker,path);console.log('PASS '+path);}
 catch(error){failures++;console.error('FAIL '+path+':',error.message);}
}
if(failures){console.error('STAGING RELEASE BLOCKED: '+failures+' of five read-only route checks failed.');process.exitCode=1;}
else console.log('PASS: public pilot routes; deployment SHA, private accounts, phones and billing still need independent proof.');
