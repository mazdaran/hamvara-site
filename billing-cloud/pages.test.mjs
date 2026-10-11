import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {billingJS,payJS,page} from './pages.mjs';
test('billing UI keeps key in memory, opens isolated payment page and never grants on browser checkout events',async()=>{
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:true,textContent:'',replaceChildren(...children){this.children=children;}});return nodes.get(id);};
 const calls=[];const key='hbc_'+'a'.repeat(64),txn='txn_'+'1'.repeat(26);
 const document={getElementById:node,createElement:()=>({})};
 vm.runInNewContext(billingJS,{document,crypto:{randomUUID:()=> 'request-key-12345678'},location:{reload(){}},fetch:async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>path.endsWith('checkout')?{transactionId:txn}:{user:{name:'Owner A'},plans:[{key:'mrpAnnual',name:'Hamvara MRP',amount:59000,interval:'year'}],entitlements:[],checkouts:[]}};}});
 node('key').value=key;await node('login').onsubmit({preventDefault(){}});
 assert.equal(node('key').value,'');assert.equal(calls.length,1);assert.equal(node('purchase').hidden,false);assert.equal(calls[0].options.headers.Authorization,'Bearer '+key);
 node('plan').value='mrpAnnual';await node('buy').onclick();assert.equal(node('pay').href,'/pay?transaction_id='+txn);assert.doesNotMatch(node('pay').href,/hbc_/);assert.equal(node('pay').hidden,false);
 assert.deepEqual(JSON.parse(calls[1].options.body),{plan:'mrpAnnual',requestKey:'request-key-12345678'});assert.equal(node('status').textContent,'No verified paid subscription yet.');
 new vm.Script(payJS);const html=await page('/billing').text();assert.doesNotMatch(html,/cdn.paddle.com/);assert.match(html,/\[hidden\]/);
});
