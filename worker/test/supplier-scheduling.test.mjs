import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSupplierSchedule,respondSupplierSchedule,proposeSupplierReschedule,decideSupplierReschedule,supplierSchedulePerformance,supplierScheduleSummary} from '../../mrp/supplier-scheduling.js';

const base=()=>({purchaseOrders:[{id:'PO-ID',poNo:'PO-1',prNo:'PR-1',supplierCode:'SUP-1',sku:'RM-1',qty:100,dueDate:'2026-09-20',status:'APPROVED'}],supplierSchedules:[],receipts:[],auditTrail:[]});
const create=state=>createSupplierSchedule(state,{purchaseOrderId:'PO-ID',buyer:'buyer',supplierRepresentative:'supplier',requestedDate:'2026-09-20',requestedQty:100},{user:'buyer',at:'2026-09-11T08:00:00Z'});

test('approved PO creates only one active supplier schedule',()=>{const state=base(),item=create(state);assert.equal(item.status,'REQUESTED');assert.equal(item.poNo,'PO-1');assert.throws(()=>create(state),/already exists/i)});

test('supplier confirms the full requested quantity and committed date',()=>{const state=base(),item=create(state);assert.throws(()=>respondSupplierSchedule(state,item.id,{supplierRepresentative:'supplier',accepted:true,committedDate:'2026-09-22',committedQty:90}),/full requested quantity/i);respondSupplierSchedule(state,item.id,{supplierRepresentative:'supplier',accepted:true,committedDate:'2026-09-22',committedQty:100});assert.equal(item.status,'CONFIRMED');assert.equal(item.committedQty,100)});

test('supplier rejection requires a documented reason',()=>{const state=base(),item=create(state);assert.throws(()=>respondSupplierSchedule(state,item.id,{supplierRepresentative:'supplier',accepted:false,note:'no'}),/reason/i);respondSupplierSchedule(state,item.id,{supplierRepresentative:'supplier',accepted:false,note:'Capacity unavailable'});assert.equal(item.status,'REJECTED')});

test('reschedule requires independent management approval and preserves revision history',()=>{const state=base(),item=create(state);respondSupplierSchedule(state,item.id,{supplierRepresentative:'supplier',accepted:true,committedDate:'2026-09-20',committedQty:100});proposeSupplierReschedule(state,item.id,{proposedBy:'buyer',proposedDate:'2026-09-23',proposedQty:100,reason:'Carrier capacity moved delivery'});assert.throws(()=>decideSupplierReschedule(state,item.id,{approvedBy:'buyer',approved:true}),/independent/i);decideSupplierReschedule(state,item.id,{approvedBy:'manager',approved:true});assert.equal(item.status,'CONFIRMED');assert.equal(item.revision,2);assert.equal(item.committedDate,'2026-09-23')});

test('actual PO receipts close the loop and calculate delivery variance',()=>{const state=base(),item=create(state);respondSupplierSchedule(state,item.id,{supplierRepresentative:'supplier',accepted:true,committedDate:'2026-09-20',committedQty:100});state.receipts.push({purchaseOrderNo:'PO-1',qty:100,date:'2026-09-22',status:'PENDING_QC'});const row=supplierSchedulePerformance(state,item,{asOf:'2026-09-22'});assert.equal(row.executionStatus,'LATE_RECEIPT');assert.equal(row.deliveryVarianceDays,2);assert.equal(row.openQty,0);assert.equal(supplierScheduleSummary(state,{asOf:'2026-09-22'}).late,1)});

test('unreceived commitments become late after their due date',()=>{const state=base(),item=create(state);respondSupplierSchedule(state,item.id,{supplierRepresentative:'supplier',accepted:true,committedDate:'2026-09-20',committedQty:100});assert.equal(supplierSchedulePerformance(state,item,{asOf:'2026-09-21'}).executionStatus,'LATE')});

test('supplier scheduling interface identifiers are unique',()=>{const html=readFileSync(new URL('../../mrp/index.html',import.meta.url),'utf8');for(const id of ['supplierSchedulePo','supplierScheduleBuyer','supplierScheduleContact','supplierScheduleDate','supplierScheduleQty','supplierCommitDate','supplierCommitQty','supplierScheduleManager','supplierScheduleReason','createSupplierSchedule','supplierScheduleKpis','supplierScheduleTable'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1)});
