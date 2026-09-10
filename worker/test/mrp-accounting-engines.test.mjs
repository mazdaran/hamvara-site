import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStatutoryReport,evaluateInventoryUnderActiveEngine,proposeInventoryAdjustment} from '../../mrp/accounting-engines.js';
import {createAccountingPeriod,normalizeFinancialState,postJournalEntry} from '../../mrp/financial-core.js';

function state(profile='IFRS_TFRS'){const value={settings:{currency:'USD'},accountingSettings:{profile,baseCurrency:'USD'},auditTrail:[],skus:[]};normalizeFinancialState(value);createAccountingPeriod(value,{id:'P1',code:'2026',startDate:'2026-01-01',endDate:'2026-12-31'});postJournalEntry(value,{date:'2026-06-01',lines:[{accountCode:'1100',debit:1000},{accountCode:'4000',credit:1000}]});postJournalEntry(value,{date:'2026-06-02',lines:[{accountCode:'5000',debit:400},{accountCode:'1200',credit:400}]});return value}

test('IFRS engine produces IFRS-labelled performance and balanced position controls',()=>{const report=buildStatutoryReport(state(),{from:'2026-01-01',to:'2026-12-31'});assert.equal(report.engine,'IFRS_TFRS');assert.equal(report.rows.find(row=>row.line==='Revenue').amount,1000);assert.equal(report.rows.find(row=>row.line==='Profit for the period').amount,600);assert.equal(report.rows.find(row=>row.line==='Balance check').amount,0)});

test('US GAAP engine produces a multi-step income statement',()=>{const report=buildStatutoryReport(state('US_GAAP'),{from:'2026-01-01',to:'2026-12-31'});assert.equal(report.engine,'US_GAAP');assert.equal(report.rows.find(row=>row.line==='Gross profit').amount,600);assert.equal(report.rows.find(row=>row.line==='Net income').amount,600)});

test('IFRS inventory engine permits a bounded reversal',()=>{const value=state(),result=evaluateInventoryUnderActiveEngine(value,{historicalCost:100,nrv:95,carryingValue:80,previousWriteDown:20});assert.deepEqual({target:result.targetValue,adjustment:result.adjustment,status:result.status},{target:95,adjustment:15,status:'REVERSAL'});assert.equal(proposeInventoryAdjustment(value,{historicalCost:100,nrv:95,carryingValue:80,previousWriteDown:20}).lines[0].accountCode,'1240')});

test('US GAAP engine blocks a reversal and applies LIFO market bounds',()=>{const value=state('US_GAAP'),reversal=evaluateInventoryUnderActiveEngine(value,{method:'FIFO',historicalCost:100,nrv:110,carryingValue:80});assert.equal(reversal.status,'REVERSAL_PROHIBITED');assert.equal(reversal.adjustment,0);const lifo=evaluateInventoryUnderActiveEngine(value,{method:'LIFO',historicalCost:100,nrv:90,replacementCost:70,normalProfit:10,carryingValue:100});assert.deepEqual({target:lifo.targetValue,adjustment:lifo.adjustment},{target:80,adjustment:-20})});
