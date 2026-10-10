import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function harness(){
 let now=1000000,seq=0,intercept=null;
 const timers=new Map(),nodes=new Map(),docEvents=new Map(),winEvents=new Map(),calls=[],notifications=[];
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,checked:false,dataset:{},children:[],attributes:{},
   replaceChildren(){this.children=[];},append(n){this.children.push(n);},setAttribute(k,v){this.attributes[k]=v;}});
  return nodes.get(id);
 };
 const rows=[];
 const doc={hidden:false,documentElement:{},getElementById:node,querySelectorAll:()=>[],createElement:()=>node('button-'+(++seq)),addEventListener:(event,fn)=>docEvents.set(event,fn)};
 const navigator={onLine:true};
 const window={HAMVARA_SUPPORT_CONFIG:{apiBase:'https://api.test'},HAMVARA_SUPPORT_COPY:{en:{empty:'Empty',error:'Error',authError:'Auth',newReply:'New reply'},fa:{}},addEventListener:(event,fn)=>winEvents.set(event,fn)};
 class Notification {static permission='granted';constructor(...args){notifications.push(args);}}
 window.Notification=Notification;
 const request=async(path,options)=>{
  calls.push({path,options:structuredClone(options),at:now});
  if(intercept){const result=intercept(path,options);if(result!==undefined)return await result;}
  if(path==='/admin/conversations')return structuredClone({operator:'Test operator',conversations:rows});
  if(path==='/admin/presence')return {online:options.body.online};
  const row=rows.find(r=>path==='/admin/conversations/'+r.id);
  if(row)return {...structuredClone(row),messages:[]};
  throw Error('Unexpected route '+path);
 };
 const context=vm.createContext({window,document:doc,navigator,Notification,request,renderMessages:(el,m)=>{el.rendered=m;},crypto,
  Date:class extends Date {static now(){return now;}},
  setTimeout(fn,ms){const id=++seq;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(readFileSync(new URL('../../support/admin.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),context);
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 async function advance(ms){
  const end=now+ms;
  for(let n=0;n<10000;n++){
   const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
   if(!next||next[1].at>end){now=end;return;}
   now=next[1].at;timers.delete(next[0]);await next[1].fn();await flush();
  }
  throw Error('Timer runaway');
 }
 return {node,doc,navigator,rows,calls,timers,notifications,advance,flush,
  intercept(fn){intercept=fn;},
  login:async()=>{node('key').value='test-only-operator-key';await node('login').onsubmit({preventDefault(){}});await flush();},
  hide:async hidden=>{doc.hidden=hidden;await docEvents.get('visibilitychange')();await flush();},
  activity:async()=>{await docEvents.get('pointerdown')();await flush();},
  network:async online=>{navigator.onLine=online;await winEvents.get(online?'online':'offline')();await flush();}
 };
}
const listCalls=h=>h.calls.filter(c=>c.path==='/admin/conversations');
const details=h=>h.calls.filter(c=>c.path==='/admin/conversations/thread-1');
const row=()=>({id:'thread-1',lang:'en',mode:'human',owner:'operator',updated:1000000});

test('one authenticated list fetch on login; concurrent refreshes and language changes do not duplicate it',async()=>{
 const h=harness();await h.login();assert.equal(listCalls(h).length,1);
 let release;h.intercept(path=>path==='/admin/conversations'?new Promise(resolve=>{release=resolve;}):undefined);
 const pending=h.node('refresh').onclick();await h.node('refresh').onclick();
 h.node('language').value='fa';h.node('language').onchange();assert.equal(listCalls(h).length,2);
 release({operator:'Test',conversations:[]});await pending;assert.equal(h.timers.size,1);
});

test('hidden offline operator sends no requests for 24h; returning resumes once',async()=>{
 const h=harness();await h.login();await h.hide(true);await h.advance(86400000);
 assert.equal(h.calls.length,1);assert.equal(h.timers.size,0);
 await h.hide(false);assert.equal(listCalls(h).length,2);assert.equal(h.timers.size,1);
});

test('visible but idle offline operator stops; interaction resumes polling',async()=>{
 const h=harness();await h.login();await h.advance(86400000);
 assert.ok(listCalls(h).length<=4);const before=h.calls.length;
 await h.activity();assert.equal(h.calls.length,before+1);assert.equal(h.timers.size,1);
});

test('online background operator retains heartbeat and notifications within a bounded request budget',async()=>{
 const h=harness();await h.login();h.node('available').checked=true;await h.node('available').onchange();await h.hide(true);
 h.rows.push(row());await h.advance(30000);
 assert.equal(h.notifications.length,1);assert.equal(details(h).length,0);
 await h.advance(86400000-30000);
 const beats=h.calls.filter(c=>c.path==='/admin/presence'&&c.options.body.online);
 assert.equal(beats.length,2881);
 for(let i=1;i<beats.length;i++)assert.ok(beats[i].at-beats[i-1].at<75000);
 assert.ok(h.calls.length<=5762,'At most one list and heartbeat every 30 seconds');
 h.node('available').checked=false;await h.node('available').onchange();const before=h.calls.length;
 await h.advance(3600000);assert.equal(h.calls.length,before);
});

test('unchanged selected transcript is reused; new messages, replies and close remain visible',async()=>{
 const h=harness();h.rows.push(row());await h.login();await h.node('threads').children[0].onclick();
 assert.equal(details(h).length,1);await h.advance(30000);assert.equal(details(h).length,1);
 h.rows[0].updated++;await h.advance(10000);assert.equal(details(h).length,2);
 let sent;
 h.intercept((path,options)=>{
  if(path.endsWith('/reply')){sent=options.body;h.rows[0].updated++;return {...h.rows[0],messages:[{text:sent.text}]};}
  if(path.endsWith('/close')){h.rows[0].mode='closed';h.rows[0].updated++;return {...h.rows[0],messages:[]};}
 });
 h.node('text').value='Test reply';await h.node('reply').onsubmit({preventDefault(){}});
 assert.equal(sent.text,'Test reply');assert.ok(sent.messageId);assert.equal(h.node('text').value,'');
 assert.equal(h.node('messages').rendered[0].text,'Test reply');
 await h.node('close').onclick();await h.flush();assert.equal(h.node('claim').disabled,true);
 const before=details(h).length;await h.advance(30000);assert.equal(details(h).length,before);
});

test('rate limits honor retryAfter even after manual refresh and visibility changes',async()=>{
 const h=harness();await h.login();
 h.intercept(path=>{if(path==='/admin/conversations')throw Object.assign(Error('rate_limited'),{status:429,retryAfter:120});});
 await h.node('refresh').onclick();const before=h.calls.length;
 await h.node('refresh').onclick();await h.hide(true);await h.hide(false);
 await h.advance(119000);assert.equal(h.calls.length,before);
 await h.activity();await h.advance(1000);assert.equal(h.calls.length,before+1);
});

test('logout during a pending refresh ignores stale data and cannot restart timers',async()=>{
 const h=harness();await h.login();let release;
 h.intercept(path=>path==='/admin/conversations'?new Promise(resolve=>{release=resolve;}):undefined);
 const pending=h.node('refresh').onclick();await h.node('logout').onclick();
 release({operator:'Stale',conversations:[row()]});await pending;
 assert.equal(h.node('desk').hidden,true);assert.equal(h.node('threads').children.length,0);assert.equal(h.timers.size,0);
 const before=h.calls.length;await h.advance(3600000);assert.equal(h.calls.length,before);
});

test('network disconnect stops polling; reconnect resumes; invalid credentials end the session',async()=>{
 const h=harness();await h.login();await h.network(false);await h.advance(3600000);assert.equal(h.calls.length,1);
 await h.network(true);assert.equal(h.calls.length,2);
 h.intercept(()=>{throw Object.assign(Error('auth'),{status:401});});
 await h.node('refresh').onclick();assert.equal(h.node('desk').hidden,true);assert.equal(h.timers.size,0);
});
