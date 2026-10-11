import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as protocol from '../../../mrp/mobile-receipt-client.mjs';
const source=readFileSync(new URL('../../../mrp/mobile-receipt-phone.mjs',import.meta.url),'utf8').replace(/^import .*;\n/,'');
function setup(){
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,hidden:false});return elements.get(id);};
 const context=vm.createContext({...protocol,document:{hidden:false,getElementById:el,addEventListener(){}},window:{addEventListener(){}},location:{hash:'',origin:'https://api.test',pathname:'/mrp/mobile-receipt.html',search:''},history:{replaceState(){}},navigator:{userAgent:'iPhone'},setInterval(){},Date});
 vm.runInContext(source,context);const run=code=>vm.runInContext(code,context);
 run("session={workspaceId:'w1',userId:'u1',warehouse:'WH-FG',status:'ACTIVE',expiresAt:new Date(Date.now()+60000).toISOString()};item={sku:'TEST',unit:'pcs'};identity={};token='test';paint()");
 for(const [id,value] of Object.entries({quantity:'2',supplier:'Supplier',reference:'IPHONE-1',date:'2026-10-11'}))el(id).value=value;
 return {context,el,run};
}
test('lost acknowledgement keeps form locked and retries exactly the same receipt',async()=>{
 const {context,el,run}=setup();const sent=[];
 context.signedRequest=async(_identity,_token,_path,payload)=>{sent.push(payload);throw Error('Network lost');};
 await run("$('receiptForm').onsubmit({preventDefault(){}})");
 assert.equal(el('fields').disabled,true);assert.equal(el('pendingPanel').hidden,false);assert.equal(el('retry').disabled,false);
 context.signedRequest=async(_identity,_token,_path,payload)=>{sent.push(payload);return {receipt:{id:'receipt-1',status:'SUBMITTED',payload},duplicate:true};};
 await run("$('retry').onclick()");assert.equal(sent.length,2);assert.equal(sent[0],sent[1]);assert.equal(el('pendingPanel').hidden,true);assert.match(el('lastReceipt').textContent,/already received/);
});
test('pending receipt cannot be sent after changing account scope',async()=>{
 const {context,el,run}=setup();context.signedRequest=async()=>{throw Error('Offline');};
 await run("$('receiptForm').onsubmit({preventDefault(){}})");
 run("session={...session,workspaceId:'w2'};paint()");assert.equal(el('retry').disabled,true);
 context.signedRequest=async()=>{assert.fail('Cross-scope request attempted');};
 await run("$('retry').onclick()");assert.match(el('message').textContent,/original company/);
});
test('changing scanned code invalidates item and failed lookup cannot submit',async()=>{
 const {context,el,run}=setup();await run("$('code').oninput()");assert.equal(el('submitReceipt').disabled,true);
 el('code').value='unknown';context.signedRequest=async()=>{throw Object.assign(Error('Unknown SKU'),{status:422});};
 await run("$('lookup').onclick()");assert.equal(el('submitReceipt').disabled,true);assert.equal(el('item').textContent,'Item not identified.');
});
