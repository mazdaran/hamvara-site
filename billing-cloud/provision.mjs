// Generate local test-account keys and SQL containing hashes only; no network operations.
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const directory=new URL('./.local/',import.meta.url);await mkdir(directory,{recursive:true});
const config=JSON.parse(await readFile(new URL('wrangler.json',directory),'utf8'));
if(config.name!=='hamvara-billing-sandbox'||config.vars?.BILLING_ENV!=='sandbox'||config.d1_databases?.[0]?.database_name!=='hamvara-billing-sandbox')throw Error('Expected isolated billing sandbox configuration.');
const credentials=new URL('billing-test-access.json',directory);
try{await readFile(credentials);throw Error('Access file already exists. Reuse it; keys were not changed.');}catch(e){if(e.code!=='ENOENT')throw e;}
const expiry=Date.now()+30*86400000;
const accounts=[{id:'billing-owner-a',name:'Billing test owner A',company:'billing-company-a'},{id:'billing-owner-b',name:'Billing test owner B',company:'billing-company-b'}].map(a=>({...a,accessKey:'hbc_'+randomBytes(32).toString('hex')}));
const sql=[];
for(const a of accounts){const hash=createHash('sha256').update(a.accessKey).digest('hex');sql.push(`INSERT OR IGNORE INTO billing_users(id,name) VALUES('${a.id}','${a.name}');`,`INSERT OR IGNORE INTO billing_companies(id,name,billing_owner) VALUES('${a.company}','${a.company}','${a.id}');`,`INSERT OR IGNORE INTO billing_memberships VALUES('${a.id}','${a.company}');`,`INSERT OR IGNORE INTO billing_keys(key_hash,user_id,expires_at) VALUES('${hash}','${a.id}',${expiry});`);}
await writeFile(credentials,JSON.stringify({environment:'sandbox',expiresAt:new Date(expiry).toISOString(),accounts},null,2)+'\n',{flag:'wx',mode:0o600});
await writeFile(new URL('provision.sql',directory),sql.join('\n')+'\n',{mode:0o600});
console.log('Created .local/billing-test-access.json and .local/provision.sql. Keys were not printed. Apply provision.sql only to the billing sandbox.');
