import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function harness(client='admin'){
 let now=1000000,seq=0,intercept=null;
 const timers=new Map(),nodes=new Map(),events={document:new Map(),window:new Map()},calls=[],sockets=[],notifications=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,checked:false,dataset:{},children:[],attributes:{},replaceChildren(){this.children=[];},append(n){this.children.push(n);},setAttribute(k,v){this.attributes[k]=v;}});return nodes.get(id);};
 const listener=map=>({addEventListener(event,fn){if(!map.has(event))map.set(event,new Set());map.get(event).add(fn);},removeEventListener(event,fn){map.get(event)?.delete(fn);}});
 const doc={...listener(events.document),hidden:false,documentElement:{},getElementById:node,querySelectorAll:()=>[],createElement:()=>node('button-'+(++seq)),body:{classList:{add(){}}}};
 const navigator={onLine:true};
 const window={...listener(events.window),HAMVARA_SUPPORT_CONFIG:{apiBase:'https://api.test'},HAMVARA_SUPPORT_COPY:{en:{empty:'Empty',error:'Error',failure:'Failed',authError:'Auth',newReply:'New reply'},fa:{}}};
 class Notification {static permission='granted';constructor(...args){notifications.push(args);}}window.Notification=Notification;
 const rows=[],messages=[];
 const request=async(path,options)=>{
  calls.push({path,options:structuredClone(options),at:now});
  if(intercept){const r=intercept(path,options);if(r!==undefined)return await r;}
  if(path.endsWith('/events-ticket'))return {ticket:'temporary-single-use-ticket'};
  if(path==='/admin/conversations')return structuredClone({operator:'Test',conversations:rows});
  if(path==='/sessions/session-1')return {id:'session-1',mode:'queued',online:false,messages:structuredClone(messages)};
  const row=rows.find(r=>path==='/admin/conversations/'+r.id);if(row)return {...structuredClone(row),messages:structuredClone(messages)};
  throw Error('Unexpected request '+path);
 };
 class WebSocket {
  constructor(url){this.url=String(url);this.readyState=0;this.sent=[];sockets.push(this);}
  ready(){this.readyState=1;this.receive({type:'ready'});}
  receive(data){this.onmessage?.({data:typeof data==='string'?data:JSON.stringify(data)});}
  send(data){this.sent.push(data);if(data==='ping'&&!this.noPong)queueMicrotask(()=>this.receive('pong'));}
  close(){this.readyState=3;}
  disconnect(code=1006){this.readyState=3;this.onclose?.({code});}
 }
 class Verification {paint(){}mount(){}stop(){}reset(){}}
 const context=vm.createContext({window,document:doc,navigator,Notification,request,WebSocket,URL,URLSearchParams,location:{search:''},
  sessionStorage:{getItem:()=>client==='chat'?JSON.stringify({id:'session-1',token:'visitor-key',lang:'en'}):null,setItem(){},removeItem(){}},
  Verification,confirm:()=>true,startError:()=>'',startingText:()=>'',queueMicrotask,
  renderMessages:(el,m)=>{el.rendered=m;},crypto,Date:class extends Date {static now(){return now;}},Math:{...Math,random:()=>0,min:Math.min,max:Math.max,floor:Math.floor},
  setTimeout(fn,ms){const id=++seq;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(readFileSync(new URL('../../support/live.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export class','class'),context);
 vm.runInContext(readFileSync(new URL('../../support/'+client+'.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),context);
 const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
 async function advance(ms){const end=now+ms;for(let n=0;n<10000;n++){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end){now=end;return;}now=next[1].at;timers.delete(next[0]);await next[1].fn();await flush();}throw Error('Timer runaway');}
 const fire=async(surface,event)=>{for(const fn of [...(events[surface].get(event)||[])])await fn();await flush();};
 return{node,doc,navigator,rows,messages,calls,sockets,timers,notifications,advance,flush,fire,intercept:fn=>{intercept=fn;},
  login:async()=>{node('key').value='operator-long-lived-key';await node('login').onsubmit({preventDefault(){}});await flush();sockets.at(-1).ready();await flush();},
  hide:async hidden=>{doc.hidden=hidden;await fire('document','visibilitychange');},
  network:async online=>{navigator.onLine=online;await fire('window',online?'online':'offline');},
  event:async value=>{sockets.at(-1).receive(value);await flush();}
 };
}
const list=h=>h.calls.filter(c=>c.path==='/admin/conversations');
const details=h=>h.calls.filter(c=>c.path==='/admin/conversations/thread-1');
const row=()=>({id:'thread-1',lang:'en',mode:'human',owner:'operator',updated:1000000});

test('online operator: 24 idle hours produce no list, transcript or HTTP presence polls; event wakes inbox',async()=>{
 const h=harness();await h.login();assert.equal(list(h).length,1);
 assert.ok(!h.sockets[0].url.includes('operator-long-lived-key'));
 h.node('available').checked=true;h.node('available').onchange();await h.hide(true);const before=h.calls.length;
 await h.advance(86400000);assert.equal(h.calls.length,before);assert.equal(h.sockets.length,1);
 assert.ok(h.sockets[0].sent.includes('ping'));assert.ok(!h.calls.some(c=>c.path==='/admin/presence'));
 h.rows.push(row());await h.event({type:'changed',id:'thread-1'});assert.equal(list(h).length,2);assert.equal(h.notifications.length,1);
});
test('offline operator background disconnects; return subscribes and syncs once',async()=>{
 const h=harness();await h.login();await h.hide(true);const before=h.calls.length;await h.advance(86400000);assert.equal(h.calls.length,before);assert.equal(h.timers.size,0);
 await h.hide(false);h.sockets.at(-1).ready();await h.flush();assert.equal(h.sockets.length,2);assert.equal(list(h).length,2);
});
test('selected transcript refreshes only after events and mutations, with no idle HTTP loop',async()=>{
 const h=harness();h.rows.push(row());await h.login();await h.node('threads').children[0].onclick();assert.equal(details(h).length,1);
 await h.advance(600000);assert.equal(details(h).length,1);
 h.messages.push({seq:1,text:'Incoming'});await h.event({type:'changed',id:'thread-1'});assert.equal(details(h).length,2);assert.equal(h.node('messages').rendered[0].text,'Incoming');
 h.intercept((path,options)=>{if(path.endsWith('/reply'))return {...h.rows[0],messages:[{seq:2,text:options.body.text}]};if(path.endsWith('/close')){h.rows[0].mode='closed';return {...h.rows[0],messages:[]};}});
 h.node('text').value='Reply';await h.node('reply').onsubmit({preventDefault(){}});assert.equal(h.node('text').value,'');assert.equal(h.node('messages').rendered[0].text,'Reply');
 await h.node('close').onclick();await h.flush();assert.equal(h.node('claim').disabled,true);
});
test('events arriving during a snapshot are drained; logout discards in-flight data',async()=>{
 const h=harness();await h.login();let resolve;
 h.intercept(path=>path==='/admin/conversations'?new Promise(r=>{resolve=r;}):undefined);
 await h.event({type:'changed',id:'thread-1'});await h.event({type:'changed',id:'thread-1'});assert.equal(list(h).length,2);
 h.intercept(null);resolve({operator:'Test',conversations:[]});await h.flush();assert.equal(list(h).length,3);
 h.intercept(path=>path==='/admin/conversations'?new Promise(r=>{resolve=r;}):undefined);
 await h.event({type:'changed',id:'thread-1'});h.node('logout').onclick();resolve({operator:'Stale',conversations:[row()]});await h.flush();
 assert.equal(h.node('desk').hidden,true);assert.equal(h.node('threads').children.length,0);assert.equal(h.timers.size,0);
});
test('snapshot failures honor Retry-After without fallback polling',async()=>{
 const h=harness();await h.login();h.intercept(path=>{if(path==='/admin/conversations')throw Object.assign(Error('limited'),{status:429,retryAfter:120});});
 await h.node('refresh').onclick();const before=h.calls.length;await h.node('refresh').onclick();await h.event({type:'changed',id:'x'});await h.advance(120000);assert.equal(h.calls.length,before);
 h.intercept(null);await h.node('refresh').onclick();assert.equal(h.calls.length,before+1);
});
test('network return resubscribes; repeated handshake failures exhaust a finite retry budget',async()=>{
 const h=harness();await h.login();await h.network(false);const before=h.calls.length;await h.advance(3600000);assert.equal(h.calls.length,before);
 await h.network(true);h.sockets.at(-1).ready();await h.flush();assert.equal(list(h).length,2);
 h.intercept(path=>{if(path.endsWith('/events-ticket'))throw Error('Network failure');});h.sockets.at(-1).disconnect();await h.advance(3600000);
 const after=h.calls.length;await h.advance(86400000);assert.equal(h.calls.length,after);assert.ok(after-before<=7);assert.equal(h.node('reconnect').hidden,false);
});
test('missing health pong reconnects; repeated ready-and-close failures cannot reset the retry budget',async()=>{
 const h=harness();await h.login();h.sockets[0].noPong=true;await h.advance(67000);assert.equal(h.sockets.length,2);
 for(let i=0;i<6;i++){const ws=h.sockets.at(-1);ws.ready();await h.flush();ws.disconnect();await h.advance(65000);}
 const before=h.calls.length;await h.advance(3600000);assert.equal(h.calls.length,before);assert.equal(h.node('reconnect').hidden,false);
});
test('visitor: no repeated message GETs while waiting, then event delivery and reconnect resync',async()=>{
 const h=harness('chat');await h.flush();h.sockets[0].ready();await h.flush();const before=h.calls.length;
 await h.advance(86400000);assert.equal(h.calls.length,before);
 h.messages.push({seq:1,text:'Operator reply'});await h.event({type:'changed',id:'session-1'});assert.equal(h.node('messages').rendered[0].text,'Operator reply');
 await h.network(false);h.messages.push({seq:2,text:'While offline'});await h.network(true);h.sockets.at(-1).ready();await h.flush();assert.equal(h.node('messages').rendered.at(-1).text,'While offline');
 await h.fire('window','pagehide');const after=h.calls.length;await h.advance(3600000);assert.equal(h.calls.length,after);
});

test('operator availability toggled during handshake is applied after authentication',async()=>{
 const h=harness();h.node('key').value='operator-key';h.node('login').onsubmit({preventDefault(){}});await h.flush();
 h.node('available').checked=true;h.node('available').onchange();h.sockets.at(-1).readyState=1;await h.event({type:'ready',online:false});
 assert.ok(h.sockets.at(-1).sent.includes(JSON.stringify({type:'availability',online:true})));
});
test('ticket rate limits survive manual reconnect and invalid credentials terminate the session',async()=>{
 const h=harness();await h.login();h.intercept(path=>{if(path.endsWith('/events-ticket'))throw Object.assign(Error('limited'),{status:429,retryAfter:120});});
 h.sockets[0].disconnect();await h.advance(2000);const before=h.calls.length;
 h.node('reconnect').onclick();await h.flush();await h.advance(119000);assert.equal(h.calls.length,before);
 h.intercept(path=>{if(path.endsWith('/events-ticket'))throw Object.assign(Error('invalid'),{status:401});});await h.advance(1000);
 assert.equal(h.node('desk').hidden,true);assert.equal(h.timers.size,0);
});
test('visitor snapshot errors expose a recovery button instead of silently polling',async()=>{
 const h=harness('chat');await h.flush();h.sockets[0].ready();await h.flush();
 h.intercept(path=>{if(path==='/sessions/session-1')throw Error('Temporary failure');});await h.event({type:'changed',id:'session-1'});
 assert.equal(h.node('reconnect').hidden,false);const before=h.calls.length;await h.advance(60000);assert.equal(h.calls.length,before);
 h.intercept(null);h.node('reconnect').onclick();await h.flush();h.sockets.at(-1).ready();await h.flush();assert.equal(h.node('reconnect').hidden,true);
});
