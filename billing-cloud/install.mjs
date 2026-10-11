// Run from the Windows billing checkout after fetching this branch.
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const config=JSON.parse(readFileSync(new URL('./.local/wrangler.json',import.meta.url),'utf8'));
if(config.name!=='hamvara-billing-sandbox'||config.vars?.BILLING_ENV!=='sandbox'||config.d1_databases?.length!==1||config.d1_databases[0].database_id!=='760d4282-7499-4740-bf29-8f13618042a8')throw Error('Stop: configuration does not match the approved billing sandbox database.');
function run(args){const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(result.error||result.status!==0)throw Error('Step failed; installation stopped.');}
const wrangler='worker/node_modules/wrangler/bin/wrangler.js',cfg=['--config','billing-cloud/.local/wrangler.json'];
run([wrangler,'d1','migrations','apply','hamvara-billing-sandbox','--remote',...cfg]);
if(!existsSync(new URL('./.local/billing-test-access.json',import.meta.url)))run(['billing-cloud/provision.mjs']);
run([wrangler,'d1','execute','hamvara-billing-sandbox','--remote',...cfg,'--file','billing-cloud/.local/provision.sql']);
run([wrangler,'deploy',...cfg]);
if(process.env.PADDLE_SANDBOX_API_KEY)run(['billing-cloud/upload-api-key.mjs']);
else console.log('Existing Paddle API key is not loaded in this session. Load it from Windows User environment and run node billing-cloud/upload-api-key.mjs.');
console.log('Billing sandbox installed. Test-account keys are in billing-cloud/.local/billing-test-access.json. Do not share that file in chat.');
