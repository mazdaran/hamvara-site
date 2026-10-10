import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {preparePilotStaging} from '../scripts/prepare-pilot-staging.mjs';
import staging from '../src/pilot-staging.js';

test('pilot staging rejects production and preserves independent prepared TR/US tenants on re-seed',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'hamvara-pilot-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await assert.rejects(preparePilotStaging('bc036eef-2f9d-46cf-a468-cd9a0fb42a87',dir));
 const {config}=await preparePilotStaging('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',dir);
 assert.equal(config.vars.PILOT_STAGING,'true');assert.equal(config.triggers,undefined);assert.equal(config.ai,undefined);assert.equal(config.r2_buckets,undefined);
 const first=await readFile(join(dir,'credentials.json'),'utf8');
 await preparePilotStaging('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',dir);assert.equal(await readFile(join(dir,'credentials.json'),'utf8'),first);
 await assert.rejects(preparePilotStaging('bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee',dir));
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 for(const migration of ['0002_mrp_saas','0004_mrp_mobile_scan','0013_mobile_receipts','0014_mrp_workspace_profiles','0015_mrp_trial_lifecycle'])db.exec(await readFile(new URL('../migrations/'+migration+'.sql',import.meta.url),'utf8'));
 const sql=await readFile(join(dir,'seed.sql'),'utf8');db.exec(sql);db.exec(sql);
 assert.equal(db.prepare('SELECT count(*) AS n FROM mrp_workspaces').get().n,2);
 assert.equal(db.prepare('SELECT count(*) AS n FROM mrp_users').get().n,6);
 assert.equal(db.prepare('SELECT count(*) AS n FROM mrp_trials WHERE starts_at IS NULL').get().n,2);
 assert.deepEqual(db.prepare('SELECT currency FROM mrp_workspace_profiles ORDER BY currency').all().map(x=>x.currency),['TRY','USD']);
 assert.ok(!(await readFile(join(dir,'assets/mrp/config.js'),'utf8')).includes('workers.dev'));
});

test('staging blocks other origins and unrelated APIs and marks assets noindex',async()=>{
 const req=p=>new Request('https://pilot.example'+p),env={PILOT_STAGING:'true',DB:{},ASSETS:{fetch:async()=>new Response('asset')}};
 assert.equal((await staging.fetch(req('/health'),{})).status,503);
 assert.equal((await (await staging.fetch(req('/health'),env)).json()).environment,'pilot-staging');
 assert.equal((await staging.fetch(req('/api/sku-bridge/analyze'),env)).status,404);
 assert.equal((await staging.fetch(new Request('https://pilot.example/api/mrp/session',{headers:{Origin:'https://hamvara.com'}}),env)).status,403);
 assert.equal((await staging.fetch(req('/mrp/'),env)).headers.get('X-Robots-Tag'),'noindex, nofollow');
});
