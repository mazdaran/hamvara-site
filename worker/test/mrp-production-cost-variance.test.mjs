import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFinancialState,createAccountingPeriod} from '../../mrp/financial-core.js';
import {productionCostVariance,postProductionCostVariance} from '../../mrp/production-cost-variance.js';

function state(){const value={settings:{currency:'TRY'},skus:[{code:'RM-1',cost:4}],productionJobs:[{id:'J1',workOrderNo:'WO-1',batchNo:'B-1',status:'COMPLETED',plannedQty:10,completedQty:9,scrapQty:1,standardUnitCost:10,laborCost:2,overheadCost:1,otherCost:0,materials:[{sku:'RM-1',name:'Steel',warehouse:'WH-RM',required:20,standardUnitCost:4,actualQuantity:22,actualUnitCost:5}],scrapLoss:10,reworkCost:2,downtimeCost:3}],operators:[{id:'OP1',hourlyRate:20}],workCenters:[{id:'WC1',hourlyRate:10,overheadRate:5}],operationSessions:[{jobId:'J1',status:'COMPLETED',operatorId:'OP1',workCenterId:'WC1',actualMinutes:60}],auditTrail:[]};normalizeFinancialState(value);createAccountingPeriod(value,{id:'P1',code:'2026-09',startDate:'2026-09-01',endDate:'2026-09-30'});return value}

test('production variance separates price, usage, labor, overhead and operating losses',()=>{const result=productionCostVariance(state(),'J1');assert.equal(result.materialPriceVariance,22);assert.equal(result.materialUsageVariance,8);assert.equal(result.laborVariance,0);assert.equal(result.overheadVariance,5);assert.equal(result.scrapReworkVariance,12);assert.equal(result.downtimeVariance,3);assert.equal(result.totalVariance,50);assert.equal(result.result,'UNFAVORABLE')});

test('production variance posts a balanced journal once',()=>{const value=state(),journal=postProductionCostVariance(value,'J1',{date:'2026-09-11',meta:{user:'accountant',role:'ACCOUNTING'}});assert.equal(journal.source,'PRODUCTION_VARIANCE');assert.equal(journal.totalDebit,journal.totalCredit);assert.equal(value.productionVariancePostings.length,1);assert.throws(()=>postProductionCostVariance(value,'J1',{date:'2026-09-11'}),/already been posted/)});
