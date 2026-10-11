import {createIdentity,signedRequest,sameScope,pairingToken,newReceipt} from './mobile-receipt-client.mjs?v=2';
const $=id=>document.getElementById(id);
let startupError='';
let token='',identity=null,session=null,item=null,pending=null,busy=false,scanner=null,scannerStarting=false;
try{if(location.hash)token=pairingToken(location.href,location.origin);}catch(error){startupError=error.message;}
history.replaceState(null,'',location.pathname+location.search);
const now=new Date();$('date').value=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
function show(text,error=false){$('message').textContent=text;$('message').className=error?'error':'';}
function active(){return session?.status==='ACTIVE'&&Date.parse(session.expiresAt)>Date.now();}
function paint(){
 $('fields').disabled=busy||!active()||!!pending;
 $('connect').disabled=busy||!token;$('useLink').disabled=busy;
 $('submitReceipt').disabled=!item||busy||!active()||!!pending;
 $('pendingPanel').hidden=!pending;
 $('retry').disabled=busy||!active()||!sameScope(pending?.scope,session);
 if(session)$('connection').textContent=`${active()?'Connected':session.status==='AWAITING_APPROVAL'?'Waiting for laptop approval':'Session expired'} · ${session.warehouse}`;
}
async function action(fn){if(busy)return;busy=true;paint();try{await fn();}catch(error){if([401,410].includes(error.status)){session=null;$('connection').textContent='Pairing expired or revoked. Create a new QR.';}show(error.message||'Connection failed. Keep this page open and retry.',true);}finally{busy=false;paint();}}
async function connect(){
 if(!token)throw Error('Open a new receipt QR from the laptop in Safari.');
 identity??=await createIdentity();
 const data=await signedRequest(identity,token,'/api/mrp/mobile-receipts/pair',{publicKey:identity.publicKey,deviceName:/iPhone|iPad/.test(navigator.userAgent)?'iPhone / iPad browser':'Mobile browser'});
 if(data.session.keyFingerprint!==identity.fingerprint)throw Error('Device fingerprint mismatch.');
 const previous=session;session=data.session;
 if(previous&&!sameScope(previous,session)){item=null;$('item').textContent='Identify the item for this company.';}
 $('fingerprint').textContent=`Fingerprint: ${identity.fingerprint}`;
 if(pending&&!sameScope(pending.scope,session))throw Error('This pending receipt belongs to another company, user or warehouse. Reconnect to its original scope to retry.');
 show(active()?'Ready. Scan goods or enter a barcode.':'Compare fingerprints, approve on the laptop, then tap Connect / refresh pairing.');
}
$('connect').onclick=()=>action(connect);
$('useLink').onclick=()=>action(async()=>{const next=pairingToken($('pairLink').value.trim(),location.origin);await stopCamera();token=next;session=null;item=null;$('item').textContent='Identify the item for this company.';$('pairLink').value='';await connect();});
async function lookup(){
 item=null;paint();$('item').textContent='Identifying…';
 const code=$('code').value.trim();if(!code)throw Error('Scan or enter a barcode.');
 try{const data=await signedRequest(identity,token,'/api/mrp/mobile-receipts/lookup',{code});item=data.item;
 $('item').textContent=`${item.sku} — ${item.name} · ${item.unit} · ${data.warehouse}`;
 $('lotNo').required=!!item.lotTracked;$('serialNo').required=!!item.serialTracked;
 show('Item identified. Complete the receipt details.');
 }catch(error){$('item').textContent='Item not identified.';throw error;}
}
$('code').oninput=()=>{item=null;$('item').textContent='Identify this code before sending.';paint();};
$('code').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();action(lookup);}};
$('lookup').onclick=()=>action(lookup);
async function stopCamera(){const current=scanner;scanner=null;if(current){await current.stop().catch(()=>{});current.clear();}$('stopCamera').hidden=true;}
let cameraLibrary;
function loadCamera(){return cameraLibrary??=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='html5-qrcode.min.js';script.onload=resolve;script.onerror=()=>{cameraLibrary=null;reject(Error('Camera scanner could not load. Check internet and retry, or enter the barcode.'));};document.head.append(script);});}
$('startCamera').onclick=()=>action(async()=>{
 await stopCamera();await loadCamera();scannerStarting=true;
 const current=new window.Html5Qrcode('reader');scanner=current;
 try{await current.start({facingMode:'environment'},{fps:10,qrbox:(width,height)=>({width:Math.min(260,Math.floor(width*.85)),height:Math.min(160,Math.floor(height*.6))})},code=>{if(busy||scanner!==current)return;action(async()=>{await stopCamera();$('code').value=code;await lookup();});});$('stopCamera').hidden=false;show('Point the rear camera at the goods barcode.');}
 catch{scanner=null;current.clear();throw Error('Camera unavailable. Allow camera access in Safari, or enter the barcode.');}
 finally{scannerStarting=false;if(document.hidden)await stopCamera();}
});
$('stopCamera').onclick=()=>action(stopCamera);
async function deliver(){
 if(!pending||!active()||!sameScope(pending.scope,session))throw Error('Reconnect to the original company, user and warehouse before retrying.');
 const result=await signedRequest(identity,token,'/api/mrp/mobile-receipts',pending.payload);
 if(!result.receipt?.id)throw Error('Confirmation missing. Keep this page open and retry the same receipt.');
 $('lastReceipt').textContent=`${result.receipt.payload.reference} · ${result.receipt.id} · ${result.receipt.status}${result.duplicate?' · already received':''}`;
 pending=null;item=null;for(const id of ['code','quantity','reference','lotNo','serialNo','expiryDate','note'])$(id).value='';
 $('item').textContent='Scan the next item.';show('Receipt confirmed in the web inbox. Awaiting normal review.');
}
$('receiptForm').onsubmit=event=>{event.preventDefault();return action(async()=>{
 if(!item||!active())throw Error('Connect and identify an item first.');
 await stopCamera();const fields=Object.fromEntries(['quantity','reference','supplier','date','lotNo','serialNo','expiryDate','note'].map(id=>[id,$(id).value.trim()]));
 const payload=newReceipt(item,session,fields);pending={scope:{...session},payload};
 $('pendingText').textContent=`${payload.reference} · ${payload.sku} · ${payload.quantity} ${payload.unit} → ${payload.destinationWarehouse}`;
 try{await deliver();}catch(error){if([400,403,422].includes(error.status))pending=null;throw error;}
});};
$('retry').onclick=()=>action(deliver);
window.addEventListener('beforeunload',event=>{if(pending||$('reference').value||$('quantity').value){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!scannerStarting)stopCamera();paint();});
setInterval(()=>{paint();if(!active()&&scanner&&!scannerStarting)stopCamera();},1000);
paint();if(token)action(connect);else if(startupError)show(startupError,true);else show('Create a receipt pairing QR on the laptop, then open it with the iPhone camera in Safari.');
