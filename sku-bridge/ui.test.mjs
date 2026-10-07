// Controller tests use a small DOM double, not a browser or a visual rendering claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as core from './core.mjs';
import * as messages from './i18n.mjs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const code=readFileSync(new URL('./app.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
function fixture(){
 const nodes=[],exports=[],exportFormats=[],downloads=[],storage=new Map();
 const decode=s=>String(s??'').replace(/&(amp|lt|gt|quot|#39);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[k]));
 const key=s=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
 class Element {
  constructor(tag,attrs={},content=''){this.tagName=tag;this.attrs=attrs;this.id=attrs.id;this.dataset={};this.value=decode(attrs.value||'');this.textContent=decode(content.replace(/<[^>]*>/g,''));this.disabled='disabled' in attrs;this.hidden='hidden' in attrs;this.checked='checked' in attrs;this.children=[];this.listeners={};this.classList={add(){},remove(){},toggle(){}};for(const [k,v] of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[key(k.slice(5))]=decode(v);if(tag==='textarea')this.value=decode(content);if(tag==='select'){const opts=[...content.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)];const opt=opts.find(m=>/\bselected\b/.test(m[1]))||opts[0];if(opt){const m=/value="([^"]*)"/.exec(opt[1]);this.value=decode(m?m[1]:opt[2]);}}}
  set innerHTML(value){for(const child of this.children){const i=nodes.indexOf(child);if(i>=0)nodes.splice(i,1);}this.children=parse(value);this.html=value;}
  get innerHTML(){return this.html||'';}
  setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}
  addEventListener(k,fn){this.listeners[k]=fn;}scrollIntoView(){}showModal(){this.open=true;}close(){this.open=false;}append(el){this.children.push(el);}remove(){}click(){if(this.tagName==='a')downloads.push(this.download);else this.onclick?.();}
  closest(selector){return this.matches(selector)?this:null;}matches(selector){const m=/^\[([^\]]+)\]$/.exec(selector);return m?Object.hasOwn(this.attrs,m[1]):false;}
 }
 function parse(markup){const out=[];const re=/<([a-z][\w-]*)\b([^>]*)>/g;let m;while((m=re.exec(markup))){const attrs={};for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??'';const end=markup.indexOf('</'+m[1]+'>',re.lastIndex);const content=['input','meta','link','br'].includes(m[1])?'':end>=0?markup.slice(re.lastIndex,end):'';const el=new Element(m[1],attrs,content);out.push(el);nodes.push(el);}return out;}
 parse(html);
 const document={documentElement:{lang:'en'},getElementById:id=>nodes.find(n=>n.id===id),querySelectorAll:sel=>nodes.filter(n=>n.matches(sel)),createElement:tag=>new Element(tag),body:new Element('body'),head:new Element('head')};
 const window={addEventListener(){},SkuSandbox:{refresh:async()=>({exportAllowed:true}),preview:rows=>rows,exportRows:async (rows,format)=>{exports.push(rows);exportFormats.push(format);return true;}}};
 vm.runInNewContext(code,{...core,...messages,document,window,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},File,Blob,TextDecoder,structuredClone,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout:fn=>{fn();return 0;},clearTimeout(){}});
 const get=id=>document.getElementById(id),find=(attr,value)=>nodes.find(n=>n.dataset[attr]===String(value));
 const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
 const sample=async()=>{get('sample').onclick();await settle();};
 return {get,find,exports,exportFormats,downloads,nodes,document,settle,sample};
}
test('UI loads the sample, maps it, reviews all rows and exports only explicit approvals',async()=>{
 const f=fixture();await f.sample();assert.equal(f.get('notice').textContent,'');assert.equal(f.get('mapping-panel').hidden,false);assert.equal(f.find('map','sku').value,'0');assert.equal(f.find('map','price').value,'4');
 await f.get('analyze').onclick();assert.equal(f.get('count-total').textContent,'8');assert.equal(f.get('count-review').textContent,'6');assert.equal(f.get('count-ready').textContent,'2');assert.equal(f.get('count-approved').textContent,'0');
 f.get('fixes').onclick();assert.equal(f.get('fix-dialog').open,true);f.get('apply-fixes').onclick();assert.equal(f.get('count-review').textContent,'5');assert.equal(f.get('count-ready').textContent,'3');
 f.get('approve-ready').onclick();assert.equal(f.get('count-approved').textContent,'3');f.get('export').onclick();assert.equal(f.get('confirm-export').disabled,true);
 f.get('confirm-check').checked=true;f.get('confirm-check').onchange();await f.get('confirm-export').onclick();assert.equal(f.exports.length,1);assert.equal(f.exports[0].length,3);assert.equal(f.exports[0][0].price,'1.05');assert.equal(f.exports[0][0].sku,'RAW-100');
 assert.deepEqual(f.exportFormats,['xlsx']);f.get('export').onclick();f.get('export-format').value='csv';f.get('confirm-check').checked=true;await f.get('confirm-export').onclick();assert.deepEqual(f.exportFormats,['xlsx','csv']);
});
test('UI editing, exclusion, undo, search and issue report keep counts consistent',async()=>{
 const f=fixture();await f.sample();await f.get('analyze').onclick();f.get('rows').onclick({target:f.find('exclude',4)});assert.equal(f.get('count-review').textContent,'4');assert.equal(f.get('count-ready').textContent,'3');
 f.get('undo').onclick();assert.equal(f.get('count-review').textContent,'6');f.get('rows').onclick({target:f.find('edit',5)});f.find('editField','price').value='9.95';f.find('editField','description').value='First line\nSecond "quoted" line';f.get('edit-form').onsubmit({preventDefault(){}});assert.equal(f.get('count-review').textContent,'5');
 f.get('search').value='PRICE-7';f.get('search').oninput();assert.match(f.get('rows').innerHTML,/First line\nSecond &quot;quoted&quot; line/);assert.match(f.get('pagination-summary').textContent,/of 1 matching/);
 f.get('issues-report').onclick();assert.deepEqual(f.downloads,['SKU-Bridge-issue-report.csv']);
});
test('UI translation covers every visible copy key and retains mapped columns',async()=>{
 const f=fixture();for(const n of f.nodes.filter(n=>n.dataset.i18n))assert.ok(messages.tr[n.dataset.i18n],n.dataset.i18n);await f.sample();
 f.get('language').value='tr';f.get('language').onchange();assert.equal(f.document.documentElement.lang,'tr');assert.equal(f.find('map','sku').value,'0');
});
test('XLSX raw numeric cells map canonically without losing formatted identifier padding',()=>{
 const data=core.mapRows([{line:2,cells:['00012','$1,250.50','0012345678905'],numericCells:{0:'12',1:'1250.5',2:'12345678905'}}],{sku:0,price:1,barcode:2});
 assert.equal(data[0].sku,'00012');assert.equal(data[0].price,'1250.5');assert.equal(data[0].barcode,'0012345678905');assert.equal(data[0].numberFormats.price,'canonical');
});
