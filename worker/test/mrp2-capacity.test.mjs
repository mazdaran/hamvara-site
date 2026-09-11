import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMrp2Capacity,addRoutingOperation,finiteCapacityPlan} from '../../mrp/mrp2-capacity.js';

function sample(){return{shiftCalendars:[{id:'S-A',code:'A',name:'Day',dailyHours:8,workDays:5,efficiencyPercent:100,active:true}],workCenters:[{id:'WC-1',code:'CUT',name:'Cutting',machine:'Laser',shiftCode:'A',machineCount:1,availabilityPercent:100,active:true}],operators:[{id:'OP-1',name:'Ayla',shift:'A',dailyHours:8,efficiencyPercent:100,active:true}],productRoutings:[]}}

test('normalization creates a usable default shift calendar',()=>{const state={workCenters:[],operators:[]};normalizeMrp2Capacity(state);assert.equal(state.shiftCalendars[0].code,'A');assert.equal(state.shiftCalendars[0].dailyHours,8)});
test('routing operation is assigned to the selected product and work center',()=>{const state=sample(),route=addRoutingOperation(state,{productCode:'FG-1',operationCode:'CUTTING',runMinutesPerUnit:2});assert.equal(route.workCenterId,'WC-1');assert.equal(route.sequence,1)});
test('finite capacity exposes overloaded work center and labor shortage by shift',()=>{const state=sample();addRoutingOperation(state,{productCode:'FG-1',operationCode:'CUTTING',setupMinutes:60,runMinutesPerUnit:30,laborMinutesPerUnit:30,operatorsRequired:1});const plan=finiteCapacityPlan(state,{rows:[{productCode:'FG-1',plannedQty:100}]});assert.equal(plan.centers[0].requiredHours,51);assert.equal(plan.centers[0].status,'OVERLOADED');assert.equal(plan.laborByShift[0].requiredHours,50);assert.equal(plan.laborByShift[0].shortageHours,10);assert.equal(plan.bottleneck.code,'CUT')});
test('products with demand and no routing are blocked from a complete MRP II plan',()=>{const plan=finiteCapacityPlan(sample(),{rows:[{productCode:'FG-1',plannedQty:10}]});assert.deepEqual(plan.unroutedProducts,[{productCode:'FG-1',plannedQty:10}])});
