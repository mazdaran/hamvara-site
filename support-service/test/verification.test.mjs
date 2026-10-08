import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('widget expiry, failure, retry and teardown remove permission to start',async()=>{
 const elements=new Map();let options,resets=0,removed=0,changes=0;
 const context=vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,{});return elements.get(id);}},window:{turnstile:{render(_selector,o){options=o;return 'widget-1';},reset(){resets++;},remove(){removed++;}}}});
 vm.runInContext(readFileSync(new URL('../../support/verification.js',import.meta.url),'utf8').replace('export class Verification','class Verification')+'\nglobalThis.Verification=Verification;',context);
 const widget=new context.Verification('public-key',()=> 'fa',()=>changes++);
 await widget.mount();assert.equal(options.action,'support_start');assert.equal(options.sitekey,'public-key');
 options.callback('signed-token');assert.equal(widget.token,'signed-token');
 options['expired-callback']();assert.equal(widget.token,'');
 options.callback('new-token');options['error-callback']();assert.equal(widget.token,'');assert.equal(elements.get('verify-retry').hidden,false);
 elements.get('verify-retry').onclick();assert.equal(resets,1);assert.equal(widget.token,'');
 options.callback('last-token');widget.stop();assert.equal(removed,1);assert.equal(widget.token,'');assert.ok(changes>=6);
});
test('chat startup waits for verification, sends token and resets after rejection',async()=>{
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},classList:{add(){}},checked:true,disabled:true});return nodes.get(id);};
 let verifier;const sent=[];
 class Verification {constructor(_key,_lang,changed){this.token='';this.changed=changed;verifier=this;}paint(){}mount(){}reset(){this.token='';this.changed();}stop(){this.reset();}}
 const context=vm.createContext({URLSearchParams,location:{search:'?lang=en'},sessionStorage:{getItem(){return null;}},window:{HAMVARA_SUPPORT_CONFIG:{apiBase:'https://api.test',turnstileSiteKey:'public'},HAMVARA_SUPPORT_COPY:{en:{}}},document:{getElementById:node,documentElement:{},querySelectorAll(){return [];},body:{classList:{add(){}}}},Verification,renderMessages(){},request:async(path,opts)=>{if(path==='/status')return {ready:true,verificationRequired:true,ai:true};sent.push(opts.body);throw Error('verification rejected');},setTimeout,clearTimeout,crypto});
 const source=readFileSync(new URL('../../support/chat.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');vm.runInContext(source,context);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(node('begin').disabled,true);
 await node('begin').onclick();assert.equal(sent.length,0);
 verifier.token='signed-token';verifier.changed();assert.equal(node('begin').disabled,false);
 await node('begin').onclick();assert.equal(sent[0].turnstileToken,'signed-token');assert.equal(node('begin').disabled,true);assert.equal(verifier.token,'');
});
