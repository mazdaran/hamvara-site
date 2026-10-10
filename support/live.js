import {request} from './common.js?v=events-1';

// No inbox/message polling. The only idle traffic is a runtime-handled ping.
// A finite retry budget also prevents a broken service from creating a loop.
export class LiveConnection {
 constructor({api,path,token,available=()=>false,onEvent=()=>{},onState=()=>{},onAuthError=()=>{}}){
  Object.assign(this,{api,path,token,available,onEvent,onState,onAuthError});
  this.enabled=false;this.destroyed=false;this.epoch=0;this.failures=0;this.retryAt=0;this.paused=false;
  this.onOffline=()=>{this.detach();this.state('offline');};
  this.onOnline=()=>{if(this.enabled)this.reconnect();};
  window.addEventListener('offline',this.onOffline);window.addEventListener('online',this.onOnline);
 }
 state(value){this.status=value;this.onState(value);}
 setActive(active){
  if(this.destroyed)return;
  this.enabled=active;
  if(!active){this.detach();this.state('stopped');}
  else this.connect();
 }
 detach(){
  this.epoch++;clearTimeout(this.retryTimer);clearTimeout(this.healthTimer);clearTimeout(this.deadline);
  this.retryTimer=this.healthTimer=this.deadline=null;this.connecting=false;
  const ws=this.ws;this.ws=null;if(ws){ws.onopen=ws.onmessage=ws.onclose=ws.onerror=null;try{ws.close(1000,'Page inactive');}catch{}}
 }
 close(){this.enabled=false;this.destroyed=true;this.detach();window.removeEventListener('offline',this.onOffline);window.removeEventListener('online',this.onOnline);}
 reconnect(){
  if(this.destroyed||!this.enabled)return;
  // Even the manual reconnect button must respect the server's Retry-After.
  this.detach();this.failures=0;this.paused=false;this.connect();
 }
 async connect(){
  if(this.destroyed||!this.enabled||this.ws||this.connecting||this.retryTimer||this.paused)return;
  if(navigator.onLine===false){this.state('offline');return;}
  if(this.retryAt>Date.now()){this.state('reconnecting');this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.connect();},this.retryAt-Date.now());return;}
  this.connecting=true;this.readyAt=0;const epoch=++this.epoch;this.state(this.failures?'reconnecting':'connecting');
  try{
   const data=await request(this.path,{api:this.api,token:this.token(),method:'POST',body:{online:this.available()}});
   if(epoch!==this.epoch)return;
   const url=new URL('/events',this.api);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('ticket',data.ticket);
   const ws=new WebSocket(url);this.ws=ws;this.readyAt=0;
   this.deadline=setTimeout(()=>this.failed(epoch),15000);
   ws.onmessage=e=>{
    if(epoch!==this.epoch)return;
    if(e.data==='pong'){clearTimeout(this.healthTimer);clearTimeout(this.deadline);this.lastPong=Date.now();this.healthTimer=setTimeout(()=>this.ping(epoch),45000);return;}
    let event;try{event=JSON.parse(e.data);}catch{return;}
    if(event.type==='ready'){
     if(this.readyAt)return;
     clearTimeout(this.deadline);this.connecting=false;this.readyAt=Date.now();this.lastPong=Date.now();this.retryAt=0;
     this.state('connected');this.healthTimer=setTimeout(()=>this.ping(epoch),45000);
    }
    this.onEvent(event);
   };
   ws.onclose=e=>{if(epoch!==this.epoch)return;if(e.code===4001){this.detach();this.paused=true;this.state('paused');this.onAuthError();}else this.failed(epoch);};
   ws.onerror=()=>this.failed(epoch);
  }catch(e){
   if(epoch!==this.epoch)return;
   if(e.status===401||e.status===404){this.detach();this.paused=true;this.state('paused');this.onAuthError();}
   else this.failed(epoch,e);
  }
 }
 ping(epoch=this.epoch){
  if(epoch!==this.epoch||!this.ws||this.ws.readyState!==1)return;
  clearTimeout(this.healthTimer);clearTimeout(this.deadline);
  try{this.ws.send('ping');this.deadline=setTimeout(()=>this.failed(epoch),20000);}catch{this.failed(epoch);}
 }
 wake(){
  if(!this.enabled||this.destroyed)return;
  if(this.status==='connected'&&Date.now()-this.lastPong>90000){this.failed(this.epoch);return;}
  if(this.status==='connected')this.ping();else this.connect();
 }
 setAvailable(online){
  if(this.status==='connected'&&this.ws?.readyState===1){try{this.ws.send(JSON.stringify({type:'availability',online}));}catch{this.failed(this.epoch);}}
 }
 failed(epoch,error){
  if(epoch!==this.epoch)return;
  const stable=this.readyAt&&Date.now()-this.readyAt>=60000;
  this.detach();if(stable)this.failures=0;this.failures++;
  this.retryAt=Math.max(this.retryAt,Date.now()+Math.max(0,Number(error?.retryAfter)||0)*1000);
  if(!this.enabled||this.destroyed)return;
  if(navigator.onLine===false){this.state('offline');return;}
  if(this.failures>=6){this.paused=true;this.state('paused');return;}
  const delay=Math.max(this.retryAt-Date.now(),Math.min(60000,2000*2**(this.failures-1))+Math.floor(Math.random()*1000));
  this.state('reconnecting');this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.connect();},delay);
 }
}
