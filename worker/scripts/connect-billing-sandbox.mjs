import {readFileSync,writeFileSync} from 'node:fs';
const path=new URL('../../.pilot-staging/wrangler.json',import.meta.url);
const config=JSON.parse(readFileSync(path,'utf8'));
if(config.name!=='hamvara-pilot-staging'||config.vars?.PILOT_STAGING!=='true'||config.d1_databases?.find(d=>d.binding==='DB')?.database_id!=='873e4f9d-df81-4a3a-bfda-86491e729ae8')throw Error('Only the existing pilot staging environment is allowed');
config.vars.MRP_BILLING_SANDBOX='true';
config.services=[...(config.services||[]).filter(s=>s.binding!=='BILLING_ACCESS'),{binding:'BILLING_ACCESS',service:'hamvara-billing-sandbox',entrypoint:'BillingAccess'}];
writeFileSync(path,JSON.stringify(config,null,2)+'\n');
console.log('Pilot TR maps to billing company A; pilot US maps to billing company B. Deploy to apply. No data changed.');
