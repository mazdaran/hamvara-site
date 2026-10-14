import test from 'node:test';
import assert from 'node:assert/strict';
import {hasProductionOrigin,isHamvaraSearchConsoleProperty} from '../src/security.js';
test('production origin detection uses exact equality, not substring matching',()=>{
  assert.equal(hasProductionOrigin(['https://www.hamvara.com']),true);
  assert.equal(hasProductionOrigin(['https://www.hamvara.com.evil.example']),false);
  assert.equal(hasProductionOrigin(['https://evil.example/www.hamvara.com']),false);
  assert.equal(hasProductionOrigin(['https://hamvara.com']),false); // Keep existing staging semantics.
});
test('Search Console domain properties only match Hamvara hostnames',()=>{
  for(const site of ['sc-domain:hamvara.com','sc-domain:sub.hamvara.com','https://hamvara.com/','https://www.hamvara.com/','http://docs.hamvara.com/'])assert.equal(isHamvaraSearchConsoleProperty(site),true,site);
  for(const site of ['sc-domain:hamvara.com.evil.example','sc-domain:not-hamvara.com','https://hamvara.com.evil.example/','https://evil.example/hamvara.com','https://nothamvara.com/','javascript:hamvara.com','not a url',null])assert.equal(isHamvaraSearchConsoleProperty(site),false,String(site));
});
