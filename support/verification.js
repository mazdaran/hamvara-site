// Hamvara-authored integration with Cloudflare's hosted verification service.
const words={
 en:{wait:'Complete the security check to start a conversation.',ok:'Security check complete.',failed:'Security check could not finish. Retry, or contact us by email or WhatsApp.',retry:'Retry security check'},
 fa:{wait:'برای شروع گفتگو، بررسی امنیتی را تکمیل کنید.',ok:'بررسی امنیتی انجام شد.',failed:'بررسی امنیتی تکمیل نشد. دوباره تلاش کنید یا از ایمیل و واتس‌اپ استفاده کنید.',retry:'تلاش مجدد برای بررسی امنیتی'},
 tr:{wait:'Görüşmeyi başlatmak için güvenlik kontrolünü tamamlayın.',ok:'Güvenlik kontrolü tamamlandı.',failed:'Güvenlik kontrolü tamamlanamadı. Tekrar deneyin veya e-posta ya da WhatsApp kullanın.',retry:'Güvenlik kontrolünü tekrar dene'}
};
let loader;
function load(){
 if(window.turnstile)return Promise.resolve();
 if(loader)return loader;
 loader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');let timer;
  const failed=()=>{clearTimeout(timer);script.remove();loader=null;reject(Error('verification_load'));};
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  script.onload=()=>{clearTimeout(timer);if(window.turnstile)resolve();else failed();};script.onerror=failed;
  timer=setTimeout(failed,15000);document.head.append(script);
 });return loader;
}
export class Verification {
 constructor(sitekey,language,changed){this.sitekey=sitekey;this.language=language;this.changed=changed;this.token='';this.id=null;this.loading=false;this.state='wait';this.generation=0;document.getElementById('verify-retry').onclick=()=>this.reset();this.paint();}
 paint(){const w=words[this.language()]||words.en;document.getElementById('verification-note').textContent=w[this.state];const retry=document.getElementById('verify-retry');retry.textContent=w.retry;retry.hidden=this.state!=='failed';}
 update(state,token=''){this.state=state;this.token=token;this.paint();this.changed();}
 async mount(){
  this.paint();if(this.loading||this.id!==null)return;this.loading=true;const generation=this.generation;
  try{await load();if(generation!==this.generation)return;
   this.id=window.turnstile.render('#verification',{sitekey:this.sitekey,action:'support_start',theme:'light',size:'flexible',language:this.language()==='fa'?'auto':this.language(),
    callback:token=>this.update('ok',token),'expired-callback':()=>this.update('wait'),
    'error-callback':()=>{this.update('failed');return true;},'timeout-callback':()=>this.update('failed')});
  }catch{if(generation===this.generation)this.update('failed');}finally{this.loading=false;}
 }
 reset(){this.update('wait');if(this.id!==null&&window.turnstile)window.turnstile.reset(this.id);else this.mount();}
 stop(){this.generation++;if(this.id!==null&&window.turnstile)window.turnstile.remove(this.id);this.id=null;this.update('wait');}
}
