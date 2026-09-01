(function(){
  'use strict';
  const $=(s)=>document.querySelector(s);
  const config=window.HAMVARA_GROWTH_CONFIG||{};
  const apiBase=String(config.apiBase||'').replace(/\/$/,'');
  const HISTORY_KEY='hamvara.growth.auditHistory.v1';
  let lastReport=null;
  const integrations=[
    {id:'google-search-console',name:'Google Search Console',description:'عبارت‌های جست‌وجو، کلیک، نمایش و جایگاه صفحات',provider:'google'},
    {id:'google-analytics',name:'Google Analytics 4',description:'کاربر، کانال ورودی، رویداد و تبدیل',provider:'google'},
    {id:'meta',name:'Instagram / Meta',description:'داده صفحه، پست‌ها، دسترسی و تعامل',provider:'meta'},
    {id:'linkedin',name:'LinkedIn',description:'هویت و داده صفحه شرکتی برای تحلیل B2B',provider:'linkedin'},
    {id:'wordpress',name:'WordPress',description:'دریافت و انتشار پیش‌نویس با تأیید انسانی',provider:'wordpress'}
  ];

  document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.view)));
  $('#auditForm').addEventListener('submit',runAudit);
  $('#exportReport').addEventListener('click',exportReport);
  $('#refreshConnections').addEventListener('click',loadIntegrations);
  $('#refreshGoogleData').addEventListener('click',loadGoogleOverview);
  $('#scSiteSelect').addEventListener('change',loadGoogleOverview);
  $('#gaPropertySelect').addEventListener('change',loadGoogleOverview);
  $('#clearHistory').addEventListener('click',()=>{localStorage.removeItem(HISTORY_KEY);renderHistory();});
  const connectedProvider=new URLSearchParams(location.search).get('connected');
  if(connectedProvider){showView('integrations');history.replaceState({},'',location.pathname+location.hash);}
  checkApi(); renderHistory(); loadIntegrations();

  function showView(id){
    document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===id));
    document.querySelectorAll('.nav-button').forEach(x=>x.classList.toggle('active',x.dataset.view===id));
    if(id==='history')renderHistory();
  }

  async function checkApi(){
    if(!apiBase){setApiState('warn','حالت مستقیم فعال است','تحلیل PageSpeed کار می‌کند؛ اتصال‌های OAuth پس از استقرار API فعال می‌شوند.');return;}
    try{const res=await fetch(apiBase+'/health',{headers:{Accept:'application/json'}});if(!res.ok)throw new Error();setApiState('good','سرویس تحلیل آنلاین است','API امن Hamvara Growth پاسخ می‌دهد.');}
    catch(e){setApiState('warn','سرویس تحلیل در دسترس نیست','تحلیل مستقیم PageSpeed به‌عنوان مسیر جایگزین استفاده می‌شود.');}
  }
  function setApiState(tone,label,detail){$('#apiDot').className='dot '+tone;$('#apiLabel').textContent=label;$('#apiDetail').textContent=detail;}

  async function runAudit(event){
    event.preventDefault(); hideError(); $('#results').hidden=true; $('#loading').hidden=false;
    const url=normalizeUrl($('#siteUrl').value); const strategy=$('#strategy').value;
    if(!url){showError('آدرس معتبر با http یا https وارد کنید.');$('#loading').hidden=true;return;}
    try{
      let report;
      if(apiBase){
        const res=await fetch(apiBase+'/api/audit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,strategy})});
        const body=await res.json(); if(!res.ok)throw new Error(body.error||'تحلیل انجام نشد.'); report=body;
      }else{report=await directPageSpeed(url,strategy);}
      lastReport=report; renderReport(report); saveHistory(report); renderHistory();
    }catch(error){showError(error.message||'سرویس تحلیل پاسخ نداد. چند دقیقه بعد دوباره امتحان کنید.');}
    finally{$('#loading').hidden=true;}
  }

  async function directPageSpeed(url,strategy){
    const endpoint=new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    endpoint.searchParams.set('url',url); endpoint.searchParams.set('strategy',strategy);
    ['performance','accessibility','best-practices','seo'].forEach(x=>endpoint.searchParams.append('category',x));
    const res=await fetch(endpoint); const raw=await res.json();
    if(!res.ok)throw new Error(raw.error?.message||'Google PageSpeed این آدرس را تحلیل نکرد.');
    return normalizePageSpeed(raw,url,strategy);
  }

  function normalizePageSpeed(raw,url,strategy){
    const lr=raw.lighthouseResult||{}; const cats=lr.categories||{}; const audits=lr.audits||{};
    const score=(id)=>Math.round((cats[id]?.score||0)*100);
    const metric=(id)=>({label:audits[id]?.title||id,value:audits[id]?.displayValue||'—',score:audits[id]?.score});
    const opportunities=Object.values(audits).filter(a=>a&&a.score!==null&&a.score<.9&&a.details?.type==='opportunity').sort((a,b)=>(b.details?.overallSavingsMs||0)-(a.details?.overallSavingsMs||0)).slice(0,6).map(a=>({id:a.id,title:a.title,description:stripLinks(a.description||''),score:a.score,savingsMs:Math.round(a.details?.overallSavingsMs||0)}));
    if(!opportunities.length)Object.values(audits).filter(a=>a&&a.score!==null&&a.score<.9&&a.title).slice(0,6).forEach(a=>opportunities.push({id:a.id,title:a.title,description:stripLinks(a.description||''),score:a.score,savingsMs:0}));
    return {source:'Google PageSpeed Insights / Lighthouse',url:lr.finalUrl||url,requestedUrl:url,strategy,fetchedAt:raw.analysisUTCTimestamp||new Date().toISOString(),scores:{performance:score('performance'),accessibility:score('accessibility'),'best-practices':score('best-practices'),seo:score('seo')},vitals:[metric('largest-contentful-paint'),metric('interaction-to-next-paint'),metric('cumulative-layout-shift'),metric('first-contentful-paint'),metric('speed-index'),metric('total-blocking-time')],findings:opportunities};
  }
  function stripLinks(text){return text.replace(/\[([^\]]+)\]\([^\)]+\)/g,'$1').replace(/\s+/g,' ').trim();}
  function normalizeUrl(value){try{const url=new URL(value.trim());return /^https?:$/.test(url.protocol)?url.href:null}catch(e){return null}}

  function renderReport(report){
    $('#results').hidden=false; $('#resultTitle').textContent=new URL(report.url).hostname; $('#resultMeta').textContent=`${report.strategy==='desktop'?'دسکتاپ':'موبایل'} · ${new Date(report.fetchedAt).toLocaleString('fa-IR')} · ${report.source}`;
    const labels={performance:'عملکرد',accessibility:'دسترس‌پذیری','best-practices':'استانداردها',seo:'سئو'};
    $('#scoreGrid').innerHTML=Object.entries(report.scores).map(([key,value])=>{const tone=value>=90?'#16784a':value>=50?'#a76500':'#b52f32';const text=value>=90?'خوب':value>=50?'نیازمند بهبود':'ضعیف';return `<article class="score" style="--tone:${tone}"><span>${labels[key]}</span><b>${value}</b><small>${text}</small></article>`}).join('');
    $('#vitals').innerHTML=report.vitals.map(x=>`<div class="vital"><span>${escapeHtml(x.label)}</span><b>${escapeHtml(x.value)}</b></div>`).join('');
    $('#findings').innerHTML=report.findings.length?report.findings.map((x,i)=>`<div class="finding"><span class="badge ${i>1?'medium':''}">${i<2?'HIGH':'MEDIUM'}</span><div><h4>${escapeHtml(x.title)}</h4><p>${escapeHtml(x.description||'این مورد در تحلیل Lighthouse نیازمند بهبود است.')}${x.savingsMs?` · صرفه‌جویی تقریبی ${x.savingsMs}ms`:''}</p></div></div>`).join(''):'<div class="empty">مورد مهمی در این اجرا پیدا نشد.</div>';
    $('#results').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function saveHistory(report){const items=readHistory();items.unshift({url:report.url,strategy:report.strategy,fetchedAt:report.fetchedAt,scores:report.scores});localStorage.setItem(HISTORY_KEY,JSON.stringify(items.slice(0,5)));}
  function readHistory(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch(e){return[]}}
  function renderHistory(){const items=readHistory();$('#historyList').innerHTML=items.length?items.map(x=>`<article class="history-item"><b>${escapeHtml(new URL(x.url).hostname)} <small>· ${x.strategy}</small></b><span>P ${x.scores.performance}</span><span>A ${x.scores.accessibility}</span><span>BP ${x.scores['best-practices']}</span><span>SEO ${x.scores.seo}</span></article>`).join(''):'<div class="empty">هنوز تحلیلی ثبت نشده است.</div>';}

  async function loadIntegrations(){
    let statuses={};
    if(apiBase){try{const res=await fetch(apiBase+'/api/integrations');if(res.ok)statuses=(await res.json()).integrations||{};}catch(e){}}
    $('#integrationList').innerHTML=integrations.map((x,i)=>{const connected=Boolean(statuses[x.id]?.connected);return `<article class="integration"><span class="order">0${i+1}</span><div><h3>${x.name}</h3><p>${x.description}</p></div><div><span class="status ${connected?'connected':''}">${connected?'CONNECTED':'NOT CONNECTED'}</span><button class="secondary" data-connect="${x.provider}" ${!apiBase?'disabled':''}>${connected?'اتصال مجدد':'اتصال'}</button></div></article>`}).join('');
    document.querySelectorAll('[data-connect]').forEach(btn=>btn.addEventListener('click',()=>{window.location.href=apiBase+'/api/oauth/'+btn.dataset.connect+'/start?return_to='+encodeURIComponent(location.href);}));
    const googleConnected=Boolean(statuses['google-search-console']?.connected||statuses['google-analytics']?.connected);
    $('#googleLive').hidden=!googleConnected;
    if(googleConnected)loadGoogleOverview();
  }

  async function loadGoogleOverview(){
    if(!apiBase||$('#googleLive').hidden)return;
    $('#googleDataStatus').textContent='در حال دریافت آمار ۲۸ روز اخیر از گوگل…';
    $('#refreshGoogleData').disabled=true;
    try{
      const endpoint=new URL(apiBase+'/api/google/overview');
      if($('#scSiteSelect').value)endpoint.searchParams.set('site',$('#scSiteSelect').value);
      if($('#gaPropertySelect').value)endpoint.searchParams.set('property',$('#gaPropertySelect').value);
      const res=await fetch(endpoint,{headers:{Accept:'application/json'}}),data=await res.json();
      if(!res.ok)throw new Error(data.error||'دریافت اطلاعات گوگل انجام نشد.');
      fillSelect($('#scSiteSelect'),data.searchConsole.sites,'siteUrl','siteUrl',data.searchConsole.selectedSite?.siteUrl,'سایتی در Search Console پیدا نشد');
      fillSelect($('#gaPropertySelect'),data.analytics.properties,'name','displayName',data.analytics.selectedProperty?.name,'ویژگی GA4 پیدا نشد');
      const sc=data.searchConsole.totals,ga=data.analytics.totals;
      const metrics=[
        ['کلیک جست‌وجوی گوگل',sc?.clicks,'Search Console'],['نمایش در نتایج',sc?.impressions,'Search Console'],['نرخ کلیک',sc?formatPercent(sc.ctr):'—','Search Console'],['میانگین جایگاه',sc?formatDecimal(sc.position):'—','Search Console'],
        ['کاربران فعال',ga?.activeUsers,'Google Analytics'],['کاربران جدید',ga?.newUsers,'Google Analytics'],['نشست‌ها',ga?.sessions,'Google Analytics'],['بازدید صفحات',ga?.pageViews,'Google Analytics'],['تعداد رویدادها',ga?.eventCount,'Google Analytics']
      ];
      $('#googleMetricGrid').innerHTML=metrics.map(([label,value,source])=>`<article class="live-metric"><small>${source}</small><b>${formatMetric(value)}</b><span>${label}</span></article>`).join('');
      const errors=[data.searchConsole.error&&`Search Console: ${data.searchConsole.error}`,data.analytics.error&&`Analytics: ${data.analytics.error}`].filter(Boolean);
      $('#googleDataStatus').textContent=errors.length?`اتصال برقرار است، اما ${errors.join(' | ')}`:`به‌روز شد: ${new Date(data.generatedAt).toLocaleString('fa-IR')} · بازه ۲۸ روز اخیر`;
    }catch(error){$('#googleDataStatus').textContent=error.message||'دریافت اطلاعات گوگل انجام نشد.';$('#googleMetricGrid').innerHTML='';}
    finally{$('#refreshGoogleData').disabled=false;}
  }

  function fillSelect(select,items,valueKey,labelKey,selected,emptyLabel){
    const previous=selected||select.value;
    select.innerHTML=items.length?items.map(item=>`<option value="${escapeHtml(item[valueKey])}" ${item[valueKey]===previous?'selected':''}>${escapeHtml(item[labelKey]||item[valueKey])}</option>`).join(''):`<option value="">${emptyLabel}</option>`;
    select.disabled=!items.length;
  }
  function formatMetric(value){return typeof value==='number'?value.toLocaleString('fa-IR'):value??'—';}
  function formatPercent(value){return `${(Number(value||0)*100).toLocaleString('fa-IR',{maximumFractionDigits:1})}٪`;}
  function formatDecimal(value){return Number(value||0).toLocaleString('fa-IR',{maximumFractionDigits:1});}

  function exportReport(){if(!lastReport)return;const blob=new Blob([JSON.stringify(lastReport,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hamvara-growth-audit-'+new URL(lastReport.url).hostname+'.json';a.click();URL.revokeObjectURL(a.href);}
  function showError(message){$('#errorBox').textContent=message;$('#errorBox').hidden=false;}
  function hideError(){$('#errorBox').hidden=true;}
  function escapeHtml(value){return String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
})();
