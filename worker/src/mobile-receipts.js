import {getTrialAccess,enforceTrial} from './trials.js';
import {queueReceiptForApproval,applyReceiptQcDecision,applyManagerReceiptDecision} from '../../mrp/receipt-workflow.js';

const encoder=new TextEncoder();
const ID=/^[0-9a-f-]{36}$/i;
const roles=['OPERATOR','PRODUCTION_MANAGER','FACTORY_MANAGER','CEO'];
const protectedFields=['stock','receipts','qualityInspections','inventoryLots','inventoryMovements','inventoryCostLayers','inventoryCostMovements','inventoryValuations','journalEntries','purchaseOrders','accountingSettings'];
export const mobileReceiptsEnabled=(env,actor)=>String(env.MRP_MOBILE_RECEIPT_WORKSPACES||'').split(',').map(x=>x.trim()).includes(actor.workspace.slug);
export function guardLegacyReceiptState(env,actor,previous,next){
 if(!mobileReceiptsEnabled(env,actor))return;
 if(actor.user.role!=='CEO')fail(403,'Use the mobile receipts console for this pilot workspace.');
 for(const key of protectedFields)if(JSON.stringify(previous[key]??null)!==JSON.stringify(next[key]??null))fail(403,'Inventory and receipt changes in this pilot workspace require the server receipt workflow.');
}
export function guardLegacyReceiptRead(env,actor){if(mobileReceiptsEnabled(env,actor)&&actor.user.role!=='CEO')fail(403,'Use mobile-receipts.html for this pilot workspace.');}
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const bytes=value=>{try{return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),x=>x.charCodeAt(0));}catch{fail(400,'Invalid key or signature encoding.');}};
const hash=async value=>b64(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||/[\u0000-\u001f]/.test(value)||(required&&!value.trim()))fail(400,'Invalid receipt field.');return value.trim();};
async function readBody(request){const raw=await request.text();if(encoder.encode(raw).length>16384)fail(413,'Request too large.');try{return {raw,body:raw?JSON.parse(raw):{}};}catch{fail(400,'Invalid JSON.');}}
async function stateRow(env,workspace){const row=await env.DB.prepare('SELECT state_json,revision FROM mrp_state WHERE workspace_id=?').bind(workspace).first();if(!row?.state_json)fail(409,'Initialize company data before pairing.');return {...row,state:JSON.parse(row.state_json)};}
async function granted(env,actor,warehouse){
 if(!roles.includes(actor.user.role))fail(403,'This role cannot receive goods.');
 if(actor.user.role==='CEO')return;
 const grant=await env.DB.prepare('SELECT warehouse FROM mrp_mobile_warehouse_grants WHERE workspace_id=? AND user_id=? AND warehouse=?').bind(actor.workspace.id,actor.user.id,warehouse).first();
 if(!grant)fail(403,'Warehouse permission is required.');
}
async function audit(env,actor,action,details){await env.DB.prepare('INSERT INTO mrp_audit_log (workspace_id,user_id,action,details_json,created_at) VALUES (?,?,?,?,?)').bind(actor.workspace.id,actor.user.id,action,JSON.stringify(details),new Date().toISOString()).run();}
function actorFrom(row){return {workspace:{id:row.workspace_id,slug:row.slug},user:{id:row.user_id,role:row.role,username:row.username}};}
async function pairing(env,token){
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))fail(401,'Pairing credentials required.');
 const row=await env.DB.prepare(`SELECT p.*,w.slug,u.role,u.username FROM mrp_mobile_pairings p JOIN mrp_workspaces w ON w.id=p.workspace_id JOIN mrp_users u ON u.id=p.user_id AND u.workspace_id=p.workspace_id WHERE p.token_hash=? AND w.active=1 AND u.active=1`).bind(await hash(token)).first();
 if(!row||row.revoked||row.expires_at<=Date.now())fail(401,'Pairing expired or revoked.');
 const actor=actorFrom(row);if(!mobileReceiptsEnabled(env,actor))fail(403,'Mobile receipts are not enabled.');await granted(env,actor,row.warehouse);return row;
}
async function verifyProof(request,raw,publicKey){
 const time=request.headers.get('X-Hamvara-Time')||'',nonce=request.headers.get('X-Hamvara-Nonce')||'',signature=request.headers.get('X-Hamvara-Proof')||'';
 if(!/^\d{13}$/.test(time)||Math.abs(Date.now()-Number(time))>30000||!ID.test(nonce)||signature.length>512||publicKey.length>600)fail(401,'Invalid or expired request proof.');
 const url=new URL(request.url);const message=[request.method,url.pathname,time,nonce,await hash(raw)].join('\n');
 try{const key=await crypto.subtle.importKey('spki',bytes(publicKey),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);if(key.algorithm.modulusLength!==2048||!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(signature),encoder.encode(message)))fail(401,'Invalid request proof.');}catch{fail(401,'Invalid request proof.');}
 return nonce;
}
async function consumeNonce(env,row,nonce){
 await env.DB.prepare('DELETE FROM mrp_mobile_nonces WHERE expires_at<?').bind(Date.now()).run();
 const result=await env.DB.prepare('INSERT OR IGNORE INTO mrp_mobile_nonces (pairing_id,nonce,expires_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM mrp_mobile_nonces WHERE pairing_id=?)<180').bind(row.id,nonce,Date.now()+60000,row.id).run();
 if(!result.meta.changes){const reused=await env.DB.prepare('SELECT nonce FROM mrp_mobile_nonces WHERE pairing_id=? AND nonce=?').bind(row.id,nonce).first();if(reused)fail(409,'Request proof already used. Retry with a fresh proof.');fail(429,'Too many requests. Retry after 60 seconds.');}
}
export async function handleMobileReceiptPhone(request,env,url){
 const {raw,body}=await readBody(request),row=await pairing(env,request.headers.get('X-Hamvara-Scan-Token')||'');
 enforceTrial(await getTrialAccess(env.DB,row.workspace_id),request,url.pathname);
 const claim=url.pathname==='/api/mrp/mobile-receipts/pair';
 if(claim){
  if(request.method!=='POST')fail(405,'POST required.');
  const key=text(body.publicKey,600,true);await verifyProof(request,raw,key);
  if(row.public_key&&row.public_key!==key)fail(409,'Pairing already claimed.');
  if(!row.public_key){
   if(Date.now()>row.claim_until)fail(410,'QR expired. Create a new QR.');
   const changed=await env.DB.prepare('UPDATE mrp_mobile_pairings SET public_key=?,device_name=? WHERE id=? AND public_key IS NULL AND revoked=0 AND claim_until>=?').bind(key,text(body.deviceName||'Android',80),row.id,Date.now()).run();
   if(!changed.meta.changes)fail(409,'Pairing already claimed.');
  }
  return json({session:{id:row.id,workspaceId:row.workspace_id,userId:row.user_id,warehouse:row.warehouse,status:row.approved?'ACTIVE':'AWAITING_APPROVAL',expiresAt:new Date(row.expires_at).toISOString(),keyFingerprint:(await hash(key)).slice(0,16)}});
 }
 if(!row.public_key||!row.approved)fail(403,'Approve this device in the web receipts console.');
 const nonce=await verifyProof(request,raw,row.public_key);await consumeNonce(env,row,nonce);
 if(url.pathname==='/api/mrp/mobile-receipts/lookup'&&request.method==='POST'){
  const code=text(body.code,256,true),{state}=await stateRow(env,row.workspace_id);
  const matches=(state.skus||[]).filter(item=>item.active!==false&&(item.code===code||item.barcode===code));
  if(!matches.length)fail(422,'Unknown barcode or SKU. Ask a manager to define the item.');
  if(matches.length!==1)fail(409,'This code matches multiple items. Ask a manager to correct the catalog.');
  const item=matches[0];
  return json({item:{sku:item.code,name:item.name,unit:item.unit,barcode:item.barcode||'',lotTracked:!!item.lotTracked,serialTracked:!!item.serialTracked},warehouse:row.warehouse});
 }
 if(url.pathname!=='/api/mrp/mobile-receipts'||request.method!=='POST')fail(404,'Mobile endpoint not found.');
 return submit(env,actorFrom(row),row,body);
}
function validatePayload(body,state,warehouse){
 if(!ID.test(body.clientEventId||''))fail(400,'A stable client event ID is required.');
 const sku=text(body.sku,256,true),item=(state.skus||[]).find(x=>x.code===sku&&x.active!==false);
 if(!item)fail(422,'Unknown or inactive SKU. Ask a manager to create the item, then retry.');
 if(!(state.warehouses||[]).some(x=>x.code===warehouse&&x.active!==false)||warehouse==='WH-QA')fail(422,'Invalid destination warehouse.');
 if(body.destinationWarehouse!==warehouse)fail(403,'This device is paired to a different warehouse.');
 const quantity=Number(body.quantity);if(!Number.isFinite(quantity)||quantity<=0||quantity>1000000000)fail(422,'Quantity must be positive and at most 1,000,000,000.');
 const unit=text(body.unit,40,true);if(unit!==item.unit)fail(422,'Unit must match the SKU master.');
 const payload={sku,quantity,unit,destinationWarehouse:warehouse,reference:text(body.reference,100,true),supplier:text(body.supplier,120,true),note:text(body.note||'',1000),lotNo:text(body.lotNo||'',100),serialNo:text(body.serialNo||'',100),expiryDate:text(body.expiryDate||'',10),date:text(body.date,10,true)};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)||Number.isNaN(Date.parse(payload.date+'T00:00:00Z'))||new Date(payload.date+'T00:00:00Z').toISOString().slice(0,10)!==payload.date)fail(422,'Invalid receipt date.');
 if(payload.expiryDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(payload.expiryDate)||Number.isNaN(Date.parse(payload.expiryDate+'T00:00:00Z'))||new Date(payload.expiryDate+'T00:00:00Z').toISOString().slice(0,10)!==payload.expiryDate||payload.expiryDate<payload.date))fail(422,'Invalid expiry date.');
 if(item.lotTracked&&!payload.lotNo)fail(422,'Lot number required.');
 if(item.serialTracked&&(!payload.serialNo||quantity!==1))fail(422,'Serial number and quantity 1 required.');
 return payload;
}
async function submit(env,actor,pair,body){
 const row=await stateRow(env,actor.workspace.id),payload=validatePayload(body,row.state,pair.warehouse),serialized=JSON.stringify(payload),fingerprint=await hash(serialized),id=crypto.randomUUID(),now=new Date().toISOString();
 const deviceHash=await hash(pair.public_key);
 const [insert]=await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO mrp_mobile_receipts (id,workspace_id,submitted_by,device_key_hash,client_event_id,payload_json,payload_hash,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'SUBMITTED',0,?,?)`).bind(id,actor.workspace.id,actor.user.id,deviceHash,body.clientEventId,serialized,fingerprint,now,now),
  env.DB.prepare('INSERT INTO mrp_audit_log (workspace_id,user_id,action,details_json,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM mrp_mobile_receipts WHERE id=?)').bind(actor.workspace.id,actor.user.id,'mobile_receipt.submitted',JSON.stringify({receiptId:id,deviceKeyHash:deviceHash,warehouse:pair.warehouse}),now,id)
 ]);
 const saved=await env.DB.prepare('SELECT * FROM mrp_mobile_receipts WHERE workspace_id=? AND submitted_by=? AND client_event_id=?').bind(actor.workspace.id,actor.user.id,body.clientEventId).first();
 if(saved.payload_hash!==fingerprint)fail(409,'This event ID already belongs to different receipt data.');
 return json({receipt:publicReceipt(saved),duplicate:!insert.meta.changes},insert.meta.changes?201:200);
}
const publicReceipt=row=>({id:row.id,status:row.status,version:row.version,submittedBy:row.submitted_by,createdAt:row.created_at,payload:JSON.parse(row.payload_json)});
export async function handleReceiptConsole(request,env,url,actor){
 if(!mobileReceiptsEnabled(env,actor))fail(404,'Mobile receipt pilot is not enabled for this company.');
 const base='/api/mrp/receipt-console',path=url.pathname.slice(base.length);
 if(path==='/bootstrap'&&request.method==='GET'){
  const {state}=await stateRow(env,actor.workspace.id);
  const grants=await env.DB.prepare('SELECT warehouse FROM mrp_mobile_warehouse_grants WHERE workspace_id=? AND user_id=?').bind(actor.workspace.id,actor.user.id).all();
  const allowed=new Set(grants.results.map(x=>x.warehouse));
  return json({actor,warehouses:(state.warehouses||[]).filter(x=>x.code!=='WH-QA'&&x.active!==false&&(actor.user.role==='CEO'||allowed.has(x.code))).map(x=>({code:x.code,name:x.name})),skus:(state.skus||[]).filter(x=>x.active!==false).map(x=>({code:x.code,name:x.name,unit:x.unit,lotTracked:!!x.lotTracked,serialTracked:!!x.serialTracked}))});
 }
 if(path==='/users'&&request.method==='GET'){
  if(actor.user.role!=='CEO')fail(403,'CEO required.');
  const result=await env.DB.prepare('SELECT id,username,role FROM mrp_users WHERE workspace_id=? AND active=1').bind(actor.workspace.id).all();return json({users:result.results});
 }
 if(path==='/grants'&&request.method==='POST'){
  if(actor.user.role!=='CEO')fail(403,'CEO required.');const {body}=await readBody(request),{state}=await stateRow(env,actor.workspace.id);
  const user=await env.DB.prepare('SELECT id FROM mrp_users WHERE id=? AND workspace_id=? AND active=1').bind(body.userId,actor.workspace.id).first();
  if(!user||!state.warehouses.some(x=>x.code===body.warehouse&&x.code!=='WH-QA'))fail(400,'Invalid user or warehouse.');
  await env.DB.prepare(body.revoke?'DELETE FROM mrp_mobile_warehouse_grants WHERE workspace_id=? AND user_id=? AND warehouse=?':'INSERT OR IGNORE INTO mrp_mobile_warehouse_grants (workspace_id,user_id,warehouse) VALUES (?,?,?)').bind(actor.workspace.id,body.userId,body.warehouse).run();
  await audit(env,actor,'mobile_receipt.warehouse_permission',{userId:body.userId,warehouse:body.warehouse,revoke:!!body.revoke});return json({ok:true});
 }
 if(path==='/pairings'&&request.method==='POST'){
  const {body}=await readBody(request),{state}=await stateRow(env,actor.workspace.id);await granted(env,actor,body.warehouse);
  if(!state.warehouses.some(x=>x.code===body.warehouse&&x.active!==false&&x.code!=='WH-QA'))fail(400,'Invalid warehouse.');
  const id=crypto.randomUUID(),token=b64(crypto.getRandomValues(new Uint8Array(32))),now=Date.now();
  await env.DB.prepare('INSERT INTO mrp_mobile_pairings (id,workspace_id,user_id,warehouse,token_hash,claim_until,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,actor.workspace.id,actor.user.id,body.warehouse,await hash(token),now+60000,now+600000,new Date(now).toISOString()).run();
  await audit(env,actor,'mobile_receipt.pairing_created',{id,warehouse:body.warehouse});return json({id,token,claimUntil:now+60000,expiresAt:now+600000},201);
 }
 const pairMatch=/^\/pairings\/([0-9a-f-]{36})$/.exec(path);
 if(pairMatch){
  const row=await env.DB.prepare('SELECT * FROM mrp_mobile_pairings WHERE id=? AND workspace_id=? AND user_id=?').bind(pairMatch[1],actor.workspace.id,actor.user.id).first();
  if(!row)fail(404,'Pairing not found.');
  if(request.method==='GET')return json({id:row.id,deviceName:row.device_name,claimed:!!row.public_key,approved:!!row.approved,revoked:!!row.revoked,expiresAt:row.expires_at,keyFingerprint:row.public_key?(await hash(row.public_key)).slice(0,16):null});
  if(request.method==='POST'){
   const {body}=await readBody(request);if(!['approve','revoke'].includes(body.action))fail(400,'Invalid pairing action.');
   if(body.action==='approve'&&(!row.public_key||row.revoked||row.expires_at<=Date.now()))fail(409,'Pairing is unavailable.');
   await env.DB.prepare(body.action==='approve'?'UPDATE mrp_mobile_pairings SET approved=1 WHERE id=? AND revoked=0':'UPDATE mrp_mobile_pairings SET revoked=1 WHERE id=?').bind(row.id).run();
   await audit(env,actor,`mobile_receipt.device_${body.action}`,{id:row.id});return json({ok:true});
  }
 }
 if(path==='/receipts'&&request.method==='GET'){
  const result=await env.DB.prepare('SELECT * FROM mrp_mobile_receipts WHERE workspace_id=? ORDER BY created_at DESC LIMIT 100').bind(actor.workspace.id).all();
  const grants=await env.DB.prepare('SELECT warehouse FROM mrp_mobile_warehouse_grants WHERE workspace_id=? AND user_id=?').bind(actor.workspace.id,actor.user.id).all();const allowed=new Set(grants.results.map(x=>x.warehouse));
  return json({receipts:result.results.filter(x=>(actor.user.role==='CEO'||allowed.has(JSON.parse(x.payload_json).destinationWarehouse))&&(actor.user.role!=='OPERATOR'||x.submitted_by===actor.user.id)).map(publicReceipt)});
 }
 const match=/^\/receipts\/([0-9a-f-]{36})$/.exec(path);
 if(match&&request.method==='POST')return transitionReceipt(request,env,actor,match[1]);
 fail(404,'Receipt endpoint not found.');
}
async function transitionReceipt(request,env,actor,id){
 const {body}=await readBody(request),draft=await env.DB.prepare('SELECT * FROM mrp_mobile_receipts WHERE id=? AND workspace_id=?').bind(id,actor.workspace.id).first();
 if(!draft)fail(404,'Receipt not found.');const payload=JSON.parse(draft.payload_json);await granted(env,actor,payload.destinationWarehouse);
 if(!Number.isInteger(body.version)||body.version!==draft.version)fail(409,'Receipt changed. Refresh before deciding.');
 const rules={receive:{from:'SUBMITTED',to:'PENDING_QC',roles:['PRODUCTION_MANAGER','FACTORY_MANAGER','CEO']},qc_accept:{from:'PENDING_QC',to:'PENDING_MANAGER',roles:['PRODUCTION_MANAGER','FACTORY_MANAGER','CEO']},approve:{from:'PENDING_MANAGER',to:'APPROVED',roles:['FACTORY_MANAGER','CEO']},post:{from:'APPROVED',to:'POSTED',roles:['CEO']},reject:{from:'SUBMITTED',to:'REJECTED',roles:['PRODUCTION_MANAGER','FACTORY_MANAGER','CEO']},qc_hold:{from:'PENDING_QC',to:'HOLD_NCR',roles:['PRODUCTION_MANAGER','FACTORY_MANAGER','CEO']}};
 const rule=rules[body.action];if(!rule||!rule.roles.includes(actor.user.role))fail(403,'This role cannot perform this action.');
 if(draft.submitted_by===actor.user.id)fail(403,'An independent reviewer is required.');
 if(draft.status!==rule.from)fail(409,'Invalid receipt transition.');
 const {state,revision}=await stateRow(env,actor.workspace.id);
 validatePayload({...payload,clientEventId:draft.client_event_id},state,payload.destinationWarehouse);
 const meta={user:actor.user.username,role:actor.user.role,workspace:actor.workspace.slug,device:'web-receipts'},now=new Date().toISOString();
 state.receipts??=[];state.qualityInspections??=[];state.stock??={};
 const receiptId=`MOB-${id}`,inspectionId=`MIQC-${id}`;
 try{
  if(body.action==='receive')queueReceiptForApproval(state,{id:receiptId,inspectionId,inspectionNo:inspectionId,date:payload.date,reference:payload.reference,sku:payload.sku,description:state.skus.find(x=>x.code===payload.sku).name,targetWarehouse:payload.destinationWarehouse,qty:payload.quantity,supplier:payload.supplier,lotNo:payload.lotNo,serialNo:payload.serialNo,expiryDate:payload.expiryDate,notes:payload.note,transactionType:'MOBILE_GOODS_RECEIPT',mobileReceiptId:id,postedAt:now},meta);
  if(body.action==='qc_accept'||body.action==='qc_hold'){
   const inspection=state.qualityInspections.find(x=>x.id===inspectionId);if(!inspection)fail(409,'Inspection missing.');inspection.result=body.action==='qc_accept'?'ACCEPTED':'REJECTED';inspection.inspector=actor.user.username;inspection.notes=text(body.note||'',1000,body.action==='qc_hold');applyReceiptQcDecision(state,inspectionId,`MNCR-${id}`);
  }
  if(body.action==='approve'){const receipt=state.receipts.find(x=>x.id===receiptId);if(!receipt||receipt.status!=='PENDING_MANAGER')fail(409,'Receipt is not ready for approval.');receipt.mobileApprovedBy=actor.user.id;receipt.mobileApprovedAt=now;}
  if(body.action==='post')applyManagerReceiptDecision(state,receiptId,true,'',meta);
 }catch(error){if(error.status)throw error;fail(422,error.message);}
 const core=JSON.stringify(state);if(encoder.encode(core).length>5*1024*1024)fail(413,'Workspace size limit reached.');
 const transitionId=crypto.randomUUID(),details=JSON.stringify({receiptId:id,deviceKeyHash:draft.device_key_hash,from:draft.status,to:rule.to,note:text(body.note||'',1000,body.action==='reject'),ip:request.headers.get('CF-Connecting-IP')||null});
 let result;try{result=await env.DB.batch([
  env.DB.prepare('UPDATE mrp_mobile_receipts SET status=?,version=version+1,expected_state_revision=?,transition_id=?,updated_at=? WHERE id=? AND workspace_id=? AND version=?').bind(rule.to,revision,transitionId,now,id,actor.workspace.id,draft.version),
  env.DB.prepare('UPDATE mrp_state SET state_json=?,revision=revision+1,updated_by=?,updated_at=? WHERE workspace_id=? AND EXISTS (SELECT 1 FROM mrp_mobile_receipts WHERE id=? AND transition_id=?)').bind(core,actor.user.id,now,actor.workspace.id,id,transitionId),
  env.DB.prepare('INSERT INTO mrp_audit_log (workspace_id,user_id,action,details_json,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM mrp_mobile_receipts WHERE id=? AND transition_id=?)').bind(actor.workspace.id,actor.user.id,`mobile_receipt.${body.action}`,details,now,id,transitionId)
 ]);}catch(error){if(String(error.message).includes('mobile_receipt_revision_conflict'))fail(409,'Inventory changed. Refresh and retry.');throw error;}
 if(!result[0].meta.changes)fail(409,'Receipt changed. Refresh and retry.');
 return json({ok:true,status:rule.to,version:draft.version+1,revision:revision+1});
}
