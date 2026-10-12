import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('production jobs require both main and explicit confirmation',()=>{
 for(const [file,confirmation] of [['deploy-worker-manual.yml','DEPLOY-PRODUCTION'],['deploy-support-manual.yml','DEPLOY-SUPPORT'],['migrate-d1-manual.yml','MIGRATE-PRODUCTION']]) {
  const source=read('.github/workflows/'+file);
  const expression=source.match(/if: \$\{\{ (.*?) \}\}/)[1];
  for(const ref of ['refs/heads/main','refs/heads/feature','refs/tags/v1']) for(const value of [confirmation,'wrong']) {
   assert.equal(vm.runInNewContext(expression,{github:{ref},inputs:{confirmation:value}}),ref==='refs/heads/main'&&value===confirmation);
  }
  assert.match(source,/environment: production/);
 }
});
test('preview configuration has no production resources and handler cannot access them',async()=>{
 const config=JSON.parse(read('worker/wrangler.preview.json'));
 assert.equal(config.name,'hamvara-isolated-preview');
 for(const key of ['d1_databases','r2_buckets','ai','services','triggers','vars'])assert.equal(config[key],undefined);
 const source=read('worker/src/isolated-preview.js');
 const preview=await import('data:text/javascript,'+encodeURIComponent(source));
 for(const method of ['GET','POST','PUT']) {
  const response=await preview.default.fetch(new Request('https://preview.test/api/mrp/state',{method}),new Proxy({},{get(){throw Error('Resource accessed');}}));
  assert.equal(response.status,503);
 }
 const root=read('wrangler.toml');assert.match(root,/preview_urls = false/);
 assert.match(root,/database_id = "bc036eef-2f9d-46cf-a468-cd9a0fb42a87"/);
});
