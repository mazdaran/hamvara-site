import {request,renderMessages} from './common.js?v=events-1';
import {LiveConnection} from './live.js?v=events-1';
import {Verification} from './verification.js';
import {startError,startingText} from './start-errors.js?v=session-quota-2';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),api=window.HAMVARA_SUPPORT_CONFIG.apiBase;
let lang=['en','fa','tr'].includes(params.get('lang'))?params.get('lang'):'en',session=null,busy=false,retry=null,view=null;
let live=null,generation=0,flight=null,dirty=false,suspended=false,retryAt=0,connectionState='stopped',mutationEpoch=0,snapshotError=false;
try{session=JSON.parse(sessionStorage.getItem('hamvara-support-session')||'null');if(session&&(!session.id||!session.token))session=null;if(session&&['en','fa','tr'].includes(session.lang))lang=session.lang;}catch{}
if(params.get('embed')==='1')document.body.classList.add('embed');
let serviceReady=false,starting=false;
const verification=new Verification(window.HAMVARA_SUPPORT_CONFIG.turnstileSiteKey,()=>lang,()=>{$('begin').disabled=!serviceReady||starting||!verification.token;});
const copy=()=>window.HAMVARA_SUPPORT_COPY[lang];
function translate(){document.documentElement.lang=lang;document.documentElement.dir=lang==='fa'?'rtl':'ltr';$('language').value=lang;document.querySelectorAll('[data-copy]').forEach(n=>n.textContent=copy()[n.dataset.copy]);$('guide-link').href='/guides/'+(lang==='en'?'':lang+'/');$('text').placeholder=copy().placeholder;verification.paint();paintConnection();}
function paintConnection(){const labels={connected:'liveConnected',connecting:'liveConnecting',reconnecting:'liveReconnecting',paused:'livePaused',offline:'liveOffline',stopped:'liveStopped'};$('connection').textContent=session?(copy()[labels[connectionState]]||''):'';$('reconnect').hidden=!session||connectionState==='connected'||connectionState==='stopped';}
function error(message){$('error').hidden=!message;$('error').textContent=message||'';}
function save(){try{if(session)sessionStorage.setItem('hamvara-support-session',JSON.stringify(session));else sessionStorage.removeItem('hamvara-support-session');}catch{}}
function show(data){view=data;$('start').hidden=true;$('conversation').hidden=false;$('language').disabled=true;const c=copy();$('status').textContent=(data.online?c.online:c.offline)+'\n'+(data.pending?c.pending:({ai:c.aiMode,queued:c.queued,human:c.humanMode,closed:c.closed}[data.mode]));renderMessages($('messages'),data.messages,c);$('send').disabled=busy||data.pending||data.mode==='closed';$('text').disabled=data.mode==='closed';$('human').disabled=busy||data.mode==='human'||data.mode==='queued'||data.mode==='closed';}
async function status(){try{const data=await request('/status',{api});serviceReady=data.ready&&data.verificationRequired===true;$('begin').disabled=!serviceReady||starting||!verification.token;if(serviceReady&&!session)verification.mount();$('ai-option').hidden=!data.ai;if(!session)$('status').textContent=serviceReady?((data.online?copy().online:copy().offline)+'\n'+copy().ready):copy().unavailable;}catch{serviceReady=false;if(!session)$('status').textContent=copy().unavailable;$('begin').disabled=true;}}
function reset(){generation++;live?.close();live=null;session=null;view=null;retry=null;busy=false;flight=null;dirty=false;retryAt=0;save();$('text').value='';$('messages').replaceChildren();$('messages').dataset.last='';$('conversation').hidden=true;$('start').hidden=false;$('language').disabled=false;connectionState='stopped';paintConnection();status();}
async function refresh(){
 if(flight||!session||busy||suspended||navigator.onLine===false||Date.now()<retryAt)return;
 const current={},g=generation;flight=current;
 try{while(dirty&&session&&g===generation&&!busy){dirty=false;const epoch=mutationEpoch;const data=await request('/sessions/'+session.id,{api,token:session.token});if(g!==generation)return;if(busy||epoch!==mutationEpoch)dirty=true;else show(data);}retryAt=0;if(snapshotError){snapshotError=false;error('');connectionState=live?.status||'stopped';paintConnection();}}
 catch(e){if(g!==generation)return;if(e.status===401||e.status===404)reset();else{dirty=true;snapshotError=true;connectionState='paused';paintConnection();retryAt=Date.now()+Math.max(5000,(Number(e.retryAfter)||0)*1000);error(copy().error);}}
 finally{if(flight===current)flight=null;}
}
function connect(){
 live?.close();const g=generation;
 live=new LiveConnection({api,path:'/sessions/'+session.id+'/events-ticket',token:()=>session?.token,
  onState:state=>{if(g===generation){connectionState=state;paintConnection();}},
  onAuthError:()=>{if(g===generation)reset();},
  onEvent:event=>{
   if(g!==generation)return;
   if(event.type==='ready'||event.type==='changed'){dirty=true;refresh();}
   else if(event.type==='presence'&&view)show({...view,online:event.online});
   else if(event.type==='deleted'){reset();error(copy().deleted);}
  }
 });live.setActive(!suspended);
}
$('language').onchange=()=>{lang=$('language').value;translate();status();};
$('begin').onclick=async()=>{
 error('');if(starting||!serviceReady||!verification.token)return;
 if(!$('consent').checked){error(copy().consentRequired);return;}
 starting=true;$('begin').disabled=true;$('begin').textContent=startingText(lang);
 try{const data=await request('/sessions',{api,method:'POST',body:{lang,consent:true,aiConsent:$('ai-consent').checked,turnstileToken:verification.token}});
  generation++;session={id:data.id,token:data.token,lang};save();verification.stop();show(data);connect();
 }catch(e){error(startError(e,lang));verification.reset();}
 finally{starting=false;$('begin').textContent=copy().start;$('begin').disabled=!serviceReady||!verification.token;}
};
$('composer').onsubmit=async e=>{
 e.preventDefault();if(!session||busy)return;const text=$('text').value.trim();if(!text)return;error('');
 if(!retry||retry.text!==text)retry={text,messageId:crypto.randomUUID()};busy=true;mutationEpoch++;$('send').disabled=true;const g=generation;
 try{const data=await request('/sessions/'+session.id+'/messages',{api,token:session.token,method:'POST',body:retry});if(g!==generation)return;$('text').value='';retry=null;show(data);}
 catch{if(g===generation)error(copy().failure);}
 finally{if(g===generation){busy=false;if(view)show(view);refresh();}}
};
$('human').onclick=async()=>{
 if(!session||busy)return;busy=true;mutationEpoch++;const g=generation;if(view)show(view);
 try{const data=await request('/sessions/'+session.id+'/handoff',{api,token:session.token,method:'POST',body:{}});if(g===generation)show(data);}
 catch{if(g===generation)error(copy().error);}
 finally{if(g===generation){busy=false;if(view)show(view);refresh();}}
};
$('erase').onclick=async()=>{if(!session||busy||!confirm(copy().eraseConfirm))return;const g=generation;try{await request('/sessions/'+session.id,{api,token:session.token,method:'DELETE'});if(g===generation){reset();error('');}}catch{if(g===generation)error(copy().error);}};
$('reconnect').onclick=()=>{live?.reconnect();dirty=true;refresh();};
document.addEventListener('visibilitychange',()=>{if(!document.hidden){live?.wake();refresh();}});
window.addEventListener('pagehide',()=>{suspended=true;live?.setActive(false);});
window.addEventListener('pageshow',()=>{suspended=false;if(session)live?.setActive(true);});
translate();if(session)connect();else status();
