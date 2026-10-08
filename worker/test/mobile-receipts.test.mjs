import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleMrpRequest} from '../src/mrp.js';

const b64=v=>Buffer.from(v).toString('base64url');
const hash=async v=>b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const publicKey=b64(await crypto.subtle.exportKey('spki',key.publicKey));
const state=()=>({schemaVersion:21,skus:[{code:'SKU-1',name:'Material',unit:'pcs',cost:3}],warehouses:[{code:'WH-RM',name:'Raw materials'},{code:'WH-QA',name:'Quarantine'}],stock:{'SKU-1':{'WH-RM':0,'WH-QA':0}},receipts:[],qualityInspections:[],settings:{currency:'TRY'},mrpRuns:[]});
async function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0002_mrp_saas.sql','0004_mrp_mobile_scan.sql','0013_mobile_receipts.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 sql.prepare("INSERT INTO mrp_workspaces (id,slug,name) VALUES ('w1','factory-one','Factory'),('w2','factory-two','Other')").run();
 const users={operator:['u1','OPERATOR','w1'],manager:['u2','PRODUCTION_MANAGER','w1'],factory:['u3','FACTORY_MANAGER','w1'],ceo:['u4','CEO','w1'],other:['u5','CEO','w2'],accounting:['u6','ACCOUNTING','w1']};
 for(const [name,[id,role,workspace]] of Object.entries(users)){sql.prepare('INSERT INTO mrp_users (id,workspace_id,username,access_key_hash,role) VALUES (?,?,?,?,?)').run(id,workspace,name,await hash(name+'-secret'),role);sql.prepare("INSERT INTO mrp_mobile_warehouse_grants VALUES (?,?,'WH-RM')").run(workspace,id);}
 for(const workspace of ['w1','w2'])sql.prepare('INSERT INTO mrp_state (workspace_id,state_json,revision) VALUES (?,?,0)').run(workspace,JSON.stringify(state()));
 const DB={beforeBatch:null,failAudit:false,prepare(query){const statement={values:[],bind(...values){return {...statement,values};},async first(){return sql.prepare(query).get(...this.values)||null;},async all(){return {results:sql.prepare(query).all(...this.values)};},async run(){if(DB.failAudit&&query.includes('INSERT INTO mrp_audit_log'))throw Error('audit unavailable');const result=sql.prepare(query).run(...this.values);return {meta:{changes:Number(result.changes)}};}};return statement;},async batch(statements){if(this.beforeBatch){const hook=this.beforeBatch;this.beforeBatch=null;hook();}sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const env={DB,MRP_MOBILE_RECEIPT_WORKSPACES:'factory-one,factory-two'};
 async function web(user,path,body){const req=new Request('https://api.test/api/mrp/'+path,{method:body===undefined?'GET':'POST',headers:{'X-Hamvara-Workspace':users[user][2]==='w1'?'factory-one':'factory-two','X-Hamvara-User':user,'X-Hamvara-Key':user+'-secret'},...(body===undefined?{}:{body:JSON.stringify(body)})});return handleMrpRequest(req,env,new URL(req.url));}
 async function phone(token,path,body,{time=Date.now(),nonce=crypto.randomUUID(),signingKey=key.privateKey}={}){const raw=JSON.stringify(body),timestamp=String(time),canonical=['POST','/api/mrp/'+path,timestamp,nonce,await hash(raw)].join('\n'),proof=b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',signingKey,new TextEncoder().encode(canonical)));const req=new Request('https://api.test/api/mrp/'+path,{method:'POST',headers:{'X-Hamvara-Scan-Token':token,'X-Hamvara-Time':timestamp,'X-Hamvara-Nonce':nonce,'X-Hamvara-Proof':proof},body:raw});return handleMrpRequest(req,env,new URL(req.url));}
 async function pair(){const p=await (await web('operator','receipt-console/pairings',{warehouse:'WH-RM'})).json();await phone(p.token,'mobile-receipts/pair',{publicKey,deviceName:'Test device'});await web('operator',`receipt-console/pairings/${p.id}`,{action:'approve'});return p;}
 const payload=(extra={})=>({clientEventId:crypto.randomUUID(),sku:'SKU-1',quantity:'5',unit:'pcs',supplier:'Supplier',reference:'DOC-1',destinationWarehouse:'WH-RM',date:'2026-10-08',...extra});
 const submit=async (p,body=payload())=>(await phone(p.token,'mobile-receipts',body)).json();
 const transition=async (id,action,version,user)=>(await web(user,`receipt-console/receipts/${id}`,{action,version,note:'Checked'})).json();
 return {sql,env,web,phone,pair,payload,submit,transition};
}
const status=expected=>error=>error.status===expected;

test('complete receipt flow persists once, holds quarantine and requires CEO to post',async()=>{
 const f=await fixture(),p=await f.pair(),body=f.payload(),submitted=await f.submit(p,body),id=submitted.receipt.id;
 assert.equal(submitted.receipt.status,'SUBMITTED');
 const current=()=>JSON.parse(f.sql.prepare("SELECT state_json FROM mrp_state WHERE workspace_id='w1'").get().state_json);
 assert.equal(current().stock['SKU-1']['WH-QA'],0);
 await f.transition(id,'receive',0,'manager');assert.equal(current().stock['SKU-1']['WH-QA'],5);
 await f.transition(id,'qc_accept',1,'manager');
 await f.transition(id,'approve',2,'factory');assert.equal(current().stock['SKU-1']['WH-RM'],0);
 await assert.rejects(f.transition(id,'post',3,'factory'),status(403));
 await f.transition(id,'post',3,'ceo');assert.equal(current().stock['SKU-1']['WH-RM'],5);assert.equal(current().stock['SKU-1']['WH-QA'],0);
 await assert.rejects(f.transition(id,'post',3,'ceo'),status(409));
 const retry=await f.submit(p,body);assert.equal(retry.duplicate,true);assert.equal(retry.receipt.status,'POSTED');assert.equal(current().receipts.length,1);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM mrp_audit_log WHERE action='mobile_receipt.post'").get().n,1);
});
test('same event ID cannot be reused with changed payload',async()=>{const f=await fixture(),p=await f.pair(),body=f.payload();await f.submit(p,body);await assert.rejects(f.submit(p,{...body,quantity:9}),status(409));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM mrp_mobile_receipts').get().n,1);});
test('parallel delivery of identical event remains one durable receipt',async()=>{const f=await fixture(),p=await f.pair(),body=f.payload();const responses=await Promise.all([f.submit(p,body),f.submit(p,body)]);assert.equal(new Set(responses.map(r=>r.receipt.id)).size,1);});
test('approval, proof freshness, signature and replay are enforced',async()=>{
 const f=await fixture(),p=await (await f.web('operator','receipt-console/pairings',{warehouse:'WH-RM'})).json();
 await f.phone(p.token,'mobile-receipts/pair',{publicKey});await assert.rejects(f.submit(p),status(403));
 await f.web('operator',`receipt-console/pairings/${p.id}`,{action:'approve'});
 await assert.rejects(f.phone(p.token,'mobile-receipts',f.payload(),{time:Date.now()-31000}),status(401));
 const nonce=crypto.randomUUID(),body=f.payload();await f.phone(p.token,'mobile-receipts',body,{nonce});await assert.rejects(f.phone(p.token,'mobile-receipts',body,{nonce}),status(409));
 const other=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 await assert.rejects(f.phone(p.token,'mobile-receipts',f.payload(),{signingKey:other.privateKey}),status(401));
 await assert.rejects(f.phone(p.token,'mobile-receipts/pair',{publicKey:b64(await crypto.subtle.exportKey('spki',other.publicKey))},{signingKey:other.privateKey}),status(409));
});
test('expired QR, revoked session and revoked warehouse grants deny use',async()=>{
 const f=await fixture(),p=await (await f.web('operator','receipt-console/pairings',{warehouse:'WH-RM'})).json();
 f.sql.prepare('UPDATE mrp_mobile_pairings SET claim_until=? WHERE id=?').run(Date.now()-1,p.id);
 await assert.rejects(f.phone(p.token,'mobile-receipts/pair',{publicKey}),status(410));
 const active=await f.pair();await f.web('operator',`receipt-console/pairings/${active.id}`,{action:'revoke'});await assert.rejects(f.submit(active),status(401));
 const fresh=await f.pair();f.sql.exec("DELETE FROM mrp_mobile_warehouse_grants WHERE user_id='u1'");await assert.rejects(f.submit(fresh),status(403));
});
test('tenant isolation and role checks protect inbox and transitions',async()=>{
 const f=await fixture(),p=await f.pair(),{receipt}=await f.submit(p);
 assert.deepEqual((await (await f.web('other','receipt-console/receipts')).json()).receipts,[]);
 await assert.rejects(f.transition(receipt.id,'receive',0,'other'),status(404));
 await assert.rejects(f.transition(receipt.id,'receive',0,'operator'),status(403));
 await assert.rejects(f.transition(receipt.id,'receive',0,'accounting'),status(403));
 await assert.rejects(f.web('operator','receipt-console/grants',{userId:'u1',warehouse:'WH-RM'}),status(403));
});
test('revision conflict rolls back receipt transition, stock and audit',async()=>{
 const f=await fixture(),p=await f.pair(),{receipt}=await f.submit(p);
 f.env.DB.beforeBatch=()=>f.sql.exec("UPDATE mrp_state SET revision=revision+1 WHERE workspace_id='w1'");
 await assert.rejects(f.transition(receipt.id,'receive',0,'manager'),status(409));
 assert.equal(f.sql.prepare('SELECT status FROM mrp_mobile_receipts').get().status,'SUBMITTED');
 assert.equal(JSON.parse(f.sql.prepare("SELECT state_json FROM mrp_state WHERE workspace_id='w1'").get().state_json).stock['SKU-1']['WH-QA'],0);
});
test('audit failure rolls back stock and transition atomically',async()=>{
 const f=await fixture(),p=await f.pair(),{receipt}=await f.submit(p);f.env.DB.failAudit=true;
 await assert.rejects(f.transition(receipt.id,'receive',0,'manager'),/audit unavailable/);
 assert.equal(f.sql.prepare('SELECT version FROM mrp_mobile_receipts').get().version,0);
 assert.equal(f.sql.prepare("SELECT revision FROM mrp_state WHERE workspace_id='w1'").get().revision,0);
});
test('parallel reviewers cannot receive one draft twice',async()=>{
 const f=await fixture(),p=await f.pair(),{receipt}=await f.submit(p);
 const results=await Promise.allSettled([f.transition(receipt.id,'receive',0,'manager'),f.transition(receipt.id,'receive',0,'factory')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(JSON.parse(f.sql.prepare("SELECT state_json FROM mrp_state WHERE workspace_id='w1'").get().state_json).stock['SKU-1']['WH-QA'],5);
});
test('invalid quantities, SKU, units, dates and cross-warehouse input are rejected',async()=>{
 const f=await fixture(),p=await f.pair();
 for(const extra of [{quantity:0},{quantity:-3},{quantity:'NaN'},{sku:'UNKNOWN'},{unit:'kg'},{date:'2026-02-30'},{expiryDate:'2026-10-07'}])await assert.rejects(f.submit(p,f.payload(extra)),status(422));
 await assert.rejects(f.submit(p,f.payload({destinationWarehouse:'WH-FG'})),status(403));
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM mrp_mobile_receipts').get().n,0);
});
test('quality hold retains quarantine and cannot be posted',async()=>{
 const f=await fixture(),p=await f.pair(),{receipt}=await f.submit(p);await f.transition(receipt.id,'receive',0,'manager');await f.transition(receipt.id,'qc_hold',1,'manager');
 await assert.rejects(f.transition(receipt.id,'post',2,'ceo'),status(409));
 assert.equal(JSON.parse(f.sql.prepare("SELECT state_json FROM mrp_state WHERE workspace_id='w1'").get().state_json).stock['SKU-1']['WH-QA'],5);
});
test('legacy state reads and writes cannot bypass the opt-in pilot',async()=>{
 const f=await fixture();await assert.rejects(f.web('operator','state'),status(403));
 const req=new Request('https://api.test/api/mrp/state',{method:'PUT',headers:{'X-Hamvara-Workspace':'factory-one','X-Hamvara-User':'ceo','X-Hamvara-Key':'ceo-secret'},body:JSON.stringify({state:{...state(),stock:{'SKU-1':{'WH-RM':999}}},expectedRevision:0})});
 await assert.rejects(handleMrpRequest(req,f.env,new URL(req.url)),status(403));
});
