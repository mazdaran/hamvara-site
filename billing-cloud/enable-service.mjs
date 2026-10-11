import {readFileSync,writeFileSync} from 'node:fs';
const path=new URL('./.local/wrangler.json',import.meta.url);
const config=JSON.parse(readFileSync(path,'utf8'));
if(config.name!=='hamvara-billing-sandbox'||config.vars?.BILLING_ENV!=='sandbox'||config.d1_databases?.[0]?.database_id!=='760d4282-7499-4740-bf29-8f13618042a8')throw Error('Incorrect sandbox configuration');
config.main='../service.mjs';
config.observability={logs:{enabled:true,invocation_logs:false}};
writeFileSync(path,JSON.stringify(config,null,2)+'\n');
console.log('Sandbox service entrypoint configured. Deploy to apply.');
