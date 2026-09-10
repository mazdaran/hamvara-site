import test from 'node:test';
import assert from 'node:assert/strict';
import {accountingComplianceStatus,accountingProfilePolicy,closeAccountingPeriod,createAccountingPeriod,normalizeFinancialState,postJournalEntry,reverseJournalEntry,setAccountingProfile,trialBalance} from '../../mrp/financial-core.js';

const state=()=>{const value={settings:{currency:'TRY'},auditTrail:[]};normalizeFinancialState(value);createAccountingPeriod(value,{id:'P1',code:'2026-09',startDate:'2026-09-01',endDate:'2026-09-30'});return value};

test('financial core defaults to IFRS/TFRS profile and manufacturing accounts',()=>{const value=state();assert.equal(value.accountingSettings.profile,'IFRS_TFRS');assert.ok(value.chartOfAccounts.some(item=>item.code==='1220'));assert.ok(value.chartOfAccounts.some(item=>item.code==='5150'))});

test('posted journals enforce double entry and open periods',()=>{const value=state();assert.throws(()=>postJournalEntry(value,{date:'2026-09-10',lines:[{accountCode:'1200',debit:100},{accountCode:'2000',credit:90}]}),/not balanced/);const entry=postJournalEntry(value,{id:'J1',date:'2026-09-10',description:'Material receipt',lines:[{accountCode:'1200',debit:100},{accountCode:'2000',credit:100}]},{user:'accountant',role:'ACCOUNTING'});assert.equal(entry.status,'POSTED');assert.equal(entry.totalDebit,100);assert.equal(value.auditTrail[0].action,'JOURNAL_POSTED')});

test('closed periods block posting and require accounting authority',()=>{const value=state();assert.throws(()=>closeAccountingPeriod(value,'P1',{role:'OPERATOR'}),/Accounting or CEO/);closeAccountingPeriod(value,'P1',{role:'ACCOUNTING'});assert.throws(()=>postJournalEntry(value,{date:'2026-09-12',lines:[{accountCode:'1200',debit:1},{accountCode:'2000',credit:1}]}),/CLOSED/)});

test('reversal preserves the original and posts opposite lines',()=>{const value=state(),entry=postJournalEntry(value,{id:'J1',date:'2026-09-10',lines:[{accountCode:'1200',debit:250},{accountCode:'2000',credit:250}]});const reversal=reverseJournalEntry(value,entry.id,{date:'2026-09-11',reason:'Wrong supplier'});assert.equal(entry.reversedBy,reversal.id);assert.equal(reversal.lines[0].credit,250);assert.equal(trialBalance(value).every(row=>row.balance===0),true)});

test('periods cannot overlap',()=>{const value=state();assert.throws(()=>createAccountingPeriod(value,{startDate:'2026-09-15',endDate:'2026-10-15'}),/cannot overlap/)});

test('profiles expose distinct statutory and inventory policies',()=>{assert.equal(accountingProfilePolicy('US_GAAP').lifo,true);assert.equal(accountingProfilePolicy('IFRS_TFRS').lifo,false);assert.equal(accountingProfilePolicy('MANAGEMENT_ONLY').statutory,false)});

test('profile can be selected before posting and is locked afterwards',()=>{const value=state();setAccountingProfile(value,'US_GAAP',{user:'controller'});assert.equal(value.accountingSettings.profile,'US_GAAP');postJournalEntry(value,{date:'2026-09-10',lines:[{accountCode:'1200',debit:10},{accountCode:'2000',credit:10}]});assert.throws(()=>setAccountingProfile(value,'IFRS_TFRS'),/locked after/)});

test('a profile change rejects incompatible SKU methods',()=>{const value=state();value.accountingSettings.profile='US_GAAP';value.skus=[{code:'RM-1',costMethod:'LIFO'}];assert.throws(()=>setAccountingProfile(value,'MANAGEMENT_ONLY'),/prohibited/)});

test('compliance status separates operational readiness from formal compliance',()=>{const value={settings:{currency:'TRY'},auditTrail:[],skus:[]};normalizeFinancialState(value);const result=accountingComplianceStatus(value);assert.equal(result.readiness,'CONFIGURATION_REQUIRED');assert.match(result.complianceClaim,/formal compliance/)});
