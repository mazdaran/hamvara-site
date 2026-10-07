import test from 'node:test';
import assert from 'node:assert/strict';
import {COLUMNS,parseDelimited,guessDelimiter,tableFromRecords,suggestMapping,mapRows,parseNumber,reviewRows,safeFixes,exportRows,serializeCsv,barcodeValid} from './core.mjs';
const row=(x={})=>({id:1,sourceRow:2,approved:false,excluded:false,...Object.fromEntries(COLUMNS.map(k=>[k,''])),sku:'SKU-01',price:'12.50',...x});
test('CSV preserves BOM, quoted multiline values, escaped quotes, leading zeros and source lines',()=>{
 const t=tableFromRecords(parseDelimited('\uFEFFSKU,Description,Price\r\n00123,"Blue, ""large""\r\nmug",12.50\r\n00008,Zero,0\r\n').records);
 assert.equal(t.rows[0].cells[0],'00123');assert.equal(t.rows[0].cells[1],'Blue, "large"\r\nmug');assert.equal(t.rows[1].line,4);assert.equal(t.rows.length,2);
});
test('delimiter detection respects quoted commas, semicolon decimals and TSV',()=>{
 for(const [s,d] of [['sku;description;price\nA;"comma, in name";1,25',';'],['sku\tdescription\tprice\nA\tB\t1','\t'],['sku,price\nA,1',',']])assert.equal(guessDelimiter(s),d);
});
test('broken CSV fails explicitly instead of losing columns or misreading quotes',()=>{
 assert.throws(()=>parseDelimited('sku,price\nA,"3'),/unclosed_quote/);assert.throws(()=>parseDelimited('sku,price\nA,"3"bad'),/csv_quotes/);
 assert.throws(()=>tableFromRecords(parseDelimited('sku,price\nA,1,extra').records),/column_mismatch/);
});
test('blank lines and header offsets reconcile to source line numbers',()=>{
 const t=tableFromRecords(parseDelimited('Supplier list\nsku,price\n\nA,1\n,,\nB,2').records,1);assert.equal(t.skipped,2);assert.deepEqual(t.rows.map(r=>r.line),[4,6]);
});
test('oversized cells, columns and batches are rejected',()=>{
 assert.throws(()=>parseDelimited('x'.repeat(2001)),/cell_too_long/);assert.throws(()=>parseDelimited(Array(101).fill('a').join(',')),/too_many_columns/);
 assert.throws(()=>tableFromRecords(Array.from({length:10002},(_,i)=>({cells:['x'],line:i+1}))),/too_many_rows/);
});
test('mapping uses unique exact aliases and rejects reusing source columns',()=>{
 const m=suggestMapping(['SKU','Unit price','SKU discount','SKU','Stock','Barkod']);assert.equal(m.sku,-1);assert.equal(m.price,1);assert.equal(m.barcode,5);
 assert.throws(()=>mapRows([{cells:['A','1'],line:2}],{sku:0,price:0}),/mapping_duplicate/);assert.throws(()=>mapRows([],{sku:-1,price:1}),/mapping_required/);
});
test('European, US and space-grouped numbers preserve exact decimal digits',()=>{
 for(const [s,l,v] of [['1.250,50','auto','1250.50'],['1,250.50','auto','1250.50'],['1\u00a0250,50','comma','1250.50'],['0','auto','0'],['001.25','auto','1.25'],['1,234','dot','1234'],['1,234','comma','1.234'],['1.234','canonical','1.234']])assert.equal(parseNumber(s,l).value,v,s);
});
test('ambiguous separators and malformed values are never guessed',()=>{
 for(const s of ['1,234','1.234','0.001'])assert.equal(parseNumber(s).code,'number_ambiguous');
 for(const s of ['$12','1e5','12,34,5','NaN','Infinity','1 23','12.3456.78'])assert.equal(parseNumber(s).ok,false,s);
 assert.equal(parseNumber('1234567890123456','canonical').code,'number_precision');
});
test('GTIN requires supported lengths and correct check digits',()=>{
 for(const v of ['96385074','036000291452','4006381333931','10012345000017',''])assert.equal(barcodeValid(v),true,v);
 for(const v of ['123456789','1234567890','12345678901','4006381333932','EAN-123'])assert.equal(barcodeValid(v),false,v);
});
test('duplicate matching preserves separators and leading zeros',()=>{
 assert.deepEqual(reviewRows(['ABC-1','ABC_1','001','1','DUP','dup'].map((sku,i)=>row({id:i,sku}))).map(r=>r.status),['READY','READY','READY','READY','REVIEW','REVIEW']);
});
test('excluding one duplicate clears the conflict without auto approval',()=>{
 const r=reviewRows([row({sku:'A'}),row({id:2,sku:'A',excluded:true})]);assert.equal(r[0].status,'READY');assert.equal(r[0].approved,false);assert.equal(r[1].status,'EXCLUDED');
});
test('missing fields, negative numbers, stock limits and currency case need review',()=>{
 for(const x of [{sku:''},{price:''},{price:'free'},{stock:'-1'},{min:'10',max:'5'},{currency:'eur'}])assert.equal(reviewRows([row(x)])[0].status,'REVIEW');
 assert.equal(reviewRows([row({price:'0',stock:'0',currency:'',min:'0',max:'0'})])[0].status,'READY');
});
test('formatting preview leaves original rows intact and never deduplicates or invents prices',()=>{
 const r=[row({sku:' 0001 ',price:'1.250,50',currency:'eur'}),row({id:2,sku:'0001',price:'1,234'})],before=JSON.stringify(r),p=safeFixes(r);
 assert.equal(JSON.stringify(r),before);assert.equal(p.rows[0].sku,'0001');assert.equal(p.rows[0].price,'1250.50');assert.equal(p.rows[0].currency,'EUR');assert.equal(p.rows[1].price,'1,234');assert.equal(p.rows.length,2);assert.equal(p.changes.length,3);
});
test('European normalization is idempotent and valid after decimal conversion',()=>{
 const p=safeFixes([row({price:'1.234,567',stock:'2.000'})],'comma');assert.equal(p.rows[0].price,'1234.567');assert.equal(p.rows[0].stock,'2000');assert.equal(reviewRows(p.rows,'comma')[0].status,'READY');assert.deepEqual(safeFixes(p.rows,'comma').changes,[]);
});
test('invalid or excluded rows lose approval',()=>{
 assert.equal(reviewRows([row({approved:true,price:'bad'})])[0].approved,false);assert.equal(reviewRows([row({approved:true,excluded:true})])[0].approved,false);
});
test('export includes only approved valid rows with canonical numbers',()=>{
 const checked=reviewRows([row({price:'1.250,50',approved:true}),row({id:2,sku:'B'}),row({id:3,sku:'C',price:'bad',approved:true}),row({id:4,sku:'D',excluded:true,approved:true})],'comma'),out=exportRows(checked,'comma');
 assert.equal(out.length,1);assert.equal(out[0].price,'1250.50');assert.equal(Object.keys(out[0]).length,11);assert.equal(reviewRows(out,'canonical')[0].status,'READY');
});
test('CSV neutralizes formulas while preserving quotes, newlines and leading-zero text',()=>{
 const csv=serializeCsv([row({sku:'00123',description:' =HYPERLINK("x")\nsecond line'})]);assert.ok(csv.startsWith('\uFEFFsku,description'));assert.ok(csv.endsWith('\r\n'));
 const r=parseDelimited(csv).records[1];assert.equal(r.cells[0],'00123');assert.equal(r.cells[1],'\' =HYPERLINK("x")\nsecond line');
});
test('10,000-row review includes the final row and finds its duplicate',()=>{
 const r=Array.from({length:10000},(_,i)=>row({id:i,sku:'SKU-'+i}));r[9999].sku='SKU-0';const out=reviewRows(r);assert.equal(out.length,10000);assert.equal(out.filter(r=>r.status==='REVIEW').length,2);
});
