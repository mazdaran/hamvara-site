import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPlanningCycle,completePlanningGate,planningCycleSummary} from '../../mrp/planning-cycle-control.js';

const state=()=>({planningCycles:[],auditTrail:[],sopPlans:[{id:'SOP-1',planNo:'SOP-1',status:'APPROVED'}],mpsSnapshots:[{id:'MPS-1',versionNo:'MPS-1',status:'FROZEN'}],mrpRuns:[{id:'MRP-1',runNo:'MRP-1',status:'RELEASED'}],productionSchedules:[{id:'SCH-1',scheduleNo:'SCH-1',status:'RELEASED'}],supplierSchedules:[{id:'SS-1',scheduleNo:'SS-1',status:'CONFIRMED'}],purchaseOrders:[],mrpExceptionLastSyncAt:'2026-09-11T08:00:00Z'});

test('planning cycle creates dated gates across the execution cadence',()=>{const value=state(),cycle=createPlanningCycle(value,{startDate:'2026-09-08',coordinator:'coordinator',reviewer:'manager'});assert.equal(cycle.gates.length,6);assert.equal(cycle.gates.find(item=>item.code==='MRP').dueDate,'2026-09-11');assert.equal(cycle.status,'OPEN')});

test('cycle creation requires independent governance and unique start date',()=>{const value=state();assert.throws(()=>createPlanningCycle(value,{startDate:'2026-09-08',coordinator:'same',reviewer:'same'}),/independent/i);createPlanningCycle(value,{startDate:'2026-09-08',coordinator:'c',reviewer:'r'});assert.throws(()=>createPlanningCycle(value,{startDate:'2026-09-08',coordinator:'c2',reviewer:'r2'}),/already exists/i)});

test('planning gates enforce dependency order and released evidence',()=>{const value=state(),cycle=createPlanningCycle(value,{startDate:'2026-09-08',coordinator:'c',reviewer:'r'});assert.throws(()=>completePlanningGate(value,cycle.id,'MPS',{owner:'planner',reviewedBy:'manager',evidenceReference:'MPS-1',evidenceNote:'Frozen plan reviewed'}),/prerequisite/i);assert.throws(()=>completePlanningGate(value,cycle.id,'SOP',{owner:'planner',reviewedBy:'manager',evidenceReference:'BAD',evidenceNote:'Approved plan reviewed'}),/Valid released evidence/i);completePlanningGate(value,cycle.id,'SOP',{owner:'planner',reviewedBy:'manager',evidenceReference:'SOP-1',evidenceNote:'Approved plan reviewed'});assert.equal(cycle.gates[0].status,'COMPLETED')});

test('gate reviewer must be independent from its owner',()=>{const value=state(),cycle=createPlanningCycle(value,{startDate:'2026-09-08',coordinator:'c',reviewer:'r'});assert.throws(()=>completePlanningGate(value,cycle.id,'SOP',{owner:'planner',reviewedBy:'planner',evidenceReference:'SOP-1',evidenceNote:'Approved plan reviewed'}),/independent/i)});

test('all evidenced gates close the planning cycle',()=>{const value=state(),cycle=createPlanningCycle(value,{startDate:'2026-09-08',coordinator:'c',reviewer:'r'}),refs={SOP:'SOP-1',MPS:'MPS-1',MRP:'MRP-1',SCHEDULE:'SCH-1',SUPPLIER:'SS-1',EXCEPTION:''};for(const code of ['SOP','MPS','MRP','SCHEDULE','SUPPLIER','EXCEPTION'])completePlanningGate(value,cycle.id,code,{owner:`${code}-owner`,reviewedBy:'manager',evidenceReference:refs[code],evidenceNote:`${code} evidence was reviewed`});assert.equal(cycle.status,'CLOSED');assert.equal(planningCycleSummary(value,{asOf:'2026-09-20'}).overdue,0)});

test('summary flags overdue incomplete gates',()=>{const value=state();createPlanningCycle(value,{startDate:'2026-09-01',coordinator:'c',reviewer:'r'});const summary=planningCycleSummary(value,{asOf:'2026-09-10'});assert.equal(summary.overdue,6);assert.equal(summary.openCycles,1)});

test('planning-cycle interface identifiers are unique',()=>{const html=readFileSync(new URL('../../mrp/index.html',import.meta.url),'utf8');for(const id of ['planningCycleStatus','planningCycleStart','planningCycleCoordinator','planningCycleReviewer','planningGateOwner','planningGateReference','planningGateEvidence','createPlanningCycle','planningCycleKpis','planningCycleTable'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1)});
