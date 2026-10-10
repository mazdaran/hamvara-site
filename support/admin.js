import {request,renderMessages} from './common.js?v=events-1';
import {LiveConnection} from './live.js?v=events-1';
const $=id=>document.getElementById(id),api=window.HAMVARA_SUPPORT_CONFIG.apiBase;
let key='',lang='en',selected=null,busy=false,retry=null,generation=0,live=null,suspended=false;
let selectedView=null,flight=null,signingIn=false,listStamp='',lastSeen=0;
let listDirty=false,detailDirty=false,actionEpoch=0,retryAt=0,connectionState='stopped';
const copy=()=>window.HAMVARA_SUPPORT_COPY[lang];
function translate(){document.documentElement.lang=lang;document.documentElement.dir=lang==='fa'?'rtl':'ltr';document.querySelectorAll('[data-copy]').forEach(n=>n.textContent=copy()[n.dataset.copy]);paintConnection();}
function paintConnection(){const labels={connected:'liveConnected',connecting:'liveConnecting',reconnecting:'liveReconnecting',paused:'livePaused',offline:'liveOffline',stopped:'liveStopped'};$('connection').textContent=copy()[labels[connectionState]]||'';$('reconnect').hidden=!key||connectionState==='connected'||connectionState==='stopped';}
function error(text){$('error').hidden=!text;$('error').textContent=text||'';}
const call=(path,method='GET',body)=>request('/admin/'+path,{api,token:key,method,body});
function show(d){selectedView=d;$('thread').hidden=false;$('status').textContent=d.mode+(d.owner?' · '+d.owner:'');renderMessages($('messages'),d.messages,copy());$('reply').hidden=d.mode!=='human';$('claim').disabled=d.mode==='closed';}
function resetThread(){selected=null;selectedView=null;detailDirty=false;$('thread').hidden=true;$('messages').replaceChildren();$('messages').dataset.last='';$('status').textContent=copy().choose;}
async function select(id){
 if(busy)return;selected=id;selectedView=null;retry=null;actionEpoch++;
 for(const button of $('threads').children)button.setAttribute('aria-pressed',String(button.dataset.id===id));
 $('text').value='';$('messages').dataset.last='';detailDirty=true;await refresh();
}
async function refresh(force=false){
 if(force){listDirty=true;detailDirty=Boolean(selected);}
 if(flight||!key||navigator.onLine===false||suspended||Date.now()<retryAt)return;
 const current={},g=generation;flight=current;let failed=false;
 try{
  // Drain changes that arrived while a snapshot was in flight, never on a timer.
  while(g===generation&&(listDirty||(detailDirty&&selected&&!busy&&!document.hidden))){
   if(listDirty){
    listDirty=false;const data=await call('conversations');if(g!==generation)return;
    $('operator').textContent=data.operator;
    const hadSnapshot=listStamp!=='';
    const nextStamp=JSON.stringify(data.conversations);
    if(nextStamp!==listStamp){
     $('threads').replaceChildren();
     for(const c of data.conversations){const b=document.createElement('button');b.textContent=c.lang.toUpperCase()+' · '+c.mode+' · '+c.id.slice(0,8)+'\n'+new Date(c.updated).toLocaleString();b.dataset.id=c.id;b.setAttribute('aria-pressed',String(c.id===selected));b.onclick=()=>select(c.id);$('threads').append(b);}
     if(!data.conversations.length)$('threads').textContent=copy().empty;listStamp=nextStamp;
    }
    const newest=Math.max(lastSeen,...data.conversations.map(c=>c.updated));
    if(hadSnapshot&&newest>lastSeen&&document.hidden&&'Notification'in window&&Notification.permission==='granted'){try{new Notification('Hamvara',{body:copy().newReply});}catch{}}
    lastSeen=newest;
    // A selected conversation can fall outside the latest 100; its own GET decides deletion.
   }
   if(detailDirty&&selected&&!busy&&!document.hidden){
    detailDirty=false;const id=selected,epoch=actionEpoch;
    try{const d=await call('conversations/'+id);if(g!==generation)return;if(id===selected&&epoch===actionEpoch&&!busy)show(d);else if(id===selected)detailDirty=true;}
    catch(e){if(e.status===404&&g===generation&&id===selected)resetThread();else throw e;}
   }
  }
  if(g===generation){retryAt=0;error('');}
 }catch(e){
  failed=true;if(g!==generation)return;
  listDirty=true;detailDirty=Boolean(selected);
  if(e.status===401){logout();error(copy().authError);}
  else{retryAt=Date.now()+Math.max(5000,(Number(e.retryAfter)||0)*1000);error(copy().error);}
 }finally{
  if(flight===current)flight=null;
  // Errors wait for a real event or an explicit refresh; no hidden fallback polling.
  if(!failed&&g===generation&&(listDirty||(detailDirty&&selected&&!busy&&!document.hidden)))refresh();
 }
}
function updateActive(){live?.setActive(Boolean(key&&!suspended&&(!document.hidden||$('available').checked)));}
function connect(){
 const g=generation;
 live=new LiveConnection({api,path:'/admin/events-ticket',token:()=>key,available:()=>$('available').checked,
  onState:state=>{if(g!==generation)return;connectionState=state;paintConnection();if(state==='connected'){signingIn=false;$('key').value='';$('login').hidden=true;$('desk').hidden=false;}if(state==='paused'||state==='offline')signingIn=false;},
  onAuthError:()=>{if(g===generation){logout();error(copy().authError);}},
  onEvent:event=>{
   if(g!==generation)return;
   if(event.type==='ready'){if(event.online!==$('available').checked)live.setAvailable($('available').checked);listDirty=true;detailDirty=Boolean(selected);refresh();}
   if(event.type==='changed'){listDirty=true;if(event.id===selected)detailDirty=true;refresh();}
  }
 });updateActive();
}
function logout(){
 generation++;live?.close();live=null;key='';busy=false;signingIn=false;retry=null;flight=null;actionEpoch++;
 resetThread();$('key').value='';$('text').value='';$('threads').replaceChildren();$('desk').hidden=true;$('login').hidden=false;$('available').checked=false;
 listStamp='';lastSeen=0;listDirty=false;retryAt=0;connectionState='stopped';paintConnection();
}
$('login').onsubmit=e=>{e.preventDefault();if(signingIn)return;live?.close();generation++;key=$('key').value.trim();signingIn=true;error('');connect();};
$('language').onchange=()=>{lang=$('language').value;translate();$('messages').dataset.last='';if(selectedView)show(selectedView);};
$('available').onchange=()=>{live?.setAvailable($('available').checked);updateActive();};
for(const action of ['claim','release','close'])$(action).onclick=async()=>{
 if(!selected||busy)return;busy=true;actionEpoch++;const id=selected,g=generation;
 try{const d=await call('conversations/'+id+'/'+action,'POST',{});if(g===generation&&id===selected){show(d);error('');}}
 catch{if(g===generation)error(copy().error);}
 finally{if(g===generation){busy=false;listDirty=true;detailDirty=true;refresh();}}
};
$('reply').onsubmit=async e=>{
 e.preventDefault();if(!selected||busy)return;const text=$('text').value.trim();if(!text)return;
 if(!retry||retry.text!==text)retry={text,messageId:crypto.randomUUID()};busy=true;actionEpoch++;const id=selected,g=generation;
 try{const d=await call('conversations/'+id+'/reply','POST',retry);if(g===generation&&selected===id){show(d);$('text').value='';retry=null;error('');}}
 catch{if(g===generation)error(copy().failure);}
 finally{if(g===generation){busy=false;refresh();}}
};
document.addEventListener('visibilitychange',()=>{updateActive();if(!document.hidden){live?.wake();refresh();}});
window.addEventListener('pagehide',()=>{suspended=true;updateActive();});
window.addEventListener('pageshow',()=>{suspended=false;updateActive();});
$('refresh').onclick=()=>{if(live?.status!=='connected')live?.reconnect();return refresh(true);};
$('reconnect').onclick=()=>live?.reconnect();
$('logout').onclick=logout;
$('notify').onclick=async()=>{if(!('Notification'in window)||await Notification.requestPermission()!=='granted')error(copy().notifyDenied);};
translate();
