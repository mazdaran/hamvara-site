import test from 'node:test';
import assert from 'node:assert/strict';
import {customerPromise} from '../../mrp/promise-planning.js';

function state(){return{products:[{code:'FG',name:'Finished',outputSku:'FG',routingHours:1}],skus:[{code:'RM',name:'Raw',leadTime:5,safetyStock:0}],boms:{FG:[{sku:'RM',warehouse:'WH-RM',qty:2}]},bomProfiles:{},bomHistory:{},stock:{FG:{'WH-FG':20,reserved:0},RM:{'WH-RM':100,reserved:0}},orders:[{productCode:'FG',qty:8,due:'2026-09-20'}],productionJobs:[],capacityCalendar:{dailyHours:8,workDays:7,efficiencyPercent:100}}}

test('ATP confirms demand covered by uncommitted finished goods',()=>{const result=customerPromise(state(),{productCode:'FG',quantity:10,requestedDate:'2026-09-20',asOf:'2026-09-11'});assert.deepEqual({status:result.status,source:result.source,atp:result.availableToPromise,make:result.makeQty},{status:'CONFIRMED',source:'ATP_STOCK',atp:12,make:0})});
test('CTP confirms a producible shortfall inside material and capacity lead time',()=>{const result=customerPromise(state(),{productCode:'FG',quantity:20,requestedDate:'2026-09-20',asOf:'2026-09-11'});assert.equal(result.status,'CONFIRMED');assert.equal(result.makeQty,8);assert.equal(result.capacityDays,1)});
test('CTP proposes a later conditional date when material lead time misses request',()=>{const data=state();data.stock.RM['WH-RM']=0;data.skus[0].leadTime=15;const result=customerPromise(data,{productCode:'FG',quantity:20,requestedDate:'2026-09-20',asOf:'2026-09-11'});assert.deepEqual({status:result.status,promiseDate:result.promiseDate,lead:result.materialLeadDays},{status:'CONDITIONAL',promiseDate:'2026-09-26',lead:15})});
test('CTP blocks a promise without routing capacity',()=>{const data=state();data.products[0].routingHours=0;data.products[0].productionLeadTimeHours=0;const result=customerPromise(data,{productCode:'FG',quantity:20,requestedDate:'2026-09-20',asOf:'2026-09-11'});assert.equal(result.status,'BLOCKED')});
