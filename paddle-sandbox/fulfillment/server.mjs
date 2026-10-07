import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, seed } from './store.mjs';
import { PLANS, publicCatalog } from './catalog.mjs';
import { login, session, requireCsrf, resolveOwner, HttpError } from './auth.mjs';
import { makePaddle } from './paddle.mjs';
import { createCheckout } from './checkout.mjs';
import { acceptEvent } from './webhooks.mjs';
import { forActor } from './lifecycle.mjs';
import { skuAccess, exportSkuCsv } from './sku-access.mjs';
import { renderSkuPage } from './sku-page.mjs';
const PAGE_DIR=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const files=new Map([['index.html','text/html'],['styles.css','text/css'],['config.js','text/javascript'],['app.js','text/javascript'],['sku-access.js','text/javascript'],['README.md','text/plain']]);
const skuFiles=new Map([['styles.css','text/css'],['core.mjs','text/javascript'],['app.mjs','text/javascript'],['i18n.mjs','text/javascript']]);
async function readBody(req) {
  const chunks=[];let length=0;
  for await(const chunk of req){length+=chunk.length;if(length>1024*1024)throw new HttpError(413,'body_too_large');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
function parseBody(raw) { try{return JSON.parse(raw.toString('utf8'));}catch{throw new HttpError(400,'invalid_json');} }
export function createServer({db,paddle=null,webhookSecret='',port=8080,clock=Date.now}) {
  const attempts=new Map();
  const server=http.createServer(async(req,res)=>{
    const actualPort=port||server.address().port, origin=`http://localhost:${actualPort}`,host=`localhost:${actualPort}`;
    const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
    const json=(status,body,extra={})=>{res.writeHead(status,{...headers,'Content-Type':'application/json',...extra});res.end(JSON.stringify(body));};
    try {
      if(req.headers.host!==host)throw new HttpError(403,'use_localhost_origin');
      const url=new URL(req.url,origin);
      if(req.method==='POST'&&url.pathname==='/api/sandbox/webhook') {
        const raw=await readBody(req);const result=acceptEvent(db,raw,req.headers['paddle-signature'],webhookSecret,clock());
        // Receipt is durable before ACK. Projection is deterministic and runs on reads, not in this request.
        return json(200,result);
      }
      if(req.method==='POST') {
        if(req.headers.origin!==origin)throw new HttpError(403,'same_origin_required');
        if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'json_required');
      }
      if(req.method==='POST'&&url.pathname==='/api/sandbox/login') {
        const key=req.socket.remoteAddress,entry=attempts.get(key)||{count:0,until:0};
        if(entry.until<clock()){entry.count=0;entry.until=clock()+60000;}entry.count++;attempts.set(key,entry);
        if(entry.count>10)throw new HttpError(429,'login_rate_limited');
        const body=parseBody(await readBody(req));
        if(typeof body.username!=='string'||body.username.length>80||typeof body.password!=='string'||body.password.length>128)throw new HttpError(400,'invalid_login');
        const result=login(db,body.username,body.password,clock());
        return json(200,{user:result.user,csrf:result.csrf},{'Set-Cookie':`hamvara_sandbox_session=${result.token}; HttpOnly; SameSite=Strict; Path=/api/sandbox; Max-Age=3600`});
      }
      if(url.pathname.startsWith('/api/sandbox/')) {
        const actor=session(db,req.headers.cookie,clock());
        if(req.method==='GET'&&url.pathname==='/api/sandbox/session')return json(200,{user:{id:actor.user_id,username:actor.username,kind:actor.kind},csrf:actor.csrf,checkoutConfigured:Boolean(paddle),webhookConfigured:Boolean(webhookSecret)});
        if(req.method==='GET'&&url.pathname==='/api/sandbox/entitlements')return json(200,{entitlements:forActor(db,actor,clock()),prototype:true});
        if(req.method==='GET'&&url.pathname==='/api/sandbox/sku/access')return json(200,skuAccess(db,actor,clock()));
        if(req.method==='GET'&&url.pathname==='/api/sandbox/catalog')return json(200,{version:1,plans:publicCatalog().map(p=>{let eligible=false;try{resolveOwner(db,actor,PLANS[p.key]);eligible=true;}catch(error){if(!(error instanceof HttpError))throw error;}return {...p,eligible};})});
        const resource=/^\/api\/sandbox\/product\/([a-z][a-z0-9-]{0,79})$/.exec(url.pathname);
        if(resource&&!Object.values(PLANS).some(p=>p.product===resource[1]))throw new HttpError(404,'unknown_product');
        if(req.method==='GET'&&resource) {
          const entitlement=forActor(db,actor,clock()).find(e=>e.product===resource[1]&&e.access);
          if(!entitlement)throw new HttpError(403,'verified_paid_test_access_required');
          return json(200,{prototype:true,product:resource[1],ownerId:entitlement.ownerId,limits:entitlement.limits,message:'Protected local test resource only. Production applications are unchanged.'});
        }
        if(req.method==='POST')requireCsrf(actor,req.headers['x-sandbox-csrf']);
        if(req.method==='POST'&&url.pathname==='/api/sandbox/sku/export') {
          const body=parseBody(await readBody(req)),current=session(db,req.headers.cookie,clock());
          requireCsrf(current,req.headers['x-sandbox-csrf']);
          const csv=exportSkuCsv(db,current,body,clock());
          res.writeHead(200,{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="Hamvara-approved-SKU.csv"'});
          return res.end(csv);
        }
        if(req.method==='POST'&&url.pathname==='/api/sandbox/logout') {
          db.prepare('DELETE FROM sessions WHERE token_hash=?').run(actor.token_hash);
          return json(200,{ok:true},{'Set-Cookie':'hamvara_sandbox_session=; HttpOnly; SameSite=Strict; Path=/api/sandbox; Max-Age=0'});
        }
        if(req.method==='POST'&&url.pathname==='/api/sandbox/checkout')return json(200,await createCheckout(db,actor,parseBody(await readBody(req)),paddle,clock()));
        throw new HttpError(404,'not_found');
      }
      if(req.method!=='GET')throw new HttpError(405,'method_not_allowed');
      if(url.pathname==='/sku-bridge/'||url.pathname==='/sku-bridge') {
        const source=await readFile(join(PAGE_DIR,'..','sku-bridge','index.html'),'utf8');
        const body=renderSkuPage(source);
        res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8',
          'Content-Security-Policy':"default-src 'self'; script-src 'self' https://cdn.sheetjs.com; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});
        return res.end(body);
      }
      if(url.pathname.startsWith('/sku-bridge/')) {
        const asset=url.pathname.slice('/sku-bridge/'.length);
        if(!skuFiles.has(asset))throw new HttpError(404,'not_found');
        const body=await readFile(join(PAGE_DIR,'..','sku-bridge',asset));
        res.writeHead(200,{...headers,'Content-Type':skuFiles.get(asset)+'; charset=utf-8'});
        return res.end(body);
      }
      const name=url.pathname==='/paddle-sandbox/'?'index.html':url.pathname.slice('/paddle-sandbox/'.length);
      if(!url.pathname.startsWith('/paddle-sandbox/')||!files.has(name))throw new HttpError(404,'not_found');
      const body=await readFile(join(PAGE_DIR,name));
      res.writeHead(200,{...headers,'Content-Type':files.get(name)+'; charset=utf-8'});res.end(body);
    }catch(error){json(error.status||500,{error:error instanceof HttpError?error.message:'internal_sandbox_error'});}
  });
  server.requestTimeout=20000;
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const db=openStore();
  if(process.argv.includes('--seed')) {seed(db);console.log('Pre-created local test users and companies are ready. See README for fixture login details.');db.close();}
  else {
    // Read only these explicitly named server credentials; never print them or load .env files.
    const apiKey=process.env.HAMVARA_PADDLE_SANDBOX_API_KEY;
    const webhookSecret=process.env.HAMVARA_PADDLE_SANDBOX_WEBHOOK_SECRET||'';
    let paddle;
    try{paddle=makePaddle(apiKey);}catch{console.error('Only a sandbox API key is accepted. Server not started.');db.close();process.exitCode=1;}
    if(process.exitCode!==1){
      const portArgument=process.argv.find(arg=>arg.startsWith('--port='));
      const port=portArgument?Number(portArgument.slice(7)):8080;
      if(!Number.isInteger(port)||port<1024||port>65535){db.close();throw new Error('Invalid local port');}
      const server=createServer({db,paddle,webhookSecret,port});
      server.listen(port,'127.0.0.1',()=>console.log(`Local prototype: http://localhost:${port}/paddle-sandbox/ — checkout ${paddle?'configured':'disabled (server API key missing)'}, webhook ${webhookSecret?'configured':'disabled (secret missing)'}.`));
      const stop=()=>server.close(()=>{db.close();process.exit();});process.on('SIGINT',stop);process.on('SIGTERM',stop);
      server.on('error',()=>{console.error('Could not start loopback server. Check whether the selected port is in use.');db.close();process.exitCode=1;});
    }
  }
}
