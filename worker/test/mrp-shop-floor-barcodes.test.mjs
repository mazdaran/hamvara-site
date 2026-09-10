import test from 'node:test';
import assert from 'node:assert/strict';
import {code128Svg,shopFloorLabelHtml,shopFloorLabelsDocument} from '../../mrp/shop-floor-barcodes.js';

test('Code 128 and printable label documents contain the generated asset code',()=>{const item={kind:'MACHINE',label:'Press 01',code:'WC-01',barcode:'HMV-MC-WC-01-AA'},svg=code128Svg(item.barcode),label=shopFloorLabelHtml(item,'data:image/png;base64,AAAA'),document=shopFloorLabelsDocument([label]);assert.match(svg,/<svg/);assert.match(svg,/HMV-MC-WC-01-AA/);assert.match(document,/Press 01/);assert.match(document,/Scan → verify → sync/)});
