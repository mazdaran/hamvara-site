import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../../worker/package.json',import.meta.url));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const key='local-test-operator-key-at-least-32-characters';
const origin='https://hamvara.com';
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'support-test',modules:['worker.js','index.js','knowledge.js','reviewed-workflows.js'].map(name=>({type:'ESModule',path:fileURLToPath(new URL('../src/'+name,import.meta.url))})),compatibilityDate:'2026-08-01',
 durableObjects:{DESK:{className:'SupportDesk',useSQLite:true}},
 bindings:{ALLOWED_ORIGINS:origin,CHAT_OPERATORS:JSON.stringify([{id:'test',name:'Test operator',tokenHash:createHash('sha256').update(key).digest('hex')}]),CHAT_AI_ENABLED:'false',CHAT_TURNSTILE_REQUIRED:'false'}}]}));
async function call(path,{method='GET',body,token,requestOrigin=origin}={}){
 const r=await mf.dispatchFetch('https://support.test'+path,{method,headers:{Origin:requestOrigin,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 return {status:r.status,data:await r.json()};
}
async function ticket(path,token,online=false){const r=await call(path,{method:'POST',token,body:{online}});assert.equal(r.status,200,JSON.stringify(r.data));return r.data.ticket;}
async function socket(value,requestOrigin=origin){
 const r=await mf.dispatchFetch('https://support.test/events?ticket='+value,{headers:{Origin:requestOrigin,Upgrade:'websocket'}});
 if(r.status!==101)return {status:r.status};
 const ws=r.webSocket,events=[],waiters=[];
 ws.addEventListener('message',e=>{const value=e.data==='pong'?'pong':JSON.parse(e.data);events.push(value);for(const waiter of [...waiters])if(waiter.predicate(value)){waiters.splice(waiters.indexOf(waiter),1);clearTimeout(waiter.timeout);waiter.resolve(value);}});
 ws.accept();
 const wait=predicate=>{const found=events.find(predicate);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const waiter={predicate,resolve,timeout:setTimeout(()=>reject(Error('Expected event not received: '+JSON.stringify(events))),3000)};waiters.push(waiter);});};
 await wait(x=>x.type==='ready');return {status:101,ws,events,wait,clear(){events.length=0;}};
}
test('real Worker runtime: authenticated events, isolation, hibernation, presence, replies and reconnect snapshots',async()=>{
 const sockets=[];
 try{
  assert.equal((await call('/admin/events-ticket',{method:'POST',body:{}})).status,401);
  const adminTicket=await ticket('/admin/events-ticket',key,true);
  assert.equal((await socket(adminTicket,'https://evil.test')).status,403);
  const admin=await socket(adminTicket);sockets.push(admin);assert.equal(admin.status,101);
  assert.equal((await socket(adminTicket)).status,401,'ticket is single-use');
  assert.equal((await call('/status')).data.online,true);
  const a=(await call('/sessions',{method:'POST',body:{consent:true}})).data;
  await admin.wait(x=>x.type==='changed'&&x.id===a.id);
  const b=(await call('/sessions',{method:'POST',body:{consent:true}})).data;
  assert.equal((await call('/sessions/'+a.id+'/events-ticket',{method:'POST',body:{},token:b.token})).status,401);
  const visitor=await socket(await ticket('/sessions/'+a.id+'/events-ticket',a.token));sockets.push(visitor);
  const other=await socket(await ticket('/sessions/'+b.id+'/events-ticket',b.token));sockets.push(other);
  admin.clear();visitor.clear();other.clear();
  // Wait through the real hibernation idle window; attachments and sockets must survive.
  await new Promise(resolve=>setTimeout(resolve,11000));
  admin.ws.send('ping');await admin.wait(x=>x==='pong');
  assert.equal((await call('/status')).data.online,true,'auto-response presence survives hibernation');
  admin.ws.send(JSON.stringify({type:'availability',online:false}));
  await visitor.wait(x=>x.type==='presence'&&x.online===false);
  assert.equal((await call('/status')).data.online,false);
  admin.ws.send(JSON.stringify({type:'availability',online:true}));
  await visitor.wait(x=>x.type==='presence'&&x.online===true);
  assert.equal((await call('/sessions/'+a.id+'/messages',{method:'POST',token:a.token,body:{messageId:crypto.randomUUID(),text:'Local test'}})).status,200);
  await admin.wait(x=>x.type==='changed'&&x.id===a.id);await visitor.wait(x=>x.type==='changed'&&x.id===a.id);
  assert.ok(!other.events.some(x=>x.type==='changed'),'another conversation receives no event or metadata');
  await call('/admin/conversations/'+a.id+'/claim',{method:'POST',token:key,body:{}});
  visitor.clear();
  await call('/admin/conversations/'+a.id+'/reply',{method:'POST',token:key,body:{messageId:crypto.randomUUID(),text:'Reply from operator'}});
  await visitor.wait(x=>x.type==='changed');
  assert.equal((await call('/sessions/'+a.id,{token:a.token})).data.messages.at(-1).text,'Reply from operator');
  visitor.ws.close();
  await call('/admin/conversations/'+a.id+'/reply',{method:'POST',token:key,body:{messageId:crypto.randomUUID(),text:'Sent while disconnected'}});
  const resumed=await socket(await ticket('/sessions/'+a.id+'/events-ticket',a.token));sockets.push(resumed);
  assert.equal((await call('/sessions/'+a.id,{token:a.token})).data.messages.at(-1).text,'Sent while disconnected');
  await call('/admin/conversations/'+a.id+'/close',{method:'POST',token:key,body:{}});
  assert.equal((await call('/sessions/'+a.id,{token:a.token})).data.mode,'closed');
  await call('/sessions/'+a.id,{method:'DELETE',token:a.token});await resumed.wait(x=>x.type==='deleted');
  assert.equal((await call('/sessions/'+a.id+'/events-ticket',{method:'POST',token:a.token,body:{}})).status,401);
  admin.ws.close();await new Promise(resolve=>setTimeout(resolve,30));assert.equal((await call('/status')).data.online,false);
 }finally{for(const s of sockets)try{s.ws.close();}catch{}await mf.dispose();}
});
