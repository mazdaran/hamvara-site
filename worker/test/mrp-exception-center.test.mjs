import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {syncMrpExceptions,assignMrpException,resolveMrpException,verifyMrpException,mrpExceptionSummary} from '../../mrp/mrp-exception-center.js';

const base=()=>({products:[],skus:[],orders:[],plannedSupplyOrders:[],auditTrail:[],mpsSnapshots:[{status:'FROZEN',versionNo:'MPS-1',exceptions:[{code:'OVERLOAD',reference:'WC-1',message:'Capacity overloaded'}]}],productionSchedules:[]});

test('synchronization creates stable non-duplicated exception actions',()=>{const state=base(),meta={user:'planner',at:'2026-09-11T08:00:00Z'};const first=syncMrpExceptions(state,{asOf:'2026-09-11',defaultOwner:'owner',dueDate:'2026-09-14',meta}),second=syncMrpExceptions(state,{asOf:'2026-09-11',meta:{...meta,at:'2026-09-11T09:00:00Z'}});assert.equal(first.created,1);assert.equal(second.created,0);assert.equal(state.mrpExceptionActions.length,1);assert.equal(state.mrpExceptionActions[0].occurrences,2)});

test('assignment requires accountable fields',()=>{const state=base();syncMrpExceptions(state,{asOf:'2026-09-11'});assert.throws(()=>assignMrpException(state,state.mrpExceptionActions[0].id,{owner:'planner',dueDate:'',decision:'fix it'}),/required/i)});

test('resolution and verification enforce independent closure',()=>{const state=base();syncMrpExceptions(state,{asOf:'2026-09-11'});const id=state.mrpExceptionActions[0].id;assignMrpException(state,id,{owner:'planner',dueDate:'2026-09-14',decision:'Correct capacity plan'});resolveMrpException(state,id,{resolvedBy:'planner',resolution:'Capacity calendar corrected'});assert.throws(()=>verifyMrpException(state,id,{verifiedBy:'planner',evidence:'Reviewed corrected plan',confirmedCleared:true}),/independent/i);verifyMrpException(state,id,{verifiedBy:'manager',evidence:'Reviewed corrected capacity plan',confirmedCleared:true});assert.equal(state.mrpExceptionActions[0].status,'VERIFIED')});

test('recurrence reopens a verified exception and preserves history',()=>{const state=base();syncMrpExceptions(state,{asOf:'2026-09-11'});const id=state.mrpExceptionActions[0].id;assignMrpException(state,id,{owner:'planner',dueDate:'2026-09-14',decision:'Correct capacity plan'});resolveMrpException(state,id,{resolvedBy:'planner',resolution:'Capacity calendar corrected'});verifyMrpException(state,id,{verifiedBy:'manager',evidence:'Reviewed corrected capacity plan',confirmedCleared:true});const result=syncMrpExceptions(state,{asOf:'2026-09-12'});assert.equal(result.reopened,1);assert.equal(state.mrpExceptionActions[0].status,'ASSIGNED');assert.ok(state.mrpExceptionActions[0].history.some(row=>row.action==='REOPENED'))});

test('summary counts overdue open actions but not verified actions',()=>{const state=base();syncMrpExceptions(state,{asOf:'2026-09-11',defaultOwner:'planner',dueDate:'2026-09-12'});assert.equal(mrpExceptionSummary(state,{asOf:'2026-09-13'}).overdue,1)});

test('exception center interface identifiers are unique',()=>{const html=readFileSync(new URL('../../mrp/index.html',import.meta.url),'utf8');for(const id of ['mrpActionLastSync','mrpActionOwner','mrpActionDue','mrpActionDecision','mrpActionResolver','mrpActionResolution','mrpActionVerifier','mrpActionEvidence','mrpActionCleared','syncMrpExceptionCenter','mrpActionKpis','mrpActionTable'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1)});
