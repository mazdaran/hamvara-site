import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
class Node {
  constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.handlers={};this.textContent='';this.classList={add(){},remove(){}};this.queries=new Map();this._html='';}
  set innerHTML(v){this._html=String(v);}get innerHTML(){return this._html;}
  append(...nodes){this.children.push(...nodes);}appendChild(node){this.append(node);return node;}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(k,v){this[k]=v;}addEventListener(k,v){this.handlers[k]=v;}
  querySelector(s){if(!this.queries.has(s))this.queries.set(s,new Node());return this.queries.get(s);}
  focus(){}
}
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
function section(file,start,end){const a=file.indexOf(start),b=file.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return file.slice(a,b);}
const payload='"><img src=x onerror=alert(1)>';
test('ShipDocs renders persisted row values via DOM fields',()=>{
  const code=section(read('shipdocs/app.js'),'function renderRows(){','function blankItem(){');
  const root=new Node('tbody');
  vm.runInNewContext(code+'\nrenderRows();',{
    document:{createElement:tag=>new Node(tag),querySelectorAll:()=>[]},
    $:id=>id==='itemRows'?root:null,
    state:{items:[{sku:payload,description:payload,uom:'piece',packageType:'Carton'}]},
    units:['piece','carton'],packageTypes:['Carton','Box'],
    num:Number,invalidate(){},blankItem(){return {};}
  });
  assert.equal(root.children.length,1);
  assert.equal(root.children[0].children[1].children[0].value,payload);
  assert.equal(root.innerHTML,'');
});
test('Growth treats audit history fields as plain text',()=>{
  const code=section(read('growth/app.js'),'  function renderHistory(){','  async function loadIntegrations(){');
  const root=new Node();
  vm.runInNewContext(code+'\nrenderHistory();',{
    $:()=>root,document:{createElement:tag=>new Node(tag),createTextNode:v=>({textContent:String(v)})},
    readHistory:()=>[{url:'https://hamvara.com',strategy:payload,scores:{performance:payload,accessibility:1,'best-practices':2,seo:3}}],
    URL
  });
  assert.equal(root.children.length,1);
  assert.equal(root.children[0].children[0].children[1].textContent,'· '+payload);
  assert.equal(root.children[0].children[1].textContent,'P '+payload);
  assert.equal(root.innerHTML,'');
});
test('Decision Center proposal fills dynamic DOM text without HTML interpolation',()=>{
  const code=section(read('decision-center/app.js'),'function openProposalSummary(){','const proposalStyles=');
  let overlay;
  const document={
    createElement:tag=>{const el=new Node(tag);if(tag==='div')overlay=el;return el;},
    querySelectorAll:()=>[{closest:()=>({textContent:payload})}],
    addEventListener(){},body:new Node('body')
  };
  vm.runInNewContext(code+'\nopenProposalSummary();',{
    document,sku:{value:'10'},warehouse:{value:'1'},
    planName:{textContent:payload},priceValue:{textContent:payload},quoteBtn:new Node('button')
  });
  assert.ok(overlay);
  assert.ok(!overlay.innerHTML.includes(payload));
  assert.equal(overlay.querySelector('#proposal-title').textContent,payload+' plan summary');
  assert.equal(overlay.querySelector('[data-proposal-field="price"]').textContent,payload);
  assert.equal(overlay.querySelector('.proposal-needs ul').children[0].textContent,payload);
  assert.match(overlay.querySelector('.proposal-actions .primary').href,/^mailto:info@hamvara.com/);
});
