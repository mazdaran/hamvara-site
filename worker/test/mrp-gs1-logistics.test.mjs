import test from 'node:test';
import assert from 'node:assert/strict';
import {gs1CheckDigit,normalizeGtin14,createSscc,gs1LogisticData,gs1LogisticLabelHtml} from '../../mrp/gs1-logistics.js';

test('GTIN-14 and SSCC receive and validate GS1 check digits',()=>{assert.equal(normalizeGtin14('0400638133393'),'04006381333931');const sscc=createSscc({extension:'0',companyPrefix:'1234567',serialReference:'123456789'});assert.equal(sscc.length,18);assert.equal(sscc.at(-1),gs1CheckDigit(sscc.slice(0,-1)))});
test('GS1-128 data carries FNC1 element semantics and human AIs',()=>{const data=gs1LogisticData({gtin:'0400638133393',lot:'LOT-9',expiry:'271231',serial:'S-1'});assert.match(data.human,/\(01\)04006381333931/);assert.match(data.human,/\(10\)LOT-9/);assert.equal(data.machine.includes('\u001d'),true);const html=gs1LogisticLabelHtml({label:'Pallet',gtin:'0400638133393',lot:'LOT-9'});assert.match(html,/GS1-128/);assert.match(html,/licensed GS1 Company Prefix/)});
