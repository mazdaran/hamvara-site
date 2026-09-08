import test from 'node:test';import assert from 'node:assert/strict';
import {ensureBomProfile,addBomVariable,saveBomRevision} from '../../mrp/bom-workflow.js';

test('BOM profile stores a versioned snapshot without mutating history',()=>{const state={boms:{P1:[{sku:'RM1',qty:2,warehouse:'WH-RM'}]}};const profile=ensureBomProfile(state,'P1');profile.version='2.3';profile.model='M-A';addBomVariable(state,'P1');profile.variables[0]={name:'Temperature',value:'180',unit:'C',category:'PROCESS',required:true};const saved=saveBomRevision(state,'P1',{user:'planner',device:'PC-01',at:'2026-09-08T10:00:00Z'});profile.variables[0].value='190';assert.equal(saved.version,'2.3');assert.equal(saved.variables[0].value,'180');assert.equal(state.bomHistory.P1.length,1)});

test('BOM profile enforces twenty process variables in addition to materials',()=>{const state={boms:{P1:Array.from({length:30},(_,i)=>({sku:`RM${i}`,qty:1}))}};for(let i=0;i<20;i++)addBomVariable(state,'P1');assert.throws(()=>addBomVariable(state,'P1'),/at most 20/);assert.equal(state.boms.P1.length,30)});
