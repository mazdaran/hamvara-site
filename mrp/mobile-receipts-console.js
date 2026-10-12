import {parseQuantity} from './numeric-input.mjs';
const $=id=>document.getElementById(id),base=String(window.HAMVARA_MRP_CONFIG?.apiBase||'').replace(/\/$/,'');
let credentials=null,actor=null,pairing=null,timer=null,inFlight=false;
function message(value,error=false){$('message').textContent=value;$('message').className=error?'error':'';}
function syncMessage(value,error=false){$('syncStatus').textContent=value;$('syncStatus').className=error?'error':'muted';}
async function api(path,body){const response=await fetch(base+'/api/mrp/receipt-console'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Hamvara-Workspace':credentials?.workspace||'','X-Hamvara-User':credentials?.username||'','X-Hamvara-Key':credentials?.accessKey||''},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'Request failed.'),{status:response.status});return result;}
async function action(button,fn){button.disabled=true;try{await fn();}catch(error){message(error.message,true);}finally{button.disabled=false;}}
function options(id,items,value,label){$(id).replaceChildren(...items.map(item=>{const option=document.createElement('option');option.value=item[value];option.textContent=label(item);return option;}));}
$('login').onsubmit=event=>{event.preventDefault();action($('login').querySelector('button'),async()=>{
 const data=new FormData(event.target);credentials={workspace:String(data.get('workspace')).trim().toLowerCase(),username:String(data.get('username')).trim().toLowerCase(),accessKey:String(data.get('accessKey'))};
 try{const bootstrap=await api('/bootstrap');actor=bootstrap.actor;$('actor').textContent=`${actor.workspace.slug} · ${actor.user.username} · ${actor.user.role}`;options('warehouse',bootstrap.warehouses,'code',x=>`${x.code} · ${x.name}`);$('pair').disabled=!bootstrap.warehouses.length;setupDesktop(bootstrap);$('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;$('login').reset();
 if(actor.user.role==='CEO'){const {users}=await api('/users');options('user',users,'id',x=>`${x.username} · ${x.role}`);options('grantWarehouse',bootstrap.warehouses,'code',x=>`${x.code} · ${x.name}`);$('permissions').hidden=false;}
 await refresh();message('Connected. Enter goods on this computer, optionally connect a phone, or review receipts.');timer=setInterval(poll,4000);
 }catch(error){credentials=null;actor=null;$('login').hidden=false;$('workspace').hidden=true;$('logout').hidden=true;$('permissions').hidden=true;throw error;}
});};
$('logout').onclick=()=>{clearInterval(timer);credentials=null;location.reload();};
$('pair').onclick=()=>action($('pair'),async()=>{
 if(pairing)await api(`/pairings/${pairing.id}`,{action:'revoke'});
 pairing=await api('/pairings',{warehouse:$('warehouse').value});$('qr').replaceChildren();
 new QRCode($('qr'),{text:`${location.origin}/mrp/mobile-receipt.html#token=${encodeURIComponent(pairing.token)}`,width:180,height:180});
 $('approveDevice').hidden=true;$('revokeDevice').hidden=false;$('pairStatus').textContent='Scan with the iPhone camera or Android app within 60 seconds.';
 delete pairing.token;
});
$('approveDevice').onclick=()=>action($('approveDevice'),async()=>{await api(`/pairings/${pairing.id}`,{action:'approve'});message('Device approved. Tap Connect / refresh pairing on the phone.');await poll();});
$('revokeDevice').onclick=()=>action($('revokeDevice'),async()=>{await api(`/pairings/${pairing.id}`,{action:'revoke'});pairing=null;$('qr').replaceChildren();$('pairStatus').textContent='Device disconnected.';$('approveDevice').hidden=true;$('revokeDevice').hidden=true;});
for(const [id,revoke] of [['grant',false],['revokeGrant',true]])$(id).onclick=()=>action($(id),async()=>{await api('/grants',{userId:$('user').value,warehouse:$('grantWarehouse').value,revoke});message(revoke?'Warehouse access revoked.':'Warehouse access granted.');});
$('refresh').onclick=()=>action($('refresh'),async()=>{try{await refresh();}catch(error){syncMessage('Could not refresh receipts. Displayed rows may be out of date. '+error.message,true);}});
const actions={SUBMITTED:[['receive','Receive into quarantine'],['reject','Reject draft']],PENDING_QC:[['qc_accept','Accept QC'],['qc_hold','Quality hold']],PENDING_MANAGER:[['approve','Manager approve']],APPROVED:[['post','Post to inventory']]};
const permission={receive:['PRODUCTION_MANAGER','FACTORY_MANAGER','CEO'],reject:['PRODUCTION_MANAGER','FACTORY_MANAGER','CEO'],qc_accept:['PRODUCTION_MANAGER','FACTORY_MANAGER','CEO'],qc_hold:['PRODUCTION_MANAGER','FACTORY_MANAGER','CEO'],approve:['FACTORY_MANAGER','CEO'],post:['CEO']};
async function refresh(){const {receipts}=await api('/receipts');syncMessage('Receipts updated at '+new Date().toLocaleTimeString()+'.');$('receipts').replaceChildren();for(const row of receipts){const tr=document.createElement('tr'),p=row.payload;for(const value of [new Date(row.createdAt).toLocaleString(),`${p.sku} · ${p.quantity} ${p.unit}`,`${p.reference} · ${p.supplier}`,p.destinationWarehouse,row.status]){const cell=document.createElement('td');cell.textContent=value;tr.append(cell);}const cell=document.createElement('td'),details=document.createElement('details'),summary=document.createElement('summary'),content=document.createElement('pre');summary.textContent='Details';content.textContent=`Date: ${p.date}\nLot: ${p.lotNo||'—'}\nSerial: ${p.serialNo||'—'}\nExpiry: ${p.expiryDate||'—'}\nNote: ${p.note||'—'}`;details.append(summary,content);cell.append(details);
 for(const [command,label] of actions[row.status]||[]){if(row.submittedBy===actor.user.id||!permission[command].includes(actor.user.role))continue;const button=document.createElement('button');button.textContent=label;button.onclick=()=>action(button,async()=>{let note='';if(['reject','qc_hold'].includes(command)){note=prompt('Reason (required)')||'';if(!note.trim())return;}else if(!confirm(`${label}: ${p.quantity} ${p.unit} of ${p.sku}?`))return;await api(`/receipts/${row.id}`,{action:command,version:row.version,note});message('Saved on the server. Refresh the main ERP page to see updated inventory.');await refresh();});cell.append(button);}tr.append(cell);$('receipts').append(tr);}if(!receipts.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='No receipts submitted yet.';tr.append(td);$('receipts').append(tr);}}
async function poll(){
 if(inFlight||!credentials||document.hidden)return;
 inFlight=true;
 try{
  const currentPairing=pairing;
  if(currentPairing){
   const status=await api(`/pairings/${currentPairing.id}`);
   // A response started before Disconnect must not restore the old device UI.
   if(pairing===currentPairing){
    const expired=Date.now()>=status.expiresAt;
    $('approveDevice').hidden=!status.claimed||status.approved||status.revoked||expired;
    if(status.claimed||Date.now()>currentPairing.claimUntil)$('qr').replaceChildren();
    $('pairStatus').textContent=status.revoked?'Device disconnected. Create a new pairing to reconnect.':expired?'Session expired. Create a new pairing.':status.claimed?`${status.deviceName} · fingerprint ${status.keyFingerprint} · ${status.approved?'Approved':'Compare with phone, then approve'}`:Date.now()>currentPairing.claimUntil?'QR expired. Create a new pairing.':'Waiting for phone…';
    if(status.revoked||expired){pairing=null;$('qr').replaceChildren();$('revokeDevice').hidden=true;}
   }
  }
  await refresh();
 }catch(error){syncMessage('Connection check failed. Displayed information may be out of date. '+error.message,true);}
 finally{inFlight=false;}
}

// One immutable event is retained after an uncertain response, so Retry cannot duplicate stock.
let desktopItem=null,desktopPending=null,desktopBusy=false,desktopUncertain=false,lookupSequence=0;
function desktopStatus(value){$('desktopStatus').textContent=value;}
function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function setupDesktop(bootstrap){
 options('desktopWarehouse',bootstrap.warehouses,'code',x=>`${x.code} · ${x.name}`);
 const allowed=['OPERATOR','PRODUCTION_MANAGER','FACTORY_MANAGER','CEO'].includes(bootstrap.actor.user.role)&&bootstrap.warehouses.length>0;
 $('desktopLookup').hidden=!allowed;$('desktopReceipt').hidden=!allowed;
 $('desktopDate').value=localDate();
 if(!allowed)$('desktopItem').textContent='Your role or warehouse permissions do not allow receipt submission.';
}
function invalidateDesktop(){
 lookupSequence++;desktopItem=null;$('desktopFields').disabled=true;$('submitDesktop').disabled=true;
 $('desktopItem').textContent='Identify an item to continue.';
}
$('desktopCode').oninput=invalidateDesktop;
$('desktopWarehouse').onchange=invalidateDesktop;
$('desktopLookup').onsubmit=event=>{
 event.preventDefault();if(desktopPending||desktopBusy)return;
 const sequence=++lookupSequence,warehouse=$('desktopWarehouse').value,code=$('desktopCode').value.trim();
 desktopItem=null;$('desktopFields').disabled=true;$('submitDesktop').disabled=true;
 action($('identifyDesktop'),async()=>{
  const result=await api('/lookup',{warehouse,code});if(sequence!==lookupSequence)return;
  desktopItem={...result.item,warehouse};$('desktopItem').textContent=`${desktopItem.sku} · ${desktopItem.name} · ${desktopItem.unit}`;
  $('desktopLot').required=desktopItem.lotTracked;$('desktopSerial').required=desktopItem.serialTracked;
  $('desktopFields').disabled=false;$('submitDesktop').disabled=false;desktopStatus('');
 });
};
function lockDesktop(locked){
 for(const id of ['desktopWarehouse','desktopCode','identifyDesktop','desktopFields'])$(id).disabled=locked;
}
$('desktopReceipt').onsubmit=event=>{
 event.preventDefault();if(desktopBusy||!desktopItem)return;
 if(!desktopPending){
  if(!$('desktopReceipt').reportValidity())return;
  const fields=Object.fromEntries(new FormData($('desktopReceipt')));
  fields.quantity=parseQuantity(fields.quantity);
  if(!Number.isFinite(fields.quantity)){desktopStatus('Enter a positive quantity, at most 1,000,000,000. Example: 12.5 or ۱۲٫۵.');return;}
  desktopPending={...fields,clientEventId:crypto.randomUUID(),sku:desktopItem.sku,unit:desktopItem.unit,destinationWarehouse:desktopItem.warehouse};
 }
 desktopBusy=true;lockDesktop(true);$('submitDesktop').disabled=true;
 (async()=>{
  try{
   const result=await api('/receipts',desktopPending);
   desktopStatus(`Receipt ${result.receipt.id} · ${result.receipt.status}. Saved on the server; an independent reviewer must continue.`);
   desktopPending=null;desktopUncertain=false;$('desktopReceipt').reset();$('desktopDate').value=localDate();
   lockDesktop(false);invalidateDesktop();$('desktopCode').value='';$('submitDesktop').textContent='Submit for review';
   try{await refresh();}catch{syncMessage('Receipt saved. Inbox refresh failed; use Refresh to see it.',true);}
  }catch(error){
   // Definite validation/auth failures did not accept a new receipt. Uncertain failures retain the exact event.
   if(!desktopUncertain&&[400,401,403,404,413,422].includes(error.status)){
    desktopPending=null;lockDesktop(false);$('submitDesktop').disabled=false;
    desktopStatus(error.message+' Correct the details or permissions and submit again.');
   }else{
    desktopUncertain=true;desktopStatus('Submission not confirmed. Keep this page open and retry the same receipt. '+error.message);
    $('submitDesktop').textContent='Retry same receipt';$('submitDesktop').disabled=false;
   }
  }finally{desktopBusy=false;}
 })();
};

function receiptMode(){
 const requested=location.hash.slice(1);
 return ['computer','mobile','usb'].includes(requested)?requested:'computer';
}
function applyReceiptMode(){
 const mode=receiptMode();
 $('desktopEntry').hidden=mode==='mobile';$('mobileEntry').hidden=mode!=='mobile';$('usbPanel').hidden=mode!=='usb';
 $('entryTitle').textContent=mode==='usb'?'Receive with USB scanner':'Receive on this computer';
 $('entryHint').textContent=mode==='usb'?'Connect your scanner, focus the barcode field and scan an item.':'No phone required. Type the SKU or barcode below.';
 for(const link of document.querySelectorAll('.receipt-modes a')) {
  if(link.hash==='#'+mode)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 }
}
window.addEventListener('hashchange',applyReceiptMode);
applyReceiptMode();
let usbDevice=null;
function usbStatus(text){$('usbConnection').textContent=text;}
$('focusUsb').onclick=()=>{if(!$('desktopCode').disabled)$('desktopCode').focus();};
$('desktopCode').addEventListener('keydown',event=>{
 if(receiptMode()==='usb'&&event.key==='Enter'&&event.currentTarget.value.trim()){
  $('usbInputStatus').textContent='Barcode input received at '+new Date().toLocaleTimeString()+'. Cable connection is not verified by this input.';
 }
});
if(navigator.hid){
 $('connectUsb').onclick=()=>action($('connectUsb'),async()=>{
  try {
   const devices=await navigator.hid.requestDevice({filters:[{usagePage:0x8c}]});
   if(!devices.length)return;
   const selected=devices[0];
   if(usbDevice&&usbDevice!==selected&&usbDevice.opened)await usbDevice.close();
   usbDevice=selected;
   if(!selected.opened)await selected.open();
   if(usbDevice===selected)usbStatus('Connected HID scanner: '+(selected.productName||'Barcode scanner')+'. Test a scan in the barcode field.');
  }catch(error){usbDevice=null;usbStatus('USB connection not verified. Use keyboard mode in the barcode field. '+error.message);}
 });
 navigator.hid.addEventListener('disconnect',event=>{
  if(event.device===usbDevice){usbDevice=null;usbStatus('USB scanner disconnected.');}
 });
 navigator.hid.addEventListener('connect',event=>{
  if(event.device.collections?.some(c=>c.usagePage===0x8c))usbStatus('Compatible scanner detected. Click Check compatible USB scanner to verify access.');
 });
}else{
 $('connectUsb').disabled=true;
 usbStatus('Connection detection unavailable in this browser. Keyboard-mode barcode input remains available.');
}
