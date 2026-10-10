import {mkdir,writeFile,cp,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,relative} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
export async function preparePilotStaging(id,directory=resolve(root,'.pilot-staging')){
 const production=await readFile(resolve(root,'wrangler.toml'),'utf8');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'')||production.toLowerCase().includes(id.toLowerCase()))throw Error('Supply the UUID of a separate hamvara-pilot-staging D1 database. Production is forbidden.');
 await mkdir(directory,{recursive:true});
 let credentials;
 try{credentials=JSON.parse(await readFile(resolve(directory,'credentials.json'),'utf8'));if(credentials.databaseId!==id)throw Error('This staging directory belongs to another database. Use a separate checkout.');}
 catch(error){if(error.code!=='ENOENT')throw error;credentials={databaseId:id,adminToken:randomBytes(32).toString('base64url'),auditSecret:randomBytes(32).toString('base64url'),companies:['pilot-tr','pilot-us'].map(workspace=>({workspace,users:['owner','operator','manager'].map((username,i)=>({username,role:['CEO','OPERATOR','PRODUCTION_MANAGER'][i],accessKey:randomBytes(32).toString('base64url')}))}))};await writeFile(resolve(directory,'credentials.json'),JSON.stringify(credentials,null,2),{mode:0o600,flag:'wx'});}
 await mkdir(resolve(directory,'assets'),{recursive:true});
 await cp(resolve(root,'mrp'),resolve(directory,'assets/mrp'),{recursive:true});
 await writeFile(resolve(directory,'assets/mrp/config.js'),'window.HAMVARA_MRP_CONFIG = {apiBase: location.origin};\n');
 const rel=p=>relative(directory,resolve(root,p)).replaceAll('\\','/');
 const config={name:'hamvara-pilot-staging',main:rel('worker/src/pilot-staging.js'),compatibility_date:'2026-08-01',workers_dev:true,preview_urls:false,vars:{PILOT_STAGING:'true',MRP_MOBILE_RECEIPT_WORKSPACES:'pilot-tr,pilot-us'},d1_databases:[{binding:'DB',database_name:'hamvara-pilot-staging',database_id:id,migrations_dir:rel('worker/migrations')}],assets:{binding:'ASSETS',directory:'./assets',run_worker_first:true}};
 await writeFile(resolve(directory,'wrangler.json'),JSON.stringify(config,null,2));
 await writeFile(resolve(directory,'secrets.json'),JSON.stringify({MRP_ADMIN_TOKEN:credentials.adminToken,MRP_AUDIT_HMAC_SECRET:credentials.auditSecret}),{mode:0o600});
 const q=v=>"'"+String(v).replaceAll("'","''")+"'",sql=[];
 for(const company of credentials.companies){
  const tr=company.workspace==='pilot-tr',id=company.workspace+'-workspace';
  const state=JSON.parse(await readFile(resolve(root,'mrp/initial-data.json'),'utf8'));
  state.company=tr?'Turkey internal test — NO CUSTOMER DATA':'US internal test — NO CUSTOMER DATA';state.settings.currency=tr?'TRY':'USD';
  state.skus=[{code:'TEST-001',barcode:'8690526693361',name:'Synthetic test item',unit:'pcs',type:'FG',cost:1,active:true}];state.stock={'TEST-001':{'WH-FG':0}};
  sql.push(`INSERT OR IGNORE INTO mrp_workspaces (id,slug,name) VALUES (${q(id)},${q(company.workspace)},${q(state.company)});`);
  for(const user of company.users){const uid=id+'-'+user.username;
   sql.push(`INSERT OR IGNORE INTO mrp_users (id,workspace_id,username,access_key_hash,role) VALUES (${q(uid)},${q(id)},${q(user.username)},${q(createHash('sha256').update(user.accessKey).digest('base64url'))},${q(user.role)});`);
   sql.push(`INSERT OR IGNORE INTO mrp_mobile_warehouse_grants (workspace_id,user_id,warehouse) VALUES (${q(id)},${q(uid)},'WH-FG');`);
  }
  sql.push(`INSERT OR IGNORE INTO mrp_workspace_profiles (workspace_id,country,language,timezone,currency,contact_email,member_limit) VALUES (${q(id)},${q(tr?'TR':'US')},${q(tr?'tr':'en')},${q(tr?'Europe/Istanbul':'America/New_York')},${q(tr?'TRY':'USD')},'internal-test@example.invalid',3);`);
  sql.push(`INSERT OR IGNORE INTO mrp_trials (workspace_id) VALUES (${q(id)});`);
  sql.push(`INSERT OR IGNORE INTO mrp_state (workspace_id,state_json,revision,updated_by) VALUES (${q(id)},${q(JSON.stringify(state))},0,${q(id+'-owner')});`);
 }
 await writeFile(resolve(directory,'seed.sql'),sql.join('\n')+'\n',{mode:0o600});
 return {directory,config};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 await preparePilotStaging(process.argv[2]);
 console.log('Pilot staging package prepared locally. No remote changes made. Keep .pilot-staging/credentials.json private; no keys printed.');
}
