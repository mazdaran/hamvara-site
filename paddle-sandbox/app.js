(async () => {
  'use strict';
  const $=id=>document.getElementById(id), cards=$('product-cards');
  let actor=null,csrf='',configured=false,ready=false,busy=false,generation=0,checkoutTimer;
  let catalog=[],previews=new Map();
  const requests=new Map(), buttons=new Map();
  const status=message=>{$('status').textContent=message;};
  async function api(path,body) {
    const response=await fetch('/api/sandbox/'+path,{credentials:'same-origin',...(body?{method:'POST',headers:{'Content-Type':'application/json','X-Sandbox-CSRF':csrf},body:JSON.stringify(body)}:{})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'sandbox_request_failed');return result;
  }
  function sync() {
    buttons.forEach((button,key)=>{const plan=catalog.find(p=>p.key===key);button.disabled=!actor||!configured||!ready||busy||!plan?.eligible||!previews.has(key);});
    $('logout').disabled=!actor||busy;$('check-access').disabled=!actor||busy;$('refresh').disabled=!ready||busy||!actor;
  }
  function node(tag,text,parent,className) {
    const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(className)item.className=className;parent.append(item);return item;
  }
  function render() {
    cards.replaceChildren();buttons.clear();
    for(const plan of catalog) {
      const card=node('article',undefined,cards,'card');node('h2',plan.name,card);node('p',plan.description,card);
      node('p',`USD ${(plan.amount/100).toFixed(2)} / ${plan.interval}, plus tax`,card,'price');
      node('p',`Access belongs to: ${plan.scope}. Limits: ${Object.entries(plan.limits).map(([k,v])=>`${k}: ${v}`).join(', ')}`,card);
      const preview=previews.get(plan.key);node('p',preview?`Base ${preview.subtotal} · Tax ${preview.tax} · Total ${preview.total}`:'Update the estimate before checkout.',card);
      if(!plan.eligible)node('p','Company plans require membership and assigned billing ownership of exactly one active company.',card);
      const button=node('button',`Test ${plan.interval==='year'?'annual':'monthly'} checkout`,card,'purchase');
      button.addEventListener('click',()=>checkout(plan.key));buttons.set(plan.key,button);
    }
    sync();
  }
  async function estimates() {
    if(!ready||busy||!actor)return;
    const country=$('country').value.trim().toUpperCase(),postal=$('postal').value.trim(),version=++generation;
    previews.clear();render();
    if((country&&!/^[A-Z]{2}$/.test(country))||(postal&&!country)){status('Enter a two-letter country code before a postal code.');return;}
    status('Loading Paddle sandbox tax estimates…');
    const plans=catalog.slice(), results=await Promise.allSettled(plans.map(async plan=>{
      let timer;
      try{
        const response=await Promise.race([window.Paddle.PricePreview({items:[{priceId:plan.priceId,quantity:1}],currencyCode:'USD',...(country?{address:{countryCode:country,...(postal?{postalCode:postal}:{})}}:{})}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('preview_timeout')),20000);})]);
        const data=response.data,item=data?.details?.lineItems?.find(i=>i.price?.id===plan.priceId);
        if(data?.currencyCode!=='USD'||!item||item.quantity!==1||Number(item.totals?.subtotal)!==plan.amount||Number(item.totals?.discount)!==0||!item.formattedTotals?.tax||!item.formattedTotals?.total)throw Error('price_mismatch');
        return [plan.key,item.formattedTotals];
      }finally{clearTimeout(timer);}
    }));
    if(version!==generation)return;
    results.forEach(r=>{if(r.status==='fulfilled')previews.set(...r.value);});render();
    status(results.every(r=>r.status==='fulfilled')?'Sandbox estimates ready. Checkout confirms the final total.':'Some estimates failed. Update the estimate to retry.');
  }
  async function refreshSession() {
    generation++;requests.clear();previews.clear();catalog=[];
    try{
      const result=await api('session');actor=result.user;csrf=result.csrf;configured=result.checkoutConfigured&&result.webhookConfigured;
      catalog=(await api('catalog')).plans;
      $('identity').textContent=`Signed in as ${actor.username}. ${configured?'Local fulfillment configured.':'Server payment configuration missing.'}`;
    }catch{actor=null;csrf='';configured=false;$('identity').textContent='Sign in with a pre-created local test account.';}
    render();await estimates();
  }
  async function checkout(key) {
    if(buttons.get(key)?.disabled)return;
    busy=true;sync();status('Preparing sandbox checkout…');
    try{
      const identity=actor.id+':'+key;if(!requests.has(identity))requests.set(identity,crypto.randomUUID());
      const result=await api('checkout',{plan:key,requestKey:requests.get(identity)});
      if(!/^txn_[a-z0-9]{26}$/.test(result.transactionId||''))throw Error('invalid_transaction');
      checkoutTimer=setTimeout(()=>{busy=false;sync();status('Checkout loading timed out. Close any open checkout before retrying.');},20000);
      window.Paddle.Checkout.open({transactionId:result.transactionId,settings:{displayMode:'overlay',theme:'light',locale:'en',showAddDiscounts:false}});
    }catch{clearTimeout(checkoutTimer);busy=false;sync();status('Checkout needs review. Check billing ownership and server configuration; uncertain transactions are never recreated automatically.');}
  }
  function eventCallback(event) {
    if(!event?.name)return;
    if(event.name==='checkout.loaded'){clearTimeout(checkoutTimer);status('Sandbox checkout is open.');}
    else if(event.name==='checkout.completed'){clearTimeout(checkoutTimer);status('Browser completion does not grant access. Check verified test access.');}
    else if(event.name==='checkout.closed'||event.name.includes('error')||event.name==='checkout.payment.failed'){clearTimeout(checkoutTimer);busy=false;sync();}
  }
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    try{await api('login',{username:$('test-username').value.trim(),password:$('test-password').value});await refreshSession();$('access-status').textContent='Check verified test access.';}catch{status('Sign-in failed. Check your local test credentials.');}finally{$('test-password').value='';}
  });
  $('logout').addEventListener('click',async()=>{if(busy)return;try{await api('logout',{});await refreshSession();$('access-status').textContent='Signed out.';}catch{status('Sign-out failed. Retry.');}});
  $('check-access').addEventListener('click',async()=>{try{const r=await api('entitlements');$('access-status').textContent=r.entitlements.length?r.entitlements.map(e=>`${e.product}: ${e.reason}${e.accessUntil?' — until '+e.accessUntil:''}`).join('\n')+'\nLocal test records only.': 'No verified, linked entitlement yet.';}catch{status('Sign in to check verified test access.');}});
  $('location-form').addEventListener('submit',event=>{event.preventDefault();estimates();});
  ['country','postal'].forEach(id=>$(id).addEventListener('input',()=>{generation++;previews.clear();render();status('Location changed. Update the estimate.');}));
  const token=window.HAMVARA_PADDLE_SANDBOX?.clientSideToken;
  if(/^test_[a-zA-Z0-9]{27}$/.test(token||'')&&window.Paddle){try{window.Paddle.Environment.set('sandbox');window.Paddle.Initialize({token,eventCallback});ready=true;}catch{status('Sandbox initialization failed.');}}
  else status('Sandbox token or Paddle.js missing. Checkout disabled.');
  await refreshSession();
})();
