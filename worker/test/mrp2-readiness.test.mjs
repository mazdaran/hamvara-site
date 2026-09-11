import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mrp2Readiness} from '../../mrp/mrp2-readiness.js';

test('empty system reports configuration work without claiming certification',()=>{const report=mrp2Readiness({});assert.equal(report.readiness,'CONFIGURATION_REQUIRED');assert.equal(report.pillars.length,9);assert.match(report.assessmentClaim,/not a certification/i)});

test('missing BOM and demanded product routing are blocking controls',()=>{const report=mrp2Readiness({products:[{code:'FG-1'}],orders:[{productCode:'FG-1',status:'OPEN'}]});assert.equal(report.readiness,'BLOCKED');assert.equal(report.pillars.find(item=>item.code==='BOM').status,'BLOCKED');assert.equal(report.pillars.find(item=>item.code==='CRP').status,'BLOCKED')});

test('unbalanced posted journals block financial readiness',()=>{const report=mrp2Readiness({journalEntries:[{status:'POSTED',lines:[{debit:10,credit:0},{debit:0,credit:9}]}]});assert.equal(report.pillars.find(item=>item.code==='FINANCE').status,'BLOCKED')});

test('complete operating evidence reaches operational readiness',()=>{const state={products:[{code:'FG-1'}],skus:[{code:'RM-1'}],orders:[{productCode:'FG-1',status:'OPEN'}],planningTimeFences:{demandDays:7,planningDays:21},bomHistory:{'FG-1':[{version:'1'}]},plannedSupplyOrders:[{status:'RELEASED'}],shiftCalendars:[{active:true}],workCenters:[{active:true}],productRoutings:[{productCode:'FG-1',requiredSkill:'CUT',active:true}],operators:[{active:true,skills:['CUT']}],productionJobs:[{id:'J1'}],operationSessions:[{jobId:'J1',status:'COMPLETED'}],wipSettlements:[{jobId:'J1'}],capacityFeedbackActions:[{jobId:'J1'}],accountingPeriods:[{status:'OPEN'}],journalEntries:[{status:'POSTED',lines:[{debit:10,credit:0},{debit:0,credit:10}]}],engineeringChanges:[{status:'RELEASED'}],auditTrail:[{action:'ECO_RELEASED'}]};const report=mrp2Readiness(state);assert.equal(report.readiness,'OPERATIONAL');assert.equal(report.score,100);assert.equal(report.operational,9)});

test('readiness dashboard identifiers are unique',()=>{const html=readFileSync(new URL('../../mrp/index.html',import.meta.url),'utf8');for(const id of ['mrp2ReadinessStatus','mrp2ReadinessKpis','mrp2ReadinessTable','mrp2ReadinessClaim'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1)});
