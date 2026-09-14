(() => {
  const $ = id => document.getElementById(id);
  const fields = ['generatedBy','company','buyerEmail','buyerWhatsApp','supplier','supplierEmail','supplierWhatsApp','poNumber','sku','product','quantity','uom','price','currency','requestedDate','incoterm','status','urgency','note'];
  const today = new Date();
  const iso = days => { const d = new Date(today); d.setDate(d.getDate() + days); return d.toISOString().slice(0,10); };
  const demo = () => [
    {id:'po1',supplier:'Nova Packaging Ltd.',supplierEmail:'sales@nova.example',supplierWhatsApp:'+90 555 100 1010',poNumber:'PO-260914-01',sku:'PKG-440',product:'Printed folding cartons',quantity:12000,uom:'pcs',price:0.18,currency:'USD',requestedDate:iso(8),incoterm:'FCA',status:'due',urgency:'High',note:'Please confirm print completion and dispatch date.'},
    {id:'po2',supplier:'Pearl Cosmetics MFG',supplierEmail:'orders@pearl.example',supplierWhatsApp:'+86 138 0013 8000',poNumber:'PO-260914-02',sku:'COS-118',product:'Private-label face serum',quantity:3000,uom:'pcs',price:2.45,currency:'USD',requestedDate:iso(21),incoterm:'FOB',status:'waiting',urgency:'Standard',note:'Confirm final quantity, batch date and FOB readiness.'},
    {id:'po3',supplier:'Atlas Components GmbH',supplierEmail:'export@atlas.example',supplierWhatsApp:'+49 151 2345 6789',poNumber:'PO-260914-03',sku:'BRG-6204',product:'Industrial bearings 6204-2RS',quantity:800,uom:'pcs',price:4.7,currency:'EUR',requestedDate:iso(5),incoterm:'DAP',status:'confirmed',urgency:'Standard',note:'Supplier confirmed the requested date.'},
    {id:'po4',supplier:'Green Valley Foods',supplierEmail:'trade@greenvalley.example',supplierWhatsApp:'+34 612 345 678',poNumber:'PO-260914-04',sku:'FIG-05',product:'Dried figs, 5 kg cartons',quantity:480,uom:'cartons',price:26,currency:'EUR',requestedDate:iso(3),incoterm:'CIF',status:'changed',urgency:'Production critical',note:'Supplier proposed a later date; buyer review required.'},
    {id:'po5',supplier:'Metro Textile Works',supplierEmail:'orders@metro.example',supplierWhatsApp:'+880 1712 345678',poNumber:'PO-260914-05',sku:'TSH-220',product:'Organic cotton T-shirts',quantity:5000,uom:'pcs',price:3.1,currency:'USD',requestedDate:iso(-1),incoterm:'FOB',status:'risk',urgency:'Production critical',note:'Requested date has passed with no final dispatch confirmation.'}
  ];
  const defaults = {generatedBy:'Yahya Mazdarani',company:'Hamvara Demo Company',buyerEmail:'purchasing@example.com',buyerWhatsApp:'+1 202 555 0140'};
  let pos = JSON.parse(localStorage.getItem('hamvaraPoChaserPos') || 'null') || demo();
  let selected = pos[0].id;
  let revisions = Number(localStorage.getItem('hamvaraPoChaserRevisions') || 0);
  let links = Number(localStorage.getItem('hamvaraPoChaserLinks') || 0);
  const statusName = {waiting:'Waiting',due:'Follow-up due',confirmed:'Confirmed',changed:'Changed',risk:'At risk'};

  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function toast(msg){ $('toast').textContent=msg; $('toast').classList.remove('hidden'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('toast').classList.add('hidden'),2200); }
  function persist(){ localStorage.setItem('hamvaraPoChaserPos',JSON.stringify(pos)); localStorage.setItem('hamvaraPoChaserRevisions',String(revisions)); localStorage.setItem('hamvaraPoChaserLinks',String(links)); }
  function current(){ return pos.find(p=>p.id===selected); }
  function render(){
    const count = s => pos.filter(p=>p.status===s).length;
    $('mOpen').textContent=pos.length; $('mDue').textContent=count('due'); $('mConfirmed').textContent=count('confirmed'); $('mChanged').textContent=count('changed'); $('mRisk').textContent=count('risk');
    $('poList').innerHTML=pos.map(p=>`<article class="po-card ${p.id===selected?'active':''}" data-id="${esc(p.id)}"><div><b>${esc(p.poNumber)}</b><br><small>${esc(p.sku)}</small></div><div><b>${esc(p.supplier)}</b><br><small>${esc(p.product)}</small></div><div><b>${esc(p.requestedDate)}</b><br><small>${esc(p.quantity)} ${esc(p.uom)}</small></div><span class="status ${esc(p.status)}">${esc(statusName[p.status])}</span></article>`).join('');
    $('poList').querySelectorAll('.po-card').forEach(el=>el.addEventListener('click',()=>{ saveForm(false); selected=el.dataset.id; fill(); render(); }));
    $('linkCount').textContent=`${links} / 3 links`;
  }
  function fill(){ const p=current(); fields.forEach(k=>{ const value = p[k] ?? defaults[k] ?? ''; if($(k)) $(k).value=value; }); $('emailSubject').value=''; $('emailBody').value=''; $('whatsappBody').value=''; $('confirmationLink').value=''; }
  function read(){ const p={}; fields.forEach(k=>p[k]=$(k).value.trim()); p.quantity=Number(p.quantity||0); p.price=Number(p.price||0); return p; }
  function saveForm(show=true){ const p=current(); if(!p)return; Object.assign(p,read()); revisions++; persist(); render(); if(show)toast('PO changes saved locally'); }
  function validate(){ const p=read(); const missing=[]; ['generatedBy','company','buyerEmail','supplier','poNumber','product','quantity','requestedDate'].forEach(k=>{if(!p[k])missing.push(k)}); if(missing.length){toast('Complete required PO and contact fields');return null} return p; }
  function dateText(v){ const d=new Date(`${v}T12:00:00`); return Number.isNaN(d.getTime())?v:d.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}); }
  function makeMessages(){
    const p=validate(); if(!p)return null; saveForm(false);
    const total=p.price?` at ${p.currency} ${p.price.toFixed(2)} per ${p.uom}`:'';
    const subject=`Action required: confirm ${p.poNumber} delivery by ${p.requestedDate}`;
    const body=`Dear ${p.supplier} team,\n\nPlease confirm the current status of purchase order ${p.poNumber}.\n\nProduct: ${p.product}${p.sku?` (${p.sku})`:''}\nQuantity: ${p.quantity.toLocaleString()} ${p.uom}${total}\nRequested delivery: ${dateText(p.requestedDate)}\nIncoterm: ${p.incoterm}\nUrgency: ${p.urgency}\n\nRequested action: ${p.note || 'Please confirm quantity, price and delivery date.'}\n\nPlease reply with confirmation or clearly state any proposed change.\n\nBest regards,\n${p.generatedBy}\n${p.company}`;
    const wa=`Hello ${p.supplier} team. Please confirm PO ${p.poNumber}: ${p.quantity.toLocaleString()} ${p.uom} of ${p.product}, requested delivery ${p.requestedDate}. ${p.note || 'Please confirm quantity, price and delivery date.'} Reply to ${p.generatedBy}, ${p.company}.`;
    $('emailSubject').value=subject; $('emailBody').value=body; $('whatsappBody').value=wa;
    $('audit').textContent=`Generated by ${p.generatedBy} · ${p.company} · ${new Date().toLocaleString()} · method: manual web entry + smart template · revisions: ${revisions} · PO status: ${statusName[p.status]} · human review required before sending.`;
    toast('Follow-up drafts generated'); return p;
  }
  async function copy(text,msg){ try{await navigator.clipboard.writeText(text);toast(msg)}catch{toast('Copy was blocked by the browser')} }
  function phone(v){return String(v||'').replace(/\D/g,'')}
  function encodePayload(obj){ const bytes=new TextEncoder().encode(JSON.stringify(obj)); let bin=''; bytes.forEach(b=>bin+=String.fromCharCode(b)); return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
  function createLink(){
    const p=validate(); if(!p)return;
    if(links>=3){toast('Free beta limit reached: 3 links');return}
    saveForm(false); const created=Date.now(); const payload={v:1,id:`HPC-${created.toString(36).toUpperCase()}`,created,expires:created+7*864e5,buyer:{name:p.generatedBy,company:p.company,email:p.buyerEmail,whatsapp:p.buyerWhatsApp},po:{number:p.poNumber,supplier:p.supplier,sku:p.sku,product:p.product,quantity:p.quantity,uom:p.uom,price:p.price,currency:p.currency,requestedDate:p.requestedDate,incoterm:p.incoterm,note:p.note}};
    $('confirmationLink').value=`https://hamvara.com/po-chaser/confirm/#${encodePayload(payload)}`; links++; persist(); render(); toast('Seven-day beta link generated');
  }
  $('savePo').addEventListener('click',()=>saveForm());
  $('newPo').addEventListener('click',()=>{if(pos.length>=10){toast('Free beta limit reached: 10 POs');return} saveForm(false); const id=`po${Date.now()}`; pos.unshift({id,status:'waiting',currency:'USD',incoterm:'FCA',urgency:'Standard',uom:'pcs',requestedDate:iso(14),...defaults});selected=id;persist();fill();render();});
  $('resetDemo').addEventListener('click',()=>{pos=demo();selected=pos[0].id;revisions=0;links=0;persist();fill();render();toast('Demo restored')});
  $('generate').addEventListener('click',makeMessages);
  $('copyEmail').addEventListener('click',()=>copy(`${$('emailSubject').value}\n\n${$('emailBody').value}`,'Email copied'));
  $('copyWhatsapp').addEventListener('click',()=>copy($('whatsappBody').value,'WhatsApp message copied'));
  $('openEmail').addEventListener('click',()=>{const p=validate();if(!p)return;if(!$('emailBody').value)makeMessages();location.href=`mailto:${encodeURIComponent(p.supplierEmail)}?subject=${encodeURIComponent($('emailSubject').value)}&body=${encodeURIComponent($('emailBody').value)}`;});
  $('openWhatsapp').addEventListener('click',()=>{const p=validate();if(!p)return;if(!$('whatsappBody').value)makeMessages();if(!phone(p.supplierWhatsApp)){toast('Enter supplier WhatsApp with country code');return}window.open(`https://wa.me/${phone(p.supplierWhatsApp)}?text=${encodeURIComponent($('whatsappBody').value)}`,'_blank','noopener');});
  $('createLink').addEventListener('click',createLink); $('copyLink').addEventListener('click',()=>copy($('confirmationLink').value,'Confirmation link copied'));
  fields.forEach(k=>$(k).addEventListener('change',()=>{revisions++;Object.assign(current(),read());persist();render()}));
  fill();render();
})();
