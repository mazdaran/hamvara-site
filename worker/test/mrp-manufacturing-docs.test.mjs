import test from 'node:test';import assert from 'node:assert/strict';
import {retailBarcodeCheckDigit,normalizeRetailBarcode,retailBarcodeSvg,productionInstructionHtml,materialIssueHtml,cartonLabelHtml} from '../../mrp/manufacturing-docs.js';
const job={workOrderNo:'WO-1',batchNo:'B-1',bomVersion:'3.0',productName:'Widget',plannedQty:5,createdAt:'2026-09-08',materials:[{sku:'RM-1',name:'Steel',warehouse:'WH-RM',required:10}],processVariables:[{category:'QUALITY',name:'Torque',value:'8',unit:'Nm',required:true}]};
test('print documents contain traceability and signatures',()=>{assert.match(productionInstructionHtml(job),/BOM version:<\/b> 3.0/);assert.match(materialIssueHtml(job),/Production Manager/);assert.match(materialIssueHtml(job),/Warehouse/)});
test('EAN-13 calculates and validates the GS1 check digit',()=>{
  assert.equal(retailBarcodeCheckDigit('400638133393'),'1');
  assert.deepEqual(normalizeRetailBarcode('400638133393','EAN_13'),{standard:'EAN_13',value:'4006381333931'});
  assert.throws(()=>normalizeRetailBarcode('4006381333932','EAN_13'),/check digit is invalid/);
  assert.match(retailBarcodeSvg('4006381333931',{standard:'EAN_13'}),/data-barcode-standard="EAN_13"/);
});
test('UPC-A calculates and validates its check digit',()=>{
  assert.deepEqual(normalizeRetailBarcode('03600029145','UPC_A'),{standard:'UPC_A',value:'036000291452'});
  assert.throws(()=>normalizeRetailBarcode('036000291453','UPC_A'),/check digit is invalid/);
  assert.match(retailBarcodeSvg('036000291452',{standard:'UPC_A'}),/036000291452/);
});
test('carton labels use configurable physical size and selected retail standard',()=>{const html=cartonLabelHtml({productName:'Widget',sku:'FG-001',barcode:'4006381333931',batchNo:'B-1'},{width:100,height:150,margin:5,barcodeStandard:'EAN_13'});assert.match(html,/@page\{size:100mm 150mm;margin:5mm\}/);assert.match(html,/data-barcode-standard="EAN_13"/)});
