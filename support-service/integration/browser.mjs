// Optional browser QA: PLAYWRIGHT_MODULE may point at an existing Playwright install.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../../worker/package.json',import.meta.url));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const site='http://127.0.0.1:9180',key='browser-test-operator-key-at-least-32-characters';
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'support-browser-test',modules:['worker.js','index.js','knowledge.js','reviewed-workflows.js'].map(name=>({type:'ESModule',path:fileURLToPath(new URL('../src/'+name,import.meta.url))})),compatibilityDate:'2026-08-01',durableObjects:{DESK:{className:'SupportDesk',useSQLite:true}},bindings:{ALLOWED_ORIGINS:site,CHAT_OPERATORS:JSON.stringify([{id:'test',name:'Test',tokenHash:createHash('sha256').update(key).digest('hex')}]),CHAT_TURNSTILE_REQUIRED:'false',CHAT_AI_ENABLED:'false'}}]}));
let browser,server;
try{
 const api=(await mf.ready).origin;
 server=createServer(async(req,res)=>{
  const path=new URL(req.url,site).pathname;
  if(path==='/support/config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.HAMVARA_SUPPORT_CONFIG='+JSON.stringify({apiBase:api})+';');return;}
  try{
   if(!/^\/support\/[a-z.-]+$/.test(path))throw Error('Invalid path');
   let data=await readFile(new URL('../..'+path,import.meta.url),'utf8');
   if(path.endsWith('.html'))data=data.replaceAll('https://hamvara-support.yahya-mazdarani.workers.dev',api).replaceAll('wss://hamvara-support.yahya-mazdarani.workers.dev',api.replace('http:','ws:'));
   res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(data);
  }catch{res.writeHead(404);res.end();}
 });await new Promise(resolve=>server.listen(9180,'127.0.0.1',resolve));
 const response=await mf.dispatchFetch(api+'/sessions',{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:JSON.stringify({consent:true,lang:'en'})});
 assert.equal(response.status,201);const session=await response.json();
 browser=await chromium.launch({headless:true});
 const adminContext=await browser.newContext(),visitorContext=await browser.newContext();
 await visitorContext.addInitScript(s=>sessionStorage.setItem('hamvara-support-session',JSON.stringify(s)),{id:session.id,token:session.token,lang:'en'});
 const admin=await adminContext.newPage(),visitor=await visitorContext.newPage(),errors=[],calls=[];
 for(const p of [admin,visitor]){p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().startsWith(api)&&!r.url().includes('/events?'))calls.push(r.url());});}
 await admin.goto(site+'/support/admin.html');await admin.locator('#key').fill(key);await admin.locator('#login button').click();
 await admin.locator('#desk').waitFor({state:'visible'});await admin.locator('#available').check();
 await visitor.goto(site+'/support/index.html');await visitor.locator('#conversation').waitFor({state:'visible'});
 await visitor.locator('#text').fill('Browser event delivery test');await visitor.locator('#send').click();
 await admin.locator('#threads button').first().click();await admin.locator('#messages').getByText('Browser event delivery test',{exact:true}).waitFor();
 await admin.locator('#claim').click();await admin.locator('#reply').waitFor({state:'visible'});
 await admin.locator('#text').fill('Reply delivered by event');await admin.locator('#reply button').click();await visitor.locator('#messages').getByText('Reply delivered by event',{exact:true}).waitFor();
 await new Promise(resolve=>setTimeout(resolve,1000));calls.length=0;
 await new Promise(resolve=>setTimeout(resolve,35000));assert.deepEqual(calls,[],'no idle HTTP polling in either real browser page');
 await visitorContext.setOffline(true);await admin.locator('#text').fill('Reply during disconnection');await admin.locator('#reply button').click();
 await visitorContext.setOffline(false);await visitor.locator('#messages').getByText('Reply during disconnection',{exact:true}).waitFor();
 await admin.locator('#close').click();await visitor.waitForFunction(()=>document.getElementById('send').disabled&&document.getElementById('status').textContent.includes('Conversation closed'));
 visitor.on('dialog',d=>d.accept());await visitor.locator('#erase').click();await visitor.locator('#start').waitFor({state:'visible'});
 await admin.waitForFunction(()=>document.getElementById('threads').textContent.includes('No conversations'));
 assert.deepEqual(errors,[]);console.log('Browser PASS: operator login, availability, customer message, claim, reply, 35s idle without HTTP polls, reconnect catch-up, close and deletion.');
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mf.dispose();}
