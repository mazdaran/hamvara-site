// Existing internal pilot only. Preserve billing bindings, keys and all data.
import {readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url)),dir=resolve(root,'.pilot-staging'),path=resolve(dir,'wrangler.json');
const config=JSON.parse(await readFile(path,'utf8'));
if(config.name!=='hamvara-pilot-staging'||String(config.vars?.PILOT_STAGING)!=='true'||config.d1_databases?.find(x=>x.binding==='DB')?.database_id!=='873e4f9d-df81-4a3a-bfda-86491e729ae8')throw Error('This helper supports only the existing Hamvara internal pilot.');
const target=resolve(dir,'assets/mrp'),oldConfig=await readFile(resolve(target,'config.js'),'utf8');
await mkdir(target,{recursive:true});await cp(resolve(root,'mrp'),target,{recursive:true});await writeFile(resolve(target,'config.js'),oldConfig);
config.vars.MRP_ROLE_POLICY_WORKSPACES='pilot-tr,pilot-us';
await writeFile(path,JSON.stringify(config,null,2)+'\n');
const sql=`-- Internal pilot access expansion approved by workspace owner; idempotent.
INSERT OR IGNORE INTO mrp_mobile_warehouse_grants (workspace_id,user_id,warehouse)
SELECT w.id,u.id,j.value->>'$.code' FROM mrp_workspaces w
JOIN mrp_users u ON u.workspace_id=w.id AND u.active=1
JOIN mrp_state s ON s.workspace_id=w.id
JOIN json_each(s.state_json,'$.warehouses') j
WHERE w.active=1 AND w.slug IN ('pilot-tr','pilot-us') AND w.id IN ('pilot-tr-workspace','pilot-us-workspace')
AND u.username IN ('operator','manager') AND u.role IN ('OPERATOR','PRODUCTION_MANAGER','FACTORY_MANAGER')
AND j.value->>'$.code' IN ('WH-RM','WH-PK','WH-FG','WH-SF')
AND COALESCE(j.value->>'$.active',1)!=0;
SELECT w.slug,u.username,g.warehouse FROM mrp_mobile_warehouse_grants g JOIN mrp_workspaces w ON w.id=g.workspace_id JOIN mrp_users u ON u.id=g.user_id AND u.workspace_id=g.workspace_id WHERE w.slug IN ('pilot-tr','pilot-us') ORDER BY w.slug,u.username,g.warehouse;
`;
await writeFile(resolve(dir,'role-policy-grants.sql'),sql);
console.log('Prepared assets, role-policy configuration and scoped pilot warehouse grants. Existing billing bindings and credentials preserved.');
