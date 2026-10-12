import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../../mrp/mobile-receipts-console.js',import.meta.url),'utf8');
function setup(){
 const elements=new Map();
 const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',className:'',hidden:false,replaceChildren(){},append(){},addEventListener(){}});return elements.get(id);};
 const ctx=vm.createContext({location:{hash:''},navigator:{},document:{querySelectorAll:()=>[],hidden:false,getElementById:el,createElement:()=>({append(){}})},window:{addEventListener(){}},Date,setInterval,clearInterval,fetch:async()=>({ok:true,json:async()=>({receipts:[]})})});
 vm.runInContext(source,ctx);vm.runInContext('credentials={};',ctx);return {ctx,el,run:s=>vm.runInContext(s,ctx)};
}
test('successful refresh clears sync errors but preserves action errors',async()=>{
 const {run,el}=setup();run("message('Approval denied',true);syncMessage('Failed to fetch',true)");await run('refresh()');
 assert.equal(el('syncStatus').className,'muted');assert.match(el('syncStatus').textContent,/Receipts updated/);assert.equal(el('message').textContent,'Approval denied');
});
test('manual refresh failure preserves rows and reports stale data',async()=>{
 const {ctx,run,el}=setup();let cleared=false;el('receipts').replaceChildren=()=>{cleared=true;};ctx.fetch=async()=>{throw Error('Failed to fetch');};
 await run("$('refresh').onclick()");assert.equal(cleared,false);assert.equal(el('syncStatus').className,'error');assert.match(el('syncStatus').textContent,/out of date/);
});
test('late pairing response cannot undo disconnect',async()=>{
 const {ctx,run,el}=setup();let resolve;ctx.fetch=()=>new Promise(r=>{resolve=r;});run("pairing={id:'old',claimUntil:Date.now()+60000}");const pending=run('poll()');
 run("pairing=null;$('pairStatus').textContent='Device disconnected.'");ctx.fetch=async()=>({ok:true,json:async()=>({receipts:[]})});resolve({ok:true,json:async()=>({claimed:true,approved:true,expiresAt:Date.now()+60000})});await pending;
 assert.equal(el('pairStatus').textContent,'Device disconnected.');
});
test('hidden tabs do not poll',async()=>{const {ctx,run}=setup();ctx.document.hidden=true;ctx.fetch=()=>{throw Error('must not fetch');};await run('poll()');});
