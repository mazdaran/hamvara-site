import {mkdir,writeFile,copyFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../../',import.meta.url));
const directory=resolve(root,'.mobile-staging');
const id=process.argv[2];
const production=await readFile(resolve(root,'wrangler.toml'),'utf8');
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'')||production.toLowerCase().includes(id.toLowerCase()))throw Error('Pass the UUID of a separate mobile staging D1 database. Production bindings are forbidden.');
await mkdir(resolve(directory,'assets/mrp'),{recursive:true});
const assets=['mobile-receipts.html','mobile-receipts.css','mobile-receipts-console.js','mobile-receipt.html','qrcode.min.js'];
for(const file of assets)await copyFile(resolve(root,'mrp',file),resolve(directory,'assets/mrp',file));
await writeFile(resolve(directory,'assets/mrp/config.js'),'window.HAMVARA_MRP_CONFIG = {apiBase: location.origin};\n');
const config={name:'hamvara-mobile-staging',main:'../worker/src/mobile-staging.js',compatibility_date:'2026-08-01',workers_dev:true,preview_urls:false,vars:{MOBILE_STAGING:'true',MRP_MOBILE_RECEIPT_WORKSPACES:'mobile-pilot'},d1_databases:[{binding:'DB',database_name:'hamvara-mobile-staging',database_id:id,migrations_dir:'../worker/migrations'}],assets:{binding:'ASSETS',directory:'./assets',run_worker_first:true}};
await writeFile(resolve(directory,'wrangler.json'),JSON.stringify(config,null,2)+'\n');
// Keys are generated once locally. Re-running preparation must not reset users or stock.
let credentials;
try{credentials=JSON.parse(await readFile(resolve(directory,'credentials.json'),'utf8'));if(credentials.databaseId!==id)throw Error('Existing staging credentials belong to another database. Use a separate checkout.');}catch(error){if(error.code!=='ENOENT')throw error;credentials={databaseId:id,workspace:'mobile-pilot',users:['operator','production','factory','ceo'].map((username,i)=>({username,role:['OPERATOR','PRODUCTION_MANAGER','FACTORY_MANAGER','CEO'][i],accessKey:randomBytes(32).toString('base64url')}))};await writeFile(resolve(directory,'credentials.json'),JSON.stringify(credentials,null,2),{mode:0o600,flag:'wx'});}
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const state={schemaVersion:21,skus:[{code:'FG-TEST-PRODUCT-001',barcode:'8690526693361',name:'MRP Test Product',unit:'pcs',type:'FG',cost:33.75,active:true}],warehouses:[{code:'WH-FG',name:'Product',active:true},{code:'WH-QA',name:'Quarantine',active:true}],stock:{'FG-TEST-PRODUCT-001':{'WH-FG':0,'WH-QA':0}},receipts:[],qualityInspections:[],settings:{currency:'TRY'},mrpRuns:[]};
const sql=["INSERT OR IGNORE INTO mrp_workspaces (id,slug,name) VALUES ('mobile-pilot-workspace','mobile-pilot','Mobile receipt test — NO CUSTOMER DATA');"];
for(const user of credentials.users){const userId='mobile-pilot-'+user.username;sql.push(`INSERT OR IGNORE INTO mrp_users (id,workspace_id,username,access_key_hash,role) VALUES (${q(userId)},'mobile-pilot-workspace',${q(user.username)},${q(createHash('sha256').update(user.accessKey).digest('base64url'))},${q(user.role)});`);sql.push(`INSERT OR IGNORE INTO mrp_mobile_warehouse_grants (workspace_id,user_id,warehouse) VALUES ('mobile-pilot-workspace',${q(userId)},'WH-FG');`);}
sql.push(`INSERT OR IGNORE INTO mrp_state (workspace_id,state_json,revision,updated_by) VALUES ('mobile-pilot-workspace',${q(JSON.stringify(state))},0,'mobile-pilot-ceo');`);
await writeFile(resolve(directory,'seed.sql'),sql.join('\n')+'\n',{mode:0o600});
console.log('Staging package prepared. No Cloudflare resources were created or changed.');
console.log('Config: .mobile-staging/wrangler.json | Local login keys: .mobile-staging/credentials.json (never commit or share).');
