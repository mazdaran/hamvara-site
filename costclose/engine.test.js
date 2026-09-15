'use strict';
const assert=require('assert');
const {calculate}=require('./app.js');

const normal=calculate([
  {sku:'A',qty:10,weight:10,volume:1,estUnit:10,actualUnit:12,selling:20},
  {sku:'B',qty:20,weight:30,volume:3,estUnit:10,actualUnit:9,selling:15}
],[
  {category:'Freight',reference:'F-1',estimated:40,actual:80,basis:'weight'},
  {category:'Duty',reference:'D-1',estimated:30,actual:60,basis:'value'}
],25);

assert.equal(normal.estimated,370);
assert.equal(normal.actual,440);
assert.equal(normal.variance,70);
assert.equal(normal.rows[0].estAllocated,20);
assert.equal(normal.rows[0].actualAllocated,44);
assert.equal(normal.rows[1].estAllocated,50);
assert.equal(normal.rows[1].actualAllocated,96);
assert(Math.abs(normal.causes.reduce((sum,x)=>sum+x.variance,0)-normal.variance)<1e-9);
assert.equal(normal.controls.length,0);

const flagged=calculate([
  {sku:'X',qty:1,estUnit:2,actualUnit:2},
  {sku:'X',qty:1,estUnit:2,actualUnit:2}
],[
  {category:'Fee',reference:'INV-1',estimated:2,actual:0,basis:'volume'},
  {category:'Fee 2',reference:'INV-1',estimated:1,actual:1,basis:'volume'}
],25);

assert(flagged.controls.some(x=>x.text.includes('duplicate invoice')));
assert(flagged.controls.some(x=>x.text.includes('Duplicate SKU')));
assert(flagged.controls.some(x=>x.text.includes('equal allocation')));
assert(flagged.controls.some(x=>x.text.includes('actual cost is missing')));
console.log('CostClose engine tests passed.');
