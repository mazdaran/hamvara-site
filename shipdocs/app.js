(()=>{'use strict';
const $=id=>document.getElementById(id), esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])), num=value=>Math.max(0,Number(value)||0);
const fieldIds=['generatedBy','company','userEmail','reference','seller','buyer','consignee','shipmentDate','origin','destination','loadingPlace','deliveryPlace','transportMode','incoterm','currency','invoiceRef','marks','notes','reviewNote'];
const units=['piece','set','pair','carton','case','box','pallet','kg','lb','tonne','US ton','litre','US gallon','metre','foot','roll','bag'];
const packageTypes=['Carton','Box','Case','Pallet','Crate','Bag','Drum','Bundle','Roll','Loose','Other'];
const demoItems=[
  {sku:'HG-101',description:'Cotton kitchen towel set',hs:'6302.60',coo:'Türkiye',qty:2400,uom:'set',unitPrice:4.8,packages:60,packageType:'Carton',net:720,gross:810,dimensions:'60 × 40 × 35'},
  {sku:'HG-205',description:'Stainless-steel utensil holder',hs:'7323.93',coo:'Türkiye',qty:1200,uom:'piece',unitPrice:6.25,packages:30,packageType:'Carton',net:540,gross:615,dimensions:'55 × 42 × 38'},
  {sku:'HG-330',description:'Bamboo storage organizer',hs:'4421.91',coo:'Türkiye',qty:600,uom:'piece',unitPrice:8.9,packages:15,packageType:'Carton',net:465,gross:525,dimensions:'70 × 48 × 42'}
];
let state={items:clone(demoItems),reviewed:false,generatedAt:'',revisions:0,sourceMethod:'Manual entry / built-in demo'};
function clone(value){return JSON.parse(JSON.stringify(value))}
function today(){return new Date().toISOString().slice(0,10)}
function format(value,digits=2){return new Intl.NumberFormat('en-US',{maximumFractionDigits:digits}).format(value)}
function money(value){return $('currency').value+' '+format(value,2)}
function usedItems(){return state.items.filter(item=>item.sku||item.description||num(item.qty)||num(item.packages)||num(item.net)||num(item.gross))}
function invalidate(){state.reviewed=false;state.revisions++;$('factsConfirmed').checked=false;render();save()}
function renderRows(){
  $('itemRows').innerHTML=state.items.map((item,index)=>`<tr data-index="${index}"><td class="row-number">${String(index+1).padStart(2,'0')}</td><td><input class="medium" data-key="sku" value="${esc(item.sku)}" placeholder="Required"></td><td><input class="wide" data-key="description" value="${esc(item.description)}" placeholder="Commercial description"></td><td><input data-key="hs" value="${esc(item.hs)}" placeholder="Optional"></td><td><input class="medium" data-key="coo" value="${esc(item.coo)}" placeholder="Country"></td><td><input data-key="qty" type="number" min="0" step="any" value="${item.qty||''}"></td><td><select data-key="uom">${units.map(x=>`<option ${x===item.uom?'selected':''}>${x}</option>`).join('')}</select></td><td><input data-key="unitPrice" type="number" min="0" step="any" value="${item.unitPrice||''}"></td><td><input data-key="packages" type="number" min="0" step="1" value="${item.packages||''}"></td><td><select class="medium" data-key="packageType">${packageTypes.map(x=>`<option ${x===item.packageType?'selected':''}>${x}</option>`).join('')}</select></td><td><input data-key="net" type="number" min="0" step="any" value="${item.net||''}"></td><td><input data-key="gross" type="number" min="0" step="any" value="${item.gross||''}"></td><td><input class="medium" data-key="dimensions" value="${esc(item.dimensions)}" placeholder="L × W × H"></td><td><button class="remove" type="button" aria-label="Remove row ${index+1}">×</button></td></tr>`).join('');
  document.querySelectorAll('#itemRows input,#itemRows select').forEach(control=>control.addEventListener('change',event=>{const row=event.target.closest('tr'),index=Number(row.dataset.index),key=event.target.dataset.key;state.items[index][key]=['qty','unitPrice','packages','net','gross'].includes(key)?num(event.target.value):event.target.value.trim();invalidate()}));
  document.querySelectorAll('#itemRows .remove').forEach(button=>button.addEventListener('click',event=>{const index=Number(event.target.closest('tr').dataset.index);state.items.splice(index,1);if(!state.items.length)state.items.push(blankItem());renderRows();invalidate()}));
}
function blankItem(){return{sku:'',description:'',hs:'',coo:'',qty:'',uom:'piece',unitPrice:'',packages:'',packageType:'Carton',net:'',gross:'',dimensions:''}}
function validate(items){
  const findings=[],blocking=[];
  const required=[['generatedBy','Report user'],['company','Company'],['reference','Shipment reference'],['seller','Seller / exporter'],['buyer','Buyer / importer'],['origin','Origin'],['destination','Destination']];
  required.forEach(([id,label])=>{if(!$(id).value.trim())blocking.push(`${label} is required.`)});
  if(!items.length)blocking.push('Add at least one shipment item.');
  const skuCounts={};
  items.forEach((item,index)=>{
    const row=`Row ${index+1}`;
    if(!item.sku)blocking.push(`${row}: SKU / product code is required.`);
    if(!item.description)blocking.push(`${row}: item description is required.`);
    if(num(item.qty)<=0)blocking.push(`${row}: quantity must be greater than zero.`);
    if(num(item.packages)<=0)blocking.push(`${row}: package count must be greater than zero.`);
    if(num(item.gross)<=0)blocking.push(`${row}: gross weight must be greater than zero.`);
    if(num(item.gross)<num(item.net))blocking.push(`${row}: gross weight cannot be lower than net weight.`);
    if(!item.coo)findings.push({level:'warn',title:`${row}: country of origin is missing`,detail:'Origin may be needed for invoice, customs and preferential-origin review.'});
    if(!item.hs)findings.push({level:'warn',title:`${row}: HS code is not entered`,detail:'Optional in this draft, but confirm whether the route or customer requires it.'});
    if(num(item.unitPrice)<=0)findings.push({level:'warn',title:`${row}: unit price is missing`,detail:'The packing list can still be drafted, but commercial value cannot be reconciled.'});
    if(item.sku)skuCounts[item.sku]=(skuCounts[item.sku]||0)+1;
  });
  Object.entries(skuCounts).filter(([,count])=>count>1).forEach(([sku])=>findings.push({level:'warn',title:`Duplicate SKU: ${sku}`,detail:'Confirm whether separate lines are intentional or should be combined.'}));
  if($('origin').value.trim().toLowerCase()===$('destination').value.trim().toLowerCase())findings.push({level:'warn',title:'Origin and destination are identical',detail:'Confirm that the places represent the intended movement.'});
  blocking.forEach(message=>findings.unshift({level:'error',title:message,detail:'Correct the highlighted fact before approval.'}));
  if(!findings.length)findings.push({level:'ok',title:'Core consistency checks passed',detail:'No missing required facts, impossible weights or duplicate SKU codes were found.'});
  else if(!blocking.length)findings.unshift({level:'ok',title:'No blocking errors',detail:'Warnings remain for human review but the draft can be approved.'});
  return{findings,blocking};
}
function totals(items){return items.reduce((sum,item)=>({qty:sum.qty+num(item.qty),packages:sum.packages+num(item.packages),net:sum.net+num(item.net),gross:sum.gross+num(item.gross),value:sum.value+num(item.qty)*num(item.unitPrice)}),{qty:0,packages:0,net:0,gross:0,value:0})}
function fact(label,value){return`<div><span>${label}</span><strong>${esc(value||'—')}</strong></div>`}
function render(){
  const items=usedItems(),sum=totals(items),check=validate(items);
  $('rowCounter').textContent=`${items.length} / 10 rows used`;
  $('addRow').disabled=state.items.length>=10;
  $('totalQty').textContent=format(sum.qty);
  $('totalPackages').textContent=format(sum.packages,0);
  $('totalNet').textContent=format(sum.net)+' kg';
  $('totalGross').textContent=format(sum.gross)+' kg';
  $('totalValue').textContent=money(sum.value);
  $('findings').innerHTML=check.findings.map(f=>`<div class="finding ${f.level}"><i>${f.level==='error'?'!':f.level==='warn'?'△':'✓'}</i><div><b>${esc(f.title)}</b><small>${esc(f.detail)}</small></div></div>`).join('');
  $('approve').disabled=check.blocking.length>0||!$('factsConfirmed').checked;
  $('documentStatus').className='status '+(state.reviewed?'reviewed':'draft');
  $('documentStatus').textContent=state.reviewed?'REVIEWED · APPROVED DRAFT':`DRAFT · ${check.blocking.length} BLOCKING ISSUE${check.blocking.length===1?'':'S'}`;
  $('docState').className='doc-state '+(state.reviewed?'reviewed':'');
  $('docState').textContent=state.reviewed?'REVIEWED':'DRAFT';
  $('docSub').textContent=`${$('reference').value||'Unnumbered shipment'} · ${$('shipmentDate').value||today()}`;
  $('docSeller').textContent=$('seller').value||'—';$('docBuyer').textContent=$('buyer').value||'—';$('docConsignee').textContent=$('consignee').value||'—';
  $('docFacts').innerHTML=fact('SHIPMENT REFERENCE',$('reference').value)+fact('INVOICE / ORDER',$('invoiceRef').value)+fact('DATE',$('shipmentDate').value)+fact('INCOTERM® RULE',$('incoterm').value)+fact('ORIGIN',$('origin').value)+fact('DESTINATION',$('destination').value)+fact('PLACE OF LOADING',$('loadingPlace').value)+fact('PLACE OF DELIVERY',$('deliveryPlace').value)+fact('TRANSPORT MODE',$('transportMode').value)+fact('CURRENCY',$('currency').value)+fact('TOTAL PACKAGES',format(sum.packages,0))+fact('GROSS WEIGHT',format(sum.gross)+' kg');
  $('docRows').innerHTML=items.length?items.map((item,index)=>`<tr><td>${index+1}</td><td>${esc(item.sku||'—')}</td><td>${esc(item.description||'—')}</td><td>${esc(item.hs||'—')}</td><td>${esc(item.coo||'—')}</td><td>${format(num(item.qty))} ${esc(item.uom)}</td><td>${format(num(item.packages),0)} ${esc(item.packageType)}</td><td>${format(num(item.net))}</td><td>${format(num(item.gross))}</td><td>${esc(item.dimensions||'—')}</td></tr>`).join(''):'<tr><td colspan="10">No shipment items entered.</td></tr>';
  $('docTotals').innerHTML=`<tr><td colspan="5">TOTAL</td><td>${format(sum.qty)}</td><td>${format(sum.packages,0)}</td><td>${format(sum.net)}</td><td>${format(sum.gross)}</td><td>Value: ${money(sum.value)}</td></tr>`;
  $('docNotes').textContent=[$('marks').value,$('notes').value].filter(Boolean).join('\n')||'—';
  if(!state.generatedAt&&$('generatedBy').value.trim())state.generatedAt=new Date().toISOString();
  const reportId=state.generatedAt?`SD-${state.generatedAt.slice(0,10).replaceAll('-','')}-${state.generatedAt.slice(11,19).replaceAll(':','')}`:'Pending';
  $('audit').textContent=`Report ${reportId} · Generated by ${$('generatedBy').value.trim()||'Not entered'} · Company ${$('company').value.trim()||'Not entered'} · Method: ${state.sourceMethod} · ${state.generatedAt?new Date(state.generatedAt).toLocaleString():'Not generated'} · Revisions ${state.revisions} · ${state.reviewed?'Reviewed and approved':'Review required'}`;
  return check;
}
function save(){const fields={};fieldIds.forEach(id=>fields[id]=$(id).value);localStorage.setItem('hamvara_shipdocs',JSON.stringify({...state,fields}))}
function load(){try{const saved=JSON.parse(localStorage.getItem('hamvara_shipdocs'));if(!saved)return;state.items=Array.isArray(saved.items)&&saved.items.length?saved.items:clone(demoItems);state.reviewed=!!saved.reviewed;state.generatedAt=saved.generatedAt||'';state.revisions=Number(saved.revisions)||0;state.sourceMethod=saved.sourceMethod||'Manual entry';Object.entries(saved.fields||{}).forEach(([id,value])=>{if($(id))$(id).value=value})}catch{localStorage.removeItem('hamvara_shipdocs')}}
function reloadDemo(){state={items:clone(demoItems),reviewed:false,generatedAt:'',revisions:0,sourceMethod:'Manual entry / built-in demo'};const values={reference:'SHP-2026-001',seller:'Anatolia Home Goods Ltd.',buyer:'Northstar Retail LLC',consignee:'Northstar Distribution Center',origin:'Istanbul, Türkiye',destination:'Newark, United States',loadingPlace:'Ambarli Port, Istanbul',deliveryPlace:'Newark, NJ',transportMode:'Sea',incoterm:'CIF',currency:'USD',invoiceRef:'INV-2026-1042',marks:'NSR / NEWARK / CARTONS 1–105',notes:'Keep dry. Do not stack above pallet limit.',reviewNote:''};Object.entries(values).forEach(([id,value])=>$(id).value=value);$('shipmentDate').value=today();$('factsConfirmed').checked=false;renderRows();render();save()}
function downloadCsv(){const items=usedItems();if(!items.length)return;const header=['shipment_reference','seller','buyer','origin','destination','transport_mode','incoterm','currency','sku','description','hs_code','country_of_origin','quantity','uom','unit_price','packages','package_type','net_weight_kg','gross_weight_kg','dimensions_cm'];const rows=items.map(item=>[$('reference').value,$('seller').value,$('buyer').value,$('origin').value,$('destination').value,$('transportMode').value,$('incoterm').value,$('currency').value,item.sku,item.description,item.hs,item.coo,item.qty,item.uom,item.unitPrice,item.packages,item.packageType,item.net,item.gross,item.dimensions]);const csv=[header,...rows].map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.download=`Hamvara-ShipDocs-${($('reference').value||'shipment').replace(/[^a-z0-9_-]/gi,'-')}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),0)}
fieldIds.forEach(id=>$(id).addEventListener('change',()=>{state.sourceMethod=state.sourceMethod.includes('demo')?'Manual entry / edited built-in demo':'Manual entry';invalidate()}));
$('factsConfirmed').addEventListener('change',render);
$('addRow').addEventListener('click',()=>{if(state.items.length<10){state.items.push(blankItem());renderRows();invalidate()}});
$('loadDemo').addEventListener('click',reloadDemo);
$('approve').addEventListener('click',()=>{const check=render();if(check.blocking.length||!$('factsConfirmed').checked)return;state.reviewed=true;state.revisions++;render();save();$('document').scrollIntoView({behavior:'smooth',block:'start'})});
$('print').addEventListener('click',()=>{render();window.print()});
$('csv').addEventListener('click',()=>{render();downloadCsv()});
document.querySelectorAll('[data-jump]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-jump]').forEach(x=>x.classList.toggle('active',x===button));$(button.dataset.jump).scrollIntoView({behavior:'smooth',block:'start'})}));
if(!$('shipmentDate').value)$('shipmentDate').value=today();load();renderRows();render();
})();
