import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('production acceptance uses an isolated tenant and always cleans it up',async()=>{const source=await readFile(new URL('../scripts/run-mrp-production-acceptance.mjs',import.meta.url),'utf8');assert.match(source,/try\{/);assert.match(source,/finally\{/);assert.match(source,/DELETE FROM mrp_audit_seals/);assert.match(source,/DELETE FROM mrp_workspaces/);assert.match(source,/temporary acceptance tenant was removed/);assert.doesNotMatch(source,/MRP_AUDIT_HMAC_SECRET/);});
test('manual acceptance workflow requires explicit production confirmation',async()=>{const source=await readFile(new URL('../../.github/workflows/mrp-production-acceptance.yml',import.meta.url),'utf8');assert.match(source,/RUN-MRP-ACCEPTANCE/);assert.match(source,/environment: production/);assert.match(source,/MRP_ACCEPTANCE_API_BASE/);});
