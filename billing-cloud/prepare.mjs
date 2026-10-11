import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const databaseId=process.argv[2];
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId||''))throw Error('Provide a NEW billing sandbox D1 UUID.');
if(['873e4f9d-df81-4a3a-bfda-86491e729ae8','bc036eef-2f9d-46cf-a468-cd9a0fb42a87'].includes(databaseId.toLowerCase()))throw Error('MRP and production databases must not be used.');
const directory=resolve(root,'.local');await mkdir(directory,{recursive:true});
const path=resolve(directory,'wrangler.json');
try{const old=JSON.parse(await readFile(path,'utf8'));if(old.d1_databases[0].database_id!==databaseId)throw Error('Existing configuration uses another database.');}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(path,JSON.stringify({name:'hamvara-billing-sandbox',main:'../service.mjs',compatibility_date:'2026-10-01',workers_dev:true,preview_urls:false,vars:{BILLING_ENV:'sandbox'},d1_databases:[{binding:'DB',database_name:'hamvara-billing-sandbox',database_id:databaseId,migrations_dir:'../migrations'}]},null,2)+'\n');
console.log('Prepared billing-cloud/.local/wrangler.json. No resources changed.');
