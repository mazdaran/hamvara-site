import {execFileSync} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';

const apiBase=String(process.env.MRP_ACCEPTANCE_API_BASE||'').replace(/\/$/,'');
if(!apiBase)throw new Error('MRP_ACCEPTANCE_API_BASE is required.');

const suffix=randomBytes(6).toString('hex'),workspaceId=randomUUID(),userId=randomUUID();
const slug=`acceptance-${suffix}`,username='acceptance-ceo',accessKey=randomBytes(36).toString('base64url');
const accessKeyHash=createHash('sha256').update(accessKey).digest('base64url');
const runId=`MRP-ACCEPTANCE-${suffix}`,releasedAt=new Date().toISOString();
const quote=value=>`'${String(value).replaceAll("'","''")}'`;

function d1(command){
  const output=execFileSync('npx',['wrangler','d1','execute','hamvara-growth-production','--config','../wrangler.toml','--remote','--json','--command',command],{encoding:'utf8',stdio:['ignore','pipe','inherit']});
  const parsed=JSON.parse(output),result=Array.isArray(parsed)?parsed[0]:parsed;
  if(result?.success===false)throw new Error('D1 command failed.');
  return result?.results||result?.result?.results||[];
}

function headers(){return{'Content-Type':'application/json','X-Hamvara-Workspace':slug,'X-Hamvara-User':username,'X-Hamvara-Key':accessKey}}

try{
  d1(`INSERT INTO mrp_workspaces (id,slug,name) VALUES (${quote(workspaceId)},${quote(slug)},'Hamvara MRP Acceptance'); INSERT INTO mrp_users (id,workspace_id,username,access_key_hash,role) VALUES (${quote(userId)},${quote(workspaceId)},${quote(username)},${quote(accessKeyHash)},'CEO'); INSERT INTO mrp_state (workspace_id,state_json,revision,updated_by) VALUES (${quote(workspaceId)},NULL,0,${quote(userId)});`);
  const state={schemaVersion:6,appVersion:'production-acceptance',mrpRuns:[{id:runId,runNo:'MRP-ACCEPTANCE-00001',status:'RELEASED',plannedBy:'acceptance-planner',reviewedBy:'acceptance-reviewer',releasedBy:'acceptance-ceo',releasedAt,resultFingerprint:`SHA256-${suffix}`,timeBucketCheckpoints:{headHash:`CHECKPOINT-${suffix}`},deltaAnchor:{headHash:'GENESIS'}}]};
  const response=await fetch(`${apiBase}/api/mrp/state`,{method:'PUT',headers:headers(),body:JSON.stringify({state,expectedRevision:0})}),body=await response.json();
  if(!response.ok)throw new Error(`Production API rejected acceptance release (${response.status}): ${body.error||'unknown error'}`);
  const seal=body.auditSeals?.find(item=>item.runId===runId);
  if(!seal||seal.algorithm!=='HMAC-SHA-256'||!/^[A-Za-z0-9_-]{43}$/.test(seal.signature))throw new Error('Production API did not return a valid HMAC-SHA-256 seal.');
  const rows=d1(`SELECT id,run_id,signature,algorithm,payload_json FROM mrp_audit_seals WHERE workspace_id=${quote(workspaceId)} AND run_id=${quote(runId)};`),stored=rows[0];
  if(!stored||stored.id!==`MRPSEAL-${seal.signature}`||stored.signature!==seal.signature||stored.algorithm!=='HMAC-SHA-256')throw new Error('D1 seal does not match the production API response.');
  const payload=JSON.parse(stored.payload_json);
  if(payload.workspaceId!==workspaceId||payload.runId!==runId||payload.releasedAt!==releasedAt)throw new Error('Stored seal payload does not match the released run.');
  console.log('PASS: production release received a matching server HMAC-SHA-256 seal.');
}finally{
  d1(`DELETE FROM mrp_audit_seals WHERE workspace_id=${quote(workspaceId)}; DELETE FROM mrp_audit_log WHERE workspace_id=${quote(workspaceId)}; DELETE FROM mrp_state WHERE workspace_id=${quote(workspaceId)}; DELETE FROM mrp_users WHERE workspace_id=${quote(workspaceId)}; DELETE FROM mrp_workspaces WHERE id=${quote(workspaceId)};`);
  const remaining=d1(`SELECT COUNT(*) AS count FROM mrp_workspaces WHERE id=${quote(workspaceId)};`);
  if(Number(remaining[0]?.count)!==0)throw new Error('Acceptance tenant cleanup failed.');
  console.log('PASS: temporary acceptance tenant was removed.');
}
