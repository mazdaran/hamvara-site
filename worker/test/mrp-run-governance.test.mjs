import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareMrpRuns,buildMrpRun,createMrpRun,reviewMrpRun,releaseMrpRun} from '../../mrp/mrp-run-governance.js';

const state=()=>({products:[],skus:[],orders:[],plannedSupplyOrders:[],purchaseOrders:[],mpsSnapshots:[{id:'MPS-1',status:'FROZEN'}],mrpRuns:[],auditTrail:[]});

test('MRP comparison reports new changed and removed requirements',()=>{const previous={rows:[{key:'A',orderNo:'O1',sku:'RM1',plannedQuantity:10,releaseDate:'2026-09-10',status:'PLANNED'},{key:'B',orderNo:'O2',sku:'RM2',plannedQuantity:5,releaseDate:'2026-09-11',status:'PLANNED'}]},current={rows:[{key:'A',orderNo:'O1',sku:'RM1',plannedQuantity:12,releaseDate:'2026-09-09',status:'PLANNED'},{key:'C',orderNo:'O3',sku:'RM3',plannedQuantity:7,releaseDate:'2026-09-12',status:'PLANNED'}]};const changes=compareMrpRuns(previous,current);assert.deepEqual(changes.map(row=>row.type).sort(),['CHANGED','NEW','REMOVED']);assert.equal(changes.find(row=>row.key==='A').quantityChange,2)});

test('net-change run requires a released baseline',()=>{assert.throws(()=>buildMrpRun(state(),{asOf:'2026-09-11',mode:'NET_CHANGE'}),/released MRP baseline/i)});

test('governed MRP run requires a frozen MPS and planner',()=>{const value=state();value.mpsSnapshots=[];assert.throws(()=>createMrpRun(value,{plannedBy:'planner'}),/Freeze an MPS/i);value.mpsSnapshots=[{id:'MPS-1',status:'FROZEN'}];assert.throws(()=>createMrpRun(value,{}),/planner identity/i)});

test('review and release enforce three independent identities',()=>{const value=state(),run=createMrpRun(value,{asOf:'2026-09-11',mode:'FULL',plannedBy:'planner'},{at:'2026-09-11T08:00:00Z'});assert.throws(()=>reviewMrpRun(value,run.id,{reviewedBy:'planner',decision:'Reviewed all exceptions'}),/independent/i);reviewMrpRun(value,run.id,{reviewedBy:'reviewer',decision:'Reviewed all planning exceptions'});assert.throws(()=>releaseMrpRun(value,run.id,{releasedBy:'reviewer'}),/independent/i);releaseMrpRun(value,run.id,{releasedBy:'manager'});assert.equal(run.status,'RELEASED')});

test('a new released MRP run supersedes the prior baseline',()=>{const value=state(),first=createMrpRun(value,{asOf:'2026-09-11',mode:'FULL',plannedBy:'p1'});reviewMrpRun(value,first.id,{reviewedBy:'r1',decision:'First baseline reviewed'});releaseMrpRun(value,first.id,{releasedBy:'a1'});const second=createMrpRun(value,{asOf:'2026-09-12',mode:'NET_CHANGE',plannedBy:'p2'});reviewMrpRun(value,second.id,{reviewedBy:'r2',decision:'Net change run reviewed'});releaseMrpRun(value,second.id,{releasedBy:'a2'});assert.equal(first.status,'SUPERSEDED');assert.equal(second.status,'RELEASED');assert.equal(second.baselineRunId,first.id)});

test('MRP run interface identifiers are unique',()=>{const html=readFileSync(new URL('../../mrp/index.html',import.meta.url),'utf8');for(const id of ['governedMrpPreviewStatus','governedMrpAsOf','governedMrpHorizon','governedMrpMode','governedMrpPlanner','governedMrpReviewer','governedMrpApprover','governedMrpDecision','createGovernedMrpRun','governedMrpKpis','governedMrpRunTable','governedMrpChangeTable'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1)});
