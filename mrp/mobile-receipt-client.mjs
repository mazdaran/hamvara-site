const encoder=new TextEncoder();
export const base64url=value=>btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const digest=async value=>base64url(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
export async function createIdentity(){
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['sign','verify']);
 const publicKey=base64url(await crypto.subtle.exportKey('spki',keys.publicKey));
 return {privateKey:keys.privateKey,publicKey,fingerprint:(await digest(publicKey)).slice(0,16)};
}
export async function signedRequest(identity,token,path,body,fetcher=fetch){
 if(!['/api/mrp/mobile-receipts','/api/mrp/mobile-receipts/pair','/api/mrp/mobile-receipts/lookup'].includes(path))throw Error('Invalid receipt endpoint.');
 const raw=JSON.stringify(body),time=String(Date.now()),nonce=crypto.randomUUID();
 const canonical=['POST',path,time,nonce,await digest(raw)].join('\n');
 const proof=base64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',identity.privateKey,encoder.encode(canonical)));
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetcher(path,{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,headers:{'Content-Type':'application/json','X-Hamvara-Scan-Token':token,'X-Hamvara-Time':time,'X-Hamvara-Nonce':nonce,'X-Hamvara-Proof':proof},body:raw});
  const data=await response.json();
  if(!response.ok)throw Object.assign(Error(data.error||'Request failed.'),{status:response.status});
  return data;
 }finally{clearTimeout(timeout);}
}
export function sameScope(a,b){return !!a&&!!b&&['workspaceId','userId','warehouse'].every(k=>a[k]===b[k]);}
export function pairingToken(value,origin){
 const url=new URL(value,origin);
 if(url.origin!==origin||url.pathname!=='/mrp/mobile-receipt.html')throw Error('Use a receipt pairing link from this same Hamvara site.');
 const token=new URLSearchParams(url.hash.slice(1)).get('token')||'';
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error('Invalid pairing link. Create a new QR on the laptop.');
 return token;
}
export function newReceipt(item,scope,fields){
 const quantity=Number(fields.quantity);
 if(!Number.isFinite(quantity)||quantity<=0||quantity>1e9)throw Error('Enter a positive quantity, at most 1,000,000,000.');
 if(!fields.reference.trim()||!fields.supplier.trim())throw Error('Reference and supplier are required.');
 if(item.lotTracked&&!fields.lotNo.trim())throw Error('Lot number is required.');
 if(item.serialTracked&&(!fields.serialNo.trim()||quantity!==1))throw Error('Serial-tracked items require a serial number and quantity 1.');
 return Object.freeze({...fields,quantity,clientEventId:crypto.randomUUID(),sku:item.sku,unit:item.unit,destinationWarehouse:scope.warehouse});
}
