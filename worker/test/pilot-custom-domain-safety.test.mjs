import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/check-pilot-staging.mjs',import.meta.url));

// This test deliberately sends invalid hosts: they MUST be rejected before
// a network request or any read of private .pilot-staging credentials.
test('pilot staging acceptance refuses every unapproved lookalike origin',()=>{
 const untrusted=[
  'https://hamvara-pilot-staging.attacker.workers.dev/',
  'https://pilot.hamvara.com.evil.example/',
  'http://pilot.hamvara.com/',
  'https://pilot.hamvara.com:8443/',
  'https://pilot.hamvara.com@evil.example/',
  'https://pilot.hamvara.com/api/mrp/session',
  'https://pilot.hamvara.com/?next=other',
  'https://pilot.hamvara.com/#token',
  'https://hamvara-pilot-staging.yahya-mazdarani.workers.dev.evil.example/'
 ];
 for(const uri of untrusted){
  const result=spawnSync(process.execPath,[script,uri],{encoding:'utf8',timeout:5000});
  assert.notEqual(result.status,0,'should reject '+uri);
  assert.match(result.stderr,/exact approved pilot\.hamvara\.com/i,'should fail before I/O for '+uri);
 }
});
