import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker,{SupportDesk,hash,retrieve} from '../src/index.js';
const key='test-operator-key-at-least-32-characters',key2='another-test-operator-key-32-characters';
async function setup(extra={}){const db=new DatabaseSync(':memory:');const sql={exec(q,...b){if(!b.length&&q.includes('CREATE TABLE')){db.exec(q);return [];}return db.prepare(q).all(...b);}};const env={CHAT_OPERATORS:JSON.stringify([{id:'yahya',name:'Team',tokenHash:await hash(key)},{id:'other',name:'Team 2',tokenHash:await hash(key2)}]),...extra};const desk=new SupportDesk({storage:{sql,setAlarm:async()=>{}}},env);return{desk,db,env};}
async function call(desk,path,method='GET',b,secret,ip='test'){const r=await desk.fetch(new Request('https://test'+path,{method,headers:{'X-Support-IP':ip,...(b?{'Content-Type':'application/json'}:{}),...(secret?{Authorization:'Bearer '+secret}:{})},body:b?JSON.stringify(b):undefined}));return {status:r.status,data:await r.json()};}
async function start(desk,ai=false){const r=await call(desk,'/sessions','POST',{lang:'en',consent:true,aiConsent:ai});assert.equal(r.status,201);return r.data;}
test('consent, session isolation, stable retries, handoff, ownership and deletion',async()=>{const {desk}=await setup();assert.equal((await call(desk,'/sessions','POST',{lang:'en'})).status,400);const a=await start(desk),b=await start(desk);assert.equal((await call(desk,'/sessions/'+a.id,'GET',null,b.token)).status,401);assert.equal((await call(desk,'/admin/conversations')).status,401);
 const message={messageId:crypto.randomUUID(),text:'<img src=x onerror=alert(1)>'};let r=await call(desk,'/sessions/'+a.id+'/messages','POST',message,a.token);assert.equal(r.data.messages[0].text,message.text);r=await call(desk,'/sessions/'+a.id+'/messages','POST',message,a.token);assert.equal(r.data.messages.length,1);
 assert.equal((await call(desk,'/admin/conversations/'+a.id+'/claim','POST',{},key)).data.mode,'human');assert.equal((await call(desk,'/admin/conversations/'+a.id+'/claim','POST',{},key2)).status,409);
 r=await call(desk,'/admin/conversations/'+a.id+'/reply','POST',{text:'Hello',messageId:crypto.randomUUID()},key);assert.equal(r.data.messages.at(-1).role,'operator');assert.equal((await call(desk,'/sessions/'+a.id+'/handoff','POST',{},a.token)).data.mode,'human');
 await call(desk,'/admin/conversations/'+a.id+'/close','POST',{},key);assert.equal((await call(desk,'/sessions/'+a.id+'/messages','POST',{text:'x',messageId:crypto.randomUUID()},a.token)).status,409);
 assert.equal((await call(desk,'/sessions/'+a.id+'/handoff','POST',{},a.token)).status,409);
 await call(desk,'/sessions/'+a.id,'DELETE',null,a.token);assert.equal((await call(desk,'/sessions/'+a.id,'GET',null,a.token)).status,401);
});
test('presence expiry, retention, body limits and session quota',async()=>{const {desk,db}=await setup();await call(desk,'/admin/presence','POST',{online:true},key);assert.equal((await call(desk,'/status')).data.online,true);db.exec('UPDATE presence SET at=1');assert.equal((await call(desk,'/status')).data.online,false);const s=await start(desk);db.exec('UPDATE conversations SET created=1');await call(desk,'/status');assert.equal(db.prepare('SELECT COUNT(*) n FROM conversations').get().n,0);for(let i=0;i<4;i++)await start(desk);assert.equal((await call(desk,'/sessions','POST',{consent:true})).status,429);assert.equal((await call(desk,'/sessions','POST',{x:'x'.repeat(13000)})).status,413);});
test('AI uses only guide context, rejects invented citations, enforces quota and human takeover',async()=>{const {desk}=await setup({CHAT_AI_ENABLED:'true',OPENAI_API_KEY:'test',CHAT_MODEL:'configured-model',CHAT_DAILY_AI_LIMIT:'1'});const s=await start(desk,true);const old=globalThis.fetch;let complete;globalThis.fetch=async(_url,opts)=>{const payload=JSON.parse(opts.body);assert.equal(payload.store,false);assert.equal(payload.tools,undefined);assert.ok(!opts.body.includes(key));return new Promise(resolve=>{complete=()=>resolve(new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'A guide answer',sourceIds:[JSON.parse(payload.input).excerpts[0].id],handoff:false})}]}]})));});};
 try{const pending=call(desk,'/sessions/'+s.id+'/messages','POST',{text:'How do I save a BOM?',messageId:crypto.randomUUID()},s.token);while(!complete)await new Promise(r=>setTimeout(r,1));await call(desk,'/admin/conversations/'+s.id+'/claim','POST',{},key);complete();const r=await pending;assert.equal(r.data.mode,'human');assert.equal(r.data.messages.length,1);
 globalThis.fetch=async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'Wrong',sourceIds:['fake'],handoff:false})}]}]}));await assert.rejects(desk.answer('BOM',retrieve('BOM','en'),'en'));
 const b=await start(desk,true);const limited=await call(desk,'/sessions/'+b.id+'/messages','POST',{text:'How do I save a BOM?',messageId:crypto.randomUUID()},b.token);assert.equal(limited.data.mode,'queued');assert.equal(limited.data.messages.length,1);
 }finally{globalThis.fetch=old;}
});
test('pricing escalates without a model call and AI disabled is honest',async()=>{const {desk}=await setup({CHAT_AI_ENABLED:'true',OPENAI_API_KEY:'test',CHAT_MODEL:'configured-model'});const s=await start(desk,true);const r=await call(desk,'/sessions/'+s.id+'/messages','POST',{text:'What is your price for MRP?',messageId:crypto.randomUUID()},s.token);assert.equal(r.data.mode,'queued');assert.equal(r.data.messages.length,1);const {desk:off}=await setup();assert.equal((await start(off,true)).mode,'queued');});
test('origin rejection and credential-free preflight',async()=>{const env={ALLOWED_ORIGINS:'https://hamvara.com'};assert.equal((await worker.fetch(new Request('https://api/status',{headers:{Origin:'https://evil.test'}}),env)).status,403);const r=await worker.fetch(new Request('https://api/status',{method:'OPTIONS',headers:{Origin:'https://hamvara.com'}}),env);assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://hamvara.com');});

test('successful AI response has validated guide links and no cross-chat history',async()=>{const {desk}=await setup({CHAT_AI_ENABLED:'true',OPENAI_API_KEY:'test',CHAT_MODEL:'configured-model'});const s=await start(desk,true),old=globalThis.fetch;globalThis.fetch=async(url,opts)=>{const payload=JSON.parse(opts.body),input=JSON.parse(payload.input);assert.equal(url,'https://api.openai.com/v1/responses');assert.deepEqual(Object.keys(input),['question','excerpts']);return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'Use the BOM guide.',sourceIds:[input.excerpts[0].id],handoff:false})}]}]}));};try{const r=await call(desk,'/sessions/'+s.id+'/messages','POST',{text:'How do I save BOM?',messageId:crypto.randomUUID()},s.token);assert.equal(r.data.messages.at(-1).role,'assistant');assert.ok(r.data.messages.at(-1).sources[0].url.startsWith('https://hamvara.com/guides/'));assert.equal(r.data.pending,false);}finally{globalThis.fetch=old;}});

test('beginner import questions retain the complete ordered SKU workflow in each language',()=>{
 const questions={fa:'من تازه کارم. چطور فایل CSV کالاهایم را در SKU Bridge وارد کنم و خطاهای آن را بررسی کنم؟',en:'I am a beginner. How do I import a CSV into SKU Bridge and review errors?',tr:'SKU Bridge CSV dosyamı nasıl yüklerim ve hataları kontrol ederim?'};
 for(const [lang,q] of Object.entries(questions)){
  const chunks=retrieve(q,lang);
  assert.deepEqual(chunks.map(k=>k.id),['prepare','load','mapping','review','correct','export'].map(id=>`${lang}-sku-bridge-${id}`));
  const context=chunks.map(k=>k.text).join('\n');
  for(const label of ['Analyze data','Data quality report','Recheck corrections','USE','Download approved rows'])assert.ok(context.includes(label),`${lang}: ${label}`);
 }
});
test('MRP questions retain saving, actual-stock caveats and receipt approval prerequisites',()=>{
 for(const lang of ['fa','en','tr']){
  const chunks=retrieve('Hamvara MRP SaaS opening stock Goods Receipt',lang);
  for(const id of ['save','items','opening','receipt'])assert.ok(chunks.some(k=>k.id===`${lang}-mrp-saas-${id}`));
  assert.ok(chunks.every(k=>k.lang===lang&&!k.id.includes('sku-bridge')));
  const context=chunks.map(k=>k.text).join('\n');
  for(const label of ['Cloud saved','Reserved','Submit for QC','Apply decision','Manager approve'])assert.ok(context.includes(label));
 }
 assert.deepEqual(retrieve('zzqxvzzqxv','fa'),[]);
});
test('provider receives the missing SKU analysis and correction chapters',async()=>{
 const {desk}=await setup(),old=globalThis.fetch;
 globalThis.fetch=async(_url,opts)=>{
  const payload=JSON.parse(opts.body),excerpts=JSON.parse(payload.input).excerpts;
  assert.ok(excerpts.some(k=>k.id==='fa-sku-bridge-mapping'));
  assert.ok(excerpts.some(k=>k.id==='fa-sku-bridge-correct'));
  assert.match(payload.instructions,/training examples ONLY/);
  return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'۱. Analyze data\n۲. Recheck corrections',sourceIds:['fa-sku-bridge-mapping','fa-sku-bridge-correct'],handoff:false})}]}]}));
 };
 try{const r=await desk.answer('SKU Bridge CSV',retrieve('SKU Bridge CSV','fa'),'fa');assert.equal(r.sources.length,2);assert.ok(r.text.includes('\n'));}finally{globalThis.fetch=old;}
});

test('reviewed broad SKU workflow cannot omit mapping or analysis, in all three languages',async()=>{
 const {desk}=await setup(),old=globalThis.fetch;
 const questions={en:'I am a beginner. How do I import my CSV into SKU Bridge, check and correct errors, and download only approved rows?',fa:'من تازه کارم. چطور فایل CSV کالاهایم را در SKU Bridge وارد کنم و خطاهای آن را بررسی کنم؟',tr:'SKU Bridge CSV dosyamı nasıl yüklerim ve hataları kontrol ederim?'};
 globalThis.fetch=async()=>{throw Error('A reviewed workflow must not depend on generated summarization');};
 try{for(const [lang,q] of Object.entries(questions)){
  const result=await desk.answer(q,retrieve(q,lang),lang);
  const labels=['Choose Excel or CSV','Confirm column mapping','Analyze data','Data quality report','Recheck corrections','USE','Download approved rows'];
  let previous=-1;for(const label of labels){const i=result.text.indexOf(label);assert.ok(i>previous,`${lang}: ${label} in order`);previous=i;}
  assert.ok(result.text.length<=2600);assert.equal(result.sources.length,6);assert.ok(!/DEMO-TAPE|2\.00/.test(result.text));
 }}finally{globalThis.fetch=old;}
});
test('reviewed workflow honors opt-in and handoff without calling a provider',async()=>{
 const {desk}=await setup({CHAT_AI_ENABLED:'true',OPENAI_API_KEY:'test',CHAT_MODEL:'configured-model'}),old=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('No provider call expected');};
 const q='How do I import a CSV into SKU Bridge and check errors?';
 try{
  const ai=await start(desk,true),off=await start(desk,false);
  const send=s=>call(desk,'/sessions/'+s.id+'/messages','POST',{text:q,messageId:crypto.randomUUID()},s.token);
  const r=await send(ai);assert.equal(r.data.messages.at(-1).role,'assistant');assert.equal(r.data.mode,'ai');
  assert.equal((await send(off)).data.messages.length,1);
  await call(desk,'/sessions/'+ai.id+'/handoff','POST',{},ai.token);
  assert.equal((await send(ai)).data.messages.length,3); // new visitor message only
 }finally{globalThis.fetch=old;}
});


test('operator key guessing is throttled without locking other IPs',async()=>{
 const {desk}=await setup();
 for(let i=0;i<10;i++)assert.equal((await call(desk,'/admin/conversations','GET',null,'wrong-key-at-least-32-characters-long','attacker')).status,401);
 assert.equal((await call(desk,'/admin/conversations','GET',null,key,'attacker')).status,429);
 assert.equal((await call(desk,'/admin/conversations','GET',null,key,'operator')).status,200);
});
test('distributed public flooding is bounded and operator inbox remains accessible',async()=>{
 const {desk}=await setup();desk.rate('public-global',600);const k='public-global:'+Math.floor(Date.now()/60000);
 desk.sql.exec('UPDATE counters SET n=600 WHERE key=?',k);
 assert.equal((await call(desk,'/status','GET',null,null,'new-bot-ip')).status,429);
 assert.equal((await call(desk,'/admin/conversations','GET',null,key,'operator')).status,200);
});
test('emergency pause stops new sessions while existing conversations work',async()=>{
 const {desk,env}=await setup();const s=await start(desk);env.CHAT_ACCEPT_NEW_SESSIONS='false';
 assert.equal((await call(desk,'/sessions','POST',{consent:true})).status,503);
 assert.equal((await call(desk,'/sessions/'+s.id,'GET',null,s.token)).status,200);
});
test('AI session budget and concurrent work cap stop provider calls safely',async()=>{
 for(const limit of ['session','concurrency']){
  const {desk}=await setup({CHAT_AI_ENABLED:'true',OPENAI_API_KEY:'test',CHAT_MODEL:'configured-model'});const s=await start(desk,true);let calls=0;
  desk.answer=async()=>{calls++;throw Error('must not call');};
  if(limit==='session')for(let i=0;i<12;i++)desk.rate('ai-session:'+s.id,12,86400000);else desk.activeAI=5;
  const r=await call(desk,'/sessions/'+s.id+'/messages','POST',{text:'How do I save a BOM?',messageId:crypto.randomUUID()},s.token);
  assert.equal(calls,0);assert.equal(r.data.mode,'queued');assert.equal(r.data.pending,false);
 }
});

test('Turnstile blocks missing, forged, wrong-domain and wrong-action tokens before storing sessions',async()=>{
 const old=globalThis.fetch;
 try{
  for(const result of [{success:false,'error-codes':['timeout-or-duplicate']},{success:true,hostname:'evil.test',action:'support_start'},{success:true,hostname:'hamvara.com',action:'login'}]){
   const {desk,db}=await setup({CHAT_TURNSTILE_REQUIRED:'true',TURNSTILE_SECRET_KEY:'test-secret'});
   globalThis.fetch=async()=>new Response(JSON.stringify(result));
   assert.equal((await call(desk,'/sessions','POST',{consent:true,turnstileToken:'invalid'})).status,403);
   assert.equal(db.prepare('SELECT COUNT(*) n FROM conversations').get().n,0);
  }
  const {desk}=await setup({CHAT_TURNSTILE_REQUIRED:'true',TURNSTILE_SECRET_KEY:'test-secret'});
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('should not call');};
  for(const value of [undefined,'','x'.repeat(2049)])assert.equal((await call(desk,'/sessions','POST',{consent:true,turnstileToken:value})).status,403);
  assert.equal(calls,0);
 }finally{globalThis.fetch=old;}
});
test('verified token creates a session once; provider failure and missing secret fail closed',async()=>{
 const old=globalThis.fetch;
 try{
  const {desk,db}=await setup({CHAT_TURNSTILE_REQUIRED:'true',TURNSTILE_SECRET_KEY:'test-secret'});let used=false;
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
   assert.deepEqual(JSON.parse(options.body),{secret:'test-secret',response:'valid-token'});
   const result=used?{success:false,'error-codes':['timeout-or-duplicate']}:{success:true,hostname:'hamvara.com',action:'support_start'};used=true;
   return new Response(JSON.stringify(result));
  };
  const body={consent:true,turnstileToken:'valid-token'};
  assert.equal((await call(desk,'/sessions','POST',body)).status,201);
  assert.equal((await call(desk,'/sessions','POST',body)).status,403);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM conversations').get().n,1);
  globalThis.fetch=async()=>{throw Error('network timeout');};
  assert.equal((await call(desk,'/sessions','POST',body)).status,503);
  const {desk:missing}=await setup({CHAT_TURNSTILE_REQUIRED:'true'});
  assert.equal((await call(missing,'/status')).data.ready,false);
  assert.equal((await call(missing,'/sessions','POST',body)).status,503);
  assert.equal((await call(missing,'/admin/conversations','GET',null,key)).status,200);
 }finally{globalThis.fetch=old;}
});
