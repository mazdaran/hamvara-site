import {request,renderMessages} from './common.js';
import {Verification} from './verification.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),api=window.HAMVARA_SUPPORT_CONFIG.apiBase;
let lang=['en','fa','tr'].includes(params.get('lang'))?params.get('lang'):'en',session=null,busy=false,retry=null,timer=null,view=null;
try{session=JSON.parse(sessionStorage.getItem('hamvara-support-session')||'null');if(session&&!session.id)session=null;if(session)lang=session.lang||lang;}catch{}
if(params.get('embed')==='1')document.body.classList.add('embed');
let serviceReady=false,starting=false;
const verification=new Verification(window.HAMVARA_SUPPORT_CONFIG.turnstileSiteKey,()=>lang,()=>{$('begin').disabled=!serviceReady||starting||!verification.token;});
const copy=()=>window.HAMVARA_SUPPORT_COPY[lang];
function translate(){document.documentElement.lang=lang;document.documentElement.dir=lang==='fa'?'rtl':'ltr';$('language').value=lang;document.querySelectorAll('[data-copy]').forEach(n=>n.textContent=copy()[n.dataset.copy]);$('guide-link').href='/guides/'+(lang==='en'?'':lang+'/');$('text').placeholder=copy().placeholder;verification.paint();}
function error(message){$('error').hidden=!message;$('error').textContent=message||'';}
function save(){try{if(session)sessionStorage.setItem('hamvara-support-session',JSON.stringify(session));else sessionStorage.removeItem('hamvara-support-session');}catch{}}
function show(data){view=data;$('start').hidden=true;$('conversation').hidden=false;$('language').disabled=true;const c=copy();$('status').textContent=(data.online?c.online:c.offline)+'\n'+(data.pending?c.pending:({ai:c.aiMode,queued:c.queued,human:c.humanMode,closed:c.closed}[data.mode]));renderMessages($('messages'),data.messages,c);$('send').disabled=busy||data.pending||data.mode==='closed';$('text').disabled=data.mode==='closed';$('human').disabled=data.mode==='human'||data.mode==='queued'||data.mode==='closed';}
async function status(){try{const data=await request('/status',{api});serviceReady=data.ready&&data.verificationRequired===true;$('begin').disabled=!serviceReady||starting||!verification.token;if(serviceReady&&!session)verification.mount();$('ai-option').hidden=!data.ai;$('status').textContent=serviceReady?((data.online?copy().online:copy().offline)+'\n'+copy().ready):copy().unavailable;}catch{serviceReady=false;$('status').textContent=copy().unavailable;$('begin').disabled=true;}}
async function poll(){clearTimeout(timer);if(!session)return;try{const data=await request('/sessions/'+session.id,{api,token:session.token});show(data);}catch(e){if(e.status===401||e.status===404){session=null;save();$('conversation').hidden=true;$('start').hidden=false;$('language').disabled=false;await status();}else error(copy().failure);}if(session)timer=setTimeout(poll,document.hidden?15000:4000);}
$('language').onchange=()=>{lang=$('language').value;translate();status();};
$('begin').onclick=async()=>{
 error('');if(starting||!serviceReady||!verification.token)return;
 if(!$('consent').checked){error(copy().consentRequired);return;}
 starting=true;$('begin').disabled=true;
 try{const data=await request('/sessions',{api,method:'POST',body:{lang,consent:true,aiConsent:$('ai-consent').checked,turnstileToken:verification.token}});
  session={id:data.id,token:data.token,lang};save();verification.stop();show(data);poll();
 }catch{error(copy().unavailable);verification.reset();}
 finally{starting=false;$('begin').disabled=!serviceReady||!verification.token;}
};
$('composer').onsubmit=async e=>{e.preventDefault();if(!session||busy)return;const text=$('text').value.trim();if(!text)return;error('');if(!retry||retry.text!==text)retry={text,messageId:crypto.randomUUID()};busy=true;$('send').disabled=true;try{const data=await request('/sessions/'+session.id+'/messages',{api,token:session.token,method:'POST',body:retry});$('text').value='';retry=null;show(data);}catch{error(copy().failure);}finally{busy=false;if(view)show(view);}};
$('human').onclick=async()=>{try{show(await request('/sessions/'+session.id+'/handoff',{api,token:session.token,method:'POST',body:{}}));}catch{error(copy().error);}};
$('erase').onclick=async()=>{if(!session||!confirm(copy().eraseConfirm))return;try{await request('/sessions/'+session.id,{api,token:session.token,method:'DELETE'});session=null;retry=null;save();clearTimeout(timer);$('messages').replaceChildren();$('messages').dataset.last='';$('conversation').hidden=true;$('start').hidden=false;$('language').disabled=false;error('');status();}catch{error(copy().error);}};
translate();if(session)poll();else status();
