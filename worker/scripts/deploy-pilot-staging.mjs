import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {preparePilotStaging} from './prepare-pilot-staging.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const [id,confirmation]=process.argv.slice(2);
if(confirmation!=='--deploy-staging')throw Error('Usage: node worker/scripts/deploy-pilot-staging.mjs <separate-D1-UUID> --deploy-staging');
await preparePilotStaging(id);
const cli=resolve(root,'worker/node_modules/wrangler/bin/wrangler.js'),config=resolve(root,'.pilot-staging/wrangler.json');
const steps=[
 ['d1','migrations','apply','DB','--remote','--config',config],
 ['d1','execute','DB','--remote','--config',config,'--file',resolve(root,'.pilot-staging/seed.sql')],
 ['deploy','--config',config],
 ['secret','bulk',resolve(root,'.pilot-staging/secrets.json'),'--config',config]
];
for(const args of steps){const result=spawnSync(process.execPath,[cli,...args],{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
console.log('Staging deployment commands completed. Open the exact URL printed by Wrangler and verify /health before testing. Trial clocks remain PREPARED.');
