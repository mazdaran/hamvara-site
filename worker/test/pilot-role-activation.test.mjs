import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
test('role activation preserves billing, API base and DB and grants only the two internal pilot warehouse users',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hamvara-role-'));
 try{
  await mkdir(join(root,'worker/scripts'),{recursive:true});await mkdir(join(root,'mrp'),{recursive:true});await mkdir(join(root,'.pilot-staging/assets/mrp'),{recursive:true});
  await copyFile(new URL('../scripts/configure-pilot-roles.mjs',import.meta.url),join(root,'worker/scripts/configure-pilot-roles.mjs'));
  await writeFile(join(root,'mrp/config.js'),'wrong production base');await writeFile(join(root,'mrp/app.js'),'new application');await writeFile(join(root,'.pilot-staging/assets/mrp/config.js'),'correct pilot base');
  const config={name:'hamvara-pilot-staging',vars:{PILOT_STAGING:'true',MRP_BILLING_SANDBOX:'true'},services:[{binding:'BILLING_ACCESS',service:'hamvara-billing-sandbox',entrypoint:'BillingAccess'}],d1_databases:[{binding:'DB',database_id:'873e4f9d-df81-4a3a-bfda-86491e729ae8'}]};
  await writeFile(join(root,'.pilot-staging/wrangler.json'),JSON.stringify(config));
  const result=spawnSync(process.execPath,[join(root,'worker/scripts/configure-pilot-roles.mjs')],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  assert.equal(await readFile(join(root,'.pilot-staging/assets/mrp/config.js'),'utf8'),'correct pilot base');
  const updated=JSON.parse(await readFile(join(root,'.pilot-staging/wrangler.json'),'utf8'));assert.deepEqual(updated.services,config.services);assert.deepEqual(updated.d1_databases,config.d1_databases);assert.equal(updated.vars.MRP_BILLING_SANDBOX,'true');assert.equal(updated.vars.MRP_ROLE_POLICY_WORKSPACES,'pilot-tr,pilot-us');
  const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE mrp_workspaces(id TEXT,slug TEXT,active INTEGER);CREATE TABLE mrp_users(id TEXT,workspace_id TEXT,username TEXT,role TEXT,active INTEGER);CREATE TABLE mrp_state(workspace_id TEXT,state_json TEXT);CREATE TABLE mrp_mobile_warehouse_grants(workspace_id TEXT,user_id TEXT,warehouse TEXT,PRIMARY KEY(workspace_id,user_id,warehouse));');
  for(const slug of ['pilot-tr','pilot-us','customer-live']){
   const id=slug+'-workspace';sql.prepare('INSERT INTO mrp_workspaces VALUES (?,?,1)').run(id,slug);sql.prepare('INSERT INTO mrp_state VALUES (?,?)').run(id,JSON.stringify({warehouses:['WH-RM','WH-PK','WH-FG','WH-SF','WH-QA'].map(code=>({code}))}));
   for(const [name,role] of [['operator','OPERATOR'],['manager','PRODUCTION_MANAGER'],['owner','CEO']])sql.prepare('INSERT INTO mrp_users VALUES (?,?,?,?,1)').run(id+'-'+name,id,name,role);
  }
  const grants=await readFile(join(root,'.pilot-staging/role-policy-grants.sql'),'utf8');sql.exec(grants);sql.exec(grants);assert.equal(sql.prepare('SELECT count(*) n FROM mrp_mobile_warehouse_grants').get().n,16);assert.equal(sql.prepare("SELECT count(*) n FROM mrp_mobile_warehouse_grants WHERE warehouse='WH-QA' OR workspace_id='customer-live-workspace'").get().n,0);sql.close();
 }finally{await rm(root,{recursive:true,force:true});}
});
