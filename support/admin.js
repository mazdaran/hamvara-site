import {request,renderMessages} from './common.js';
const $=id=>document.getElementById(id),api=window.HAMVARA_SUPPORT_CONFIG.apiBase;
const ACTIVE_MS=10000,INBOX_MS=30000,QUIET_MS=60000,IDLE_MS=120000,PRESENCE_MS=30000;
let key='',lang='en',selected=null,timer=null,lastSeen=0,busy=false,retry=null,generation=0;
let suspended=false;
let flight=null,signingIn=false,lastActivity=Date.now(),lastPresence=0,selectedView=null;
let listStamp='',quiet=0,failures=0,retryAt=0;
const copy=()=>window.HAMVARA_SUPPORT_COPY[lang];
function translate(){document.documentElement.lang=lang;document.documentElement.dir=lang==='fa'?'rtl':'ltr';document.querySelectorAll('[data-copy]').forEach(n=>n.textContent=copy()[n.dataset.copy]);}
function error(text){$('error').hidden=!text;$('error').textContent=text||'';}
const call=(path,method='GET',body)=>request('/admin/'+path,{api,token:key,method,body});
const stamp=c=>c?JSON.stringify([c.id,c.updated,c.mode,c.owner]):'';
function delay(){
 if(!key||suspended||navigator.onLine===false)return null;
 const inactive=document.hidden||Date.now()-lastActivity>=IDLE_MS;
 if(inactive&&!$('available').checked)return null;
 // Presence expires server-side after 75 seconds; online operators still receive
 // background notifications and renew presence every 30 seconds.
 if(inactive)return PRESENCE_MS;
 if(selected&&selectedView?.mode!=='closed')return ACTIVE_MS;
 return $('available').checked||quiet<2?INBOX_MS:QUIET_MS;
}
function schedule(){
 clearTimeout(timer);timer=null;
 const ms=delay();
 if(ms!==null)timer=setTimeout(()=>refresh(),Math.max(ms,retryAt-Date.now()));
}
function show(d){selectedView=d;$('thread').hidden=false;$('status').textContent=d.mode+(d.owner?' · '+d.owner:'');renderMessages($('messages'),d.messages,copy());$('reply').hidden=d.mode!=='human';$('claim').disabled=d.mode==='closed';}
async function select(id){
 if(busy)return;
 selected=id;selectedView=null;retry=null;lastActivity=Date.now();
 for(const button of $('threads').children)button.setAttribute('aria-pressed',String(button.dataset.id===id));$('text').value='';$('messages').dataset.last='';
 const g=generation;
 try{const d=await call('conversations/'+id);if(g===generation&&selected===id)show(d);}catch{if(g===generation)error(copy().error);}
 if(g===generation)schedule();
}
async function refresh(force=false){
 // All automatic, manual and language refreshes share one in-flight cycle.
 if(flight||!key)return false;
 clearTimeout(timer);timer=null;
 if(navigator.onLine===false||(!force&&delay()===null))return false;
 if(Date.now()<retryAt){schedule();return false;}
 const current={generation},g=generation;flight=current;
 try{
  const data=await call('conversations');if(g!==generation)return false;
  $('operator').textContent=data.operator;
  const hadSnapshot=listStamp!=='';
  const nextStamp=JSON.stringify(data.conversations.map(stamp));
  quiet=nextStamp===listStamp?quiet+1:0;
  if(nextStamp!==listStamp){
   $('threads').replaceChildren();
   for(const c of data.conversations){
    const b=document.createElement('button');
    b.textContent=c.lang.toUpperCase()+' · '+c.mode+' · '+c.id.slice(0,8)+'\n'+new Date(c.updated).toLocaleString();
    b.dataset.id=c.id;b.setAttribute('aria-pressed',String(c.id===selected));b.onclick=()=>select(c.id);$('threads').append(b);
   }
   if(!data.conversations.length)$('threads').textContent=copy().empty;
   listStamp=nextStamp;
  }
  const newest=Math.max(lastSeen,...data.conversations.map(c=>c.updated));
  if(hadSnapshot&&newest>lastSeen&&document.hidden&&'Notification'in window&&Notification.permission==='granted'){
   try{new Notification('Hamvara',{body:copy().newReply});}catch{/* Notifications may be unavailable on this device. */}
  }
  lastSeen=newest;
  const summary=data.conversations.find(c=>c.id===selected);
  if(selected&&!summary){selected=null;selectedView=null;$('thread').hidden=true;$('messages').replaceChildren();$('messages').dataset.last='';}
  // Do not reload an unchanged transcript or fetch it in a background tab.
  if(selected&&!busy&&!document.hidden&&(!selectedView||stamp(summary)!==stamp(selectedView)||selectedView.pending)){
   const id=selected,d=await call('conversations/'+id);
   if(g!==generation)return false;
   if(id===selected)show(d);
  }
  if(g!==generation)return false;
  if($('available').checked&&Date.now()-lastPresence>=PRESENCE_MS){
   await call('presence','POST',{online:true});if(g!==generation)return false;lastPresence=Date.now();
  }
  failures=0;retryAt=0;error('');return true;
 }catch(e){
  if(g!==generation)return false;
  if(e.status===401){logout(false);error(copy().authError);}
  else{
   failures=Math.min(failures+1,5);
   retryAt=Date.now()+Math.max(Math.min(300000,15000*2**(failures-1)),Math.max(0,Number(e.retryAfter)||0)*1000);
   error(copy().error);
  }
  return false;
 }finally{
  if(flight===current)flight=null;
  if(g===generation)schedule();
 }
}
async function logout(send=true){
 const old=key;generation++;key='';selected=null;selectedView=null;retry=null;flight=null;busy=false;clearTimeout(timer);timer=null;
 $('key').value='';$('text').value='';$('messages').replaceChildren();$('messages').dataset.last='';$('threads').replaceChildren();
 $('desk').hidden=true;$('thread').hidden=true;$('login').hidden=false;$('available').checked=false;
 lastSeen=0;lastPresence=0;listStamp='';quiet=0;failures=0;retryAt=0;
 if(send&&old)try{await request('/admin/presence',{api,token:old,method:'POST',body:{online:false}});}catch{}
}
$('login').onsubmit=async e=>{
 e.preventDefault();if(signingIn)return;signingIn=true;
 const g=++generation;key=$('key').value.trim();lastActivity=Date.now();error('');
 try{
  // The first refresh also authenticates: no duplicate conversations GET on login.
  if(await refresh(true)){
   if(g!==generation)return;$('key').value='';$('login').hidden=true;$('desk').hidden=false;
  }else if(g===generation){await logout(false);error(copy().authError);}
 }finally{signingIn=false;}
};
$('language').onchange=()=>{lang=$('language').value;translate();$('messages').dataset.last='';if(selectedView)show(selectedView);};
$('available').onchange=async()=>{
 const g=generation,online=$('available').checked;
 try{await call('presence','POST',{online});if(g!==generation)return;lastPresence=online?Date.now():0;}
 catch{if(g===generation){$('available').checked=false;error(copy().error);}}
 if(g===generation)schedule();
};
for(const action of ['claim','release','close'])$(action).onclick=async()=>{
 if(!selected||busy)return;busy=true;
 const id=selected,g=generation;
 try{const d=await call('conversations/'+id+'/'+action,'POST',{});if(g===generation&&id===selected){show(d);error('');}}
 catch{if(g===generation)error(copy().error);}
 finally{if(g===generation){busy=false;refresh();}}
};
$('reply').onsubmit=async e=>{
 e.preventDefault();if(!selected||busy)return;const text=$('text').value.trim();if(!text)return;
 if(!retry||retry.text!==text)retry={text,messageId:crypto.randomUUID()};busy=true;
 const id=selected,g=generation;
 try{const d=await call('conversations/'+id+'/reply','POST',retry);if(g===generation&&selected===id){show(d);$('text').value='';retry=null;error('');}}
 catch{if(g===generation)error(copy().failure);}
 finally{if(g===generation){busy=false;schedule();}}
};
function activity(){
 const wasInactive=Date.now()-lastActivity>=IDLE_MS;lastActivity=Date.now();
 if(key&&!document.hidden&&(wasInactive||timer===null)&&!flight)refresh();
}
for(const event of ['pointerdown','keydown','pointermove'])document.addEventListener(event,activity,{passive:true});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)schedule();else{lastActivity=Date.now();refresh();}
});
window.addEventListener('offline',schedule);
window.addEventListener('online',()=>{lastActivity=Date.now();refresh();});
window.addEventListener('pagehide',()=>{suspended=true;clearTimeout(timer);timer=null;});
window.addEventListener('pageshow',()=>{suspended=false;lastActivity=Date.now();if(key)refresh();});
$('refresh').onclick=()=>{lastActivity=Date.now();return refresh(true);};
$('logout').onclick=()=>logout();
$('notify').onclick=async()=>{if(!('Notification'in window)||await Notification.requestPermission()!=='granted')error(copy().notifyDenied);};
translate();
