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
 for(const file of ['0002_mrp_saas.sql','0004_mrp_mobile_scan.sql','0013_mobile_receipts.sql','0014_mrp_workspace_profiles.sql','0015_mrp_trial_lifecycle.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 sql.prepare("INSERT INTO mrp_workspaces (id,slug,name) VALUES ('w1','factory-one','Factory'),('w2','factory-two','Other')").run();
 const users={operator:['u1','OPERATOR','w1'],manager:['u2','PRODUCTION_MANAGER','w1'],factory:['u3','FACTORY_MANAGER','w1'],ceo:['u4','CEO','w1'],other:['u5','CEO','w2'],accounting:['u6','ACCOUNTING','w1']};
 for(const [name,[id,role,workspace]] of Object.entries(users)){sql.prepare('INSERT INTO mrp_users (id,workspace_id,username,access_key_hash,role) VALUES (?,?,?,?,?)').run(id,workspace,name,await hash(name+'-secret'),role);sql.prepare("INSERT INTO mrp_mobile_warehouse_grants VALUES (?,?,'WH-RM')").run(workspace,id);}
 for(const workspace of ['w1','w2'])sql.prepare('INSERT INTO mrp_state (workspace_id,state_json,revision) VALUES (?,?,0)').run(workspace,JSON.stringify(state()));
 const DB={beforeBatch:null,failAudit:false,prepare(query){const statement={values:[],bind(...values){return {...statement,values};},async first(){return sql.prepare(query).get(...this.values)||null;},async all(){return {results:sql.prepare(query).all(...this.values)};},async run(){if(DB.failAudit&&query.includes('INSERT INTO mrp_audit_log'))throw Error('audit unavailable');const result=sql.prepare(query).run(...this.values);return {meta:{changes:Number(result.changes)}};}};return statement;},async batch(statements){if(this.beforeBatch){const hook=this.beforeBatch;this.beforeBatch=null;hook();}sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const env={DB,MRP_MOBILE_RECEIPT_WORKSPACES:'factory-one,factory-two',MRP_ROLE_POLICY_WORKSPACES:'factory-one,factory-two'};
 async function web(user,path,body){const req=new Request('https://api.test/api/mrp/'+path,{method:body===undefined?'GET':'POST',headers:{'X-Hamvara-Workspace':users[user][2]==='w1'?'factory-one':'factory-two','X-Hamvara-User':user,'X-Hamvara-Key':user+'-secret'},...(body===undefined?{}:{body:JSON.stringify(body)})});return handleMrpRequest(req,env,new URL(req.url));}
 async function phone(token,path,body,{time=Date.now(),nonce=crypto.randomUUID(),signingKey=key.privateKey}={}){const raw=JSON.stringify(body),timestamp=String(time),canonical=['POST','/api/mrp/'+path,timestamp,nonce,await hash(raw)].join('\n'),proof=b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',signingKey,new TextEncoder().encode(canonical)));const req=new Request('https://api.test/api/mrp/'+path,{method:'POST',headers:{'X-Hamvara-Scan-Token':token,'X-Hamvara-Time':timestamp,'X-Hamvara-Nonce':nonce,'X-Hamvara-Proof':proof},body:raw});return handleMrpRequest(req,env,new URL(req.url));}
 async function pair(){const p=await (await web('operator','receipt-console/pairings',{warehouse:'WH-RM'})).json();await phone(p.token,'mobile-receipts/pair',{publicKey,deviceName:'Test device'});await web('operator',`receipt-console/pairings/${p.id}`,{action:'approve'});return p;}
 const payload=(extra={})=>({clientEventId:crypto.randomUUID(),sku:'SKU-1',quantity:'5',unit:'pcs',supplier:'Supplier',reference:'DOC-1',destinationWarehouse:'WH-RM',date:'2026-10-08',...extra});
 const submit=async (p,body=payload())=>(await phone(p.token,'mobile-receipts',body)).json();
 const transition=async (id,action,version,user)=>(await web(user,`receipt-console/receipts/${id}`,{action,version,note:'Checked'})).json();
 return {sql,env,web,phone,pair,payload,submit,transition};
}
const status=expected=>error=>error.status===expected;

const current=f=>JSON.parse(f.sql.prepare("SELECT state_json FROM mrp_state WHERE workspace_id='w1'").get().state_json);
const revise=(f,state)=>f.sql.prepare("UPDATE mrp_state SET state_json=? WHERE workspace_id='w1'").run(JSON.stringify(state));
async function op(f,user,action,input={}){const revision=f.sql.prepare("SELECT revision FROM mrp_state WHERE workspace_id='w1'").get().revision;return (await f.web(user,'operations',{expectedRevision:revision,action,input})).json();}
test('all roles get scoped main state; sensitive finance and unassigned stock never leave the server',async()=>{
 const f=await fixture(),s=current(f);s.journalEntries=[{secret:'finance-secret'}];s.skus[0].cost=12345;s.skus[0].standardCost=6789;s.stock['SKU-1']['WH-OTHER']=999;s.inventoryLots=[{id:'secret',warehouse:'WH-OTHER',quantity:50}];s.projects=[{id:'p',budget:100000,name:'Work'}];revise(f,s);
 for(const user of ['operator','manager','accounting']){const data=await (await f.web(user,'state')).json(),raw=JSON.stringify(data);assert(!raw.includes('finance-secret'));assert(!raw.includes('12345'));assert(!raw.includes('6789'));assert(!raw.includes('WH-OTHER'));assert(!raw.includes('100000'));}
 assert.equal((await (await f.web('ceo','state')).json()).state.skus[0].cost,12345);
});
test('operator cannot edit catalogs or financial fields; manager edits SKU without erasing hidden cost',async()=>{
 const f=await fixture();await assert.rejects(op(f,'operator','edit',{changes:{skus:[]}}),status(403));
 const skus=[{code:'SKU-1',name:'Updated',unit:'pcs'}];await op(f,'manager','edit',{changes:{skus}});assert.equal(current(f).skus[0].cost,3);assert.equal(current(f).skus[0].name,'Updated');
 for(const user of ['operator','manager','accounting'])for(const action of ['finance.period-create','finance.journal-post','finance.settings'])await assert.rejects(op(f,user,action,{}),status(403));
 for(const key of ['stock','journalEntries','qualityInspections','inventoryTransactions','accountingPeriods','productionJobs'])await assert.rejects(op(f,'manager','edit',{changes:{[key]:[]}}),status(403));
 await assert.rejects(op(f,'manager','edit',{changes:{skus:[{...skus[0],cost:999}]}}),status(403));
});
test('manager quality and approval posts a receipt once without CEO posting',async()=>{
 const f=await fixture(),{receipt}=await (await f.web('operator','receipt-console/receipts',f.payload())).json();
 await f.transition(receipt.id,'receive',0,'manager');await f.transition(receipt.id,'qc_accept',1,'manager');
 const result=await f.transition(receipt.id,'approve',2,'manager');assert.equal(result.status,'POSTED');assert.equal(current(f).stock['SKU-1']['WH-RM'],5);
 await assert.rejects(f.transition(receipt.id,'approve',2,'manager'),status(409));assert.equal(current(f).stock['SKU-1']['WH-RM'],5);
});
test('operator issues need independent manager approval, CEO reviews financial draft; replay does not move stock twice',async()=>{
 const f=await fixture(),s=current(f);s.stock['SKU-1']['WH-RM']=20;revise(f,s);
 await op(f,'operator','inventory.create',{type:'ISSUE',purpose:'OPERATING',sku:'SKU-1',sourceWarehouse:'WH-RM',quantity:2,reason:'Workshop',reference:'REQ-1'});
 const id=current(f).inventoryTransactions[0].id;await op(f,'operator','inventory.submit',{id});
 await assert.rejects(op(f,'operator','inventory.approve',{id}),status(403));await op(f,'manager','inventory.approve',{id});
 assert.equal(current(f).stock['SKU-1']['WH-RM'],18);assert.equal(current(f).journalEntries[0].status,'DRAFT');
 await assert.rejects(op(f,'manager','inventory.approve',{id}),status(422));assert.equal(current(f).stock['SKU-1']['WH-RM'],18);
 const journal=current(f).journalEntries[0];await op(f,'ceo','finance.period-create',{code:'2026',startDate:'2026-01-01',endDate:'2026-12-31'});await op(f,'ceo','finance.journal-post',{id:journal.id});assert.equal(current(f).journalEntries[0].status,'POSTED');
});
test('requester cannot approve, warehouse grant is rechecked, quarantine cannot bypass quality',async()=>{
 const f=await fixture();await op(f,'manager','inventory.create',{sku:'SKU-1',sourceWarehouse:'WH-RM',quantity:1,reason:'test'});const id=current(f).inventoryTransactions[0].id;await op(f,'manager','inventory.submit',{id});await assert.rejects(op(f,'manager','inventory.approve',{id}),status(403));
 await assert.rejects(op(f,'operator','inventory.create',{sku:'SKU-1',sourceWarehouse:'WH-QA',quantity:1,reason:'bypass'}),status(403));
 f.sql.exec("DELETE FROM mrp_mobile_warehouse_grants WHERE user_id='u1'");await assert.rejects(op(f,'operator','inventory.create',{sku:'SKU-1',sourceWarehouse:'WH-RM',quantity:1,reason:'test'}),status(403));
});
test('count requires manager review and CEO adjustment; intervening stock movement blocks stale count',async()=>{
 const f=await fixture();await op(f,'operator','count.create',{warehouse:'WH-RM',scope:'ALL'});const c=current(f).cycleCounts[0];await op(f,'operator','count.submit',{id:c.id,counts:{[c.lines[0].id]:2}});await assert.rejects(op(f,'ceo','count.approve',{id:c.id}),status(409));await op(f,'manager','count.review',{id:c.id});
 await assert.rejects(op(f,'manager','count.approve',{id:c.id}),status(403));const s=current(f);s.stock['SKU-1']['WH-RM']=1;revise(f,s);await assert.rejects(op(f,'ceo','count.approve',{id:c.id}),status(409));
 s.stock['SKU-1']['WH-RM']=0;revise(f,s);await op(f,'ceo','finance.period-create',{code:'2026',startDate:'2026-01-01',endDate:'2026-12-31'});await op(f,'ceo','count.approve',{id:c.id});assert.equal(current(f).stock['SKU-1']['WH-RM'],2);
});
test('state and audit are atomic, stale requests and other tenants cannot modify records',async()=>{
 const f=await fixture();f.env.DB.failAudit=true;await assert.rejects(op(f,'operator','count.create',{warehouse:'WH-RM'}),/audit unavailable/);assert.equal(current(f).cycleCounts,undefined);f.env.DB.failAudit=false;
 await op(f,'operator','count.create',{warehouse:'WH-RM'});const id=current(f).cycleCounts[0].id;await assert.rejects(f.web('operator','operations',{expectedRevision:0,action:'count.create',input:{warehouse:'WH-RM'}}),status(409));
 await assert.rejects(f.web('other','operations',{expectedRevision:0,action:'count.submit',input:{id,counts:{}}}),status(404));
 f.env.DB.beforeBatch=()=>f.sql.exec("UPDATE mrp_state SET revision=revision+1 WHERE workspace_id='w1'");const audits=f.sql.prepare('SELECT count(*) n FROM mrp_audit_log').get().n;await assert.rejects(op(f,'operator','count.create',{warehouse:'WH-RM',scope:'ALL'}),status(409));assert.equal(f.sql.prepare('SELECT count(*) n FROM mrp_audit_log').get().n,audits);
});
test('finance preserves balanced journals, closed periods and forbids full-state overwrite even for CEO',async()=>{
 const f=await fixture();await op(f,'ceo','finance.period-create',{code:'October',startDate:'2026-10-01',endDate:'2026-10-31'});
 await assert.rejects(op(f,'ceo','finance.journal-post',{date:'2026-10-12',lines:[{accountCode:'1000',debit:2},{accountCode:'3000',credit:1}]}),status(422));
 const id=current(f).accountingPeriods[0].id;await op(f,'ceo','finance.period-close',{id});await assert.rejects(op(f,'ceo','finance.journal-post',{date:'2026-10-12',lines:[{accountCode:'1000',debit:2},{accountCode:'3000',credit:2}]}),status(422));
 const request=new Request('https://api.test/api/mrp/state',{method:'PUT',headers:{'X-Hamvara-Workspace':'factory-one','X-Hamvara-User':'ceo','X-Hamvara-Key':'ceo-secret'},body:JSON.stringify({state:current(f),expectedRevision:2})});await assert.rejects(handleMrpRequest(request,f.env,new URL(request.url)),status(403));
});
