import test from 'node:test';
import assert from 'node:assert/strict';
import staging from '../src/mobile-staging.js';
const req=path=>new Request('https://mobile-staging.example'+path);
test('staging fails closed without its explicit environment flag',async()=>{assert.equal((await staging.fetch(req('/health'),{})).status,503);});
test('staging routes isolate its public API surface and reject foreign origins',async()=>{
 const env={MOBILE_STAGING:'true',DB:{},ASSETS:{fetch:async()=>new Response('asset')}};
 assert.equal((await(await staging.fetch(req('/health'),env)).json()).environment,'mobile-staging');
 for(const path of ['/api/mrp/workspaces','/api/mrp/rotate-key','/api/audit','/api/sku-bridge/analyze'])assert.equal((await staging.fetch(req(path),env)).status,404);
 assert.equal((await staging.fetch(new Request('https://mobile-staging.example/api/mrp/session',{headers:{Origin:'https://hamvara.com'}}),env)).status,403);
 assert.equal((await staging.fetch(req('/'),env)).headers.get('location'),'https://mobile-staging.example/mrp/mobile-receipts.html');
 assert.equal(await(await staging.fetch(req('/mrp/mobile-receipts.html'),env)).text(),'asset');
});
