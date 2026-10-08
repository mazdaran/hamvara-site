'use strict';
function initGrowth() {
 const COPY=__COPY__, POSTS=__POSTS__;
 const language=()=>COPY[document.documentElement.lang]?document.documentElement.lang:'en';
 const base=(kind='articles')=>'/'+kind+'/'+(language()==='en'?'':language()+'/');
 let selected='production';
 function selectNeed(){
  const d=COPY[language()], need=d.needs.find(n=>n[0]===selected);
  document.querySelectorAll('[data-need]').forEach(b=>{b.textContent=d.needs.find(n=>n[0]===b.dataset.need)[1];b.setAttribute('aria-pressed',String(b.dataset.need===selected));});
  const title=document.querySelector('[data-need-title]');if(!title)return;
  title.textContent=need[2];document.querySelector('[data-need-description]').textContent=need[3];document.querySelector('[data-need-open]').href=need[4];
  const g=document.querySelector('[data-need-guide]');g.hidden=!need[5];if(need[5])g.href=base('guides')+need[5]+'.html';
 }
 function translate(){
  const d=COPY[language()];document.querySelectorAll('[data-gx]').forEach(n=>{if(d[n.dataset.gx])n.textContent=d[n.dataset.gx];});
  document.querySelectorAll('[data-articles-link]').forEach(a=>a.href=base());
  document.querySelectorAll('[data-guides-link]').forEach(a=>a.href=base('guides'));
  document.querySelectorAll('[data-post-title]').forEach(n=>n.textContent=POSTS.find(p=>p.slug===n.dataset.postTitle).translations[language()].title);
  document.querySelectorAll('[data-post-summary]').forEach(n=>n.textContent=POSTS.find(p=>p.slug===n.dataset.postSummary).translations[language()].summary);
  document.querySelectorAll('[data-post-link]').forEach(a=>a.href=base()+a.dataset.postLink+'.html');
  const time=document.querySelector('#demo-time');if(time)time.placeholder=d.timeHint;
  selectNeed();const result=document.querySelector('[data-request-result]');if(result)result.hidden=true;
 }
 document.querySelectorAll('[data-need]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.need;selectNeed();}));
 const form=document.querySelector('[data-demo-form]');
 if(form){
  form.hidden=false;
  form.addEventListener('submit',e=>{e.preventDefault();const d=COPY[language()];const problem=form.elements.problem.value.trim(),time=form.elements.time.value.trim();if(!problem){form.elements.problem.setCustomValidity(d.required);form.elements.problem.reportValidity();return;}
   const message=d.mailSubject+'\n\n'+d.problem+': '+problem+(time?'\n'+d.time+': '+time:'');
   document.querySelector('[data-request-email]').href='mailto:info@hamvara.com?subject='+encodeURIComponent(d.mailSubject)+'&body='+encodeURIComponent(message);
   document.querySelector('[data-request-wa]').href='https://wa.me/905369247371?text='+encodeURIComponent(message);document.querySelector('[data-request-result]').hidden=false;
  });
  form.addEventListener('input',()=>{form.elements.problem.setCustomValidity('');document.querySelector('[data-request-result]').hidden=true;});
 }
 const search=document.querySelector('[data-article-search]'),category=document.querySelector('[data-article-category]');
 function filter(){const q=search.value.trim().toLocaleLowerCase(language());let n=0;document.querySelectorAll('[data-article]').forEach(card=>{card.hidden=!(category.value==='all'||card.dataset.category===category.value)||!card.textContent.toLocaleLowerCase(language()).includes(q);if(!card.hidden)n++;});document.querySelector('[data-article-empty]').hidden=n>0;}
 if(search){search.addEventListener('input',filter);category.addEventListener('change',filter);}
 document.querySelectorAll('[data-copy-link]').forEach(b=>b.addEventListener('click',async()=>{const d=COPY[language()],status=document.querySelector('[data-copy-status]');try{await navigator.clipboard.writeText(b.dataset.copyLink);status.textContent=d.copied;}catch{status.textContent=d.copyFallback+' '+b.dataset.copyLink;}}));
 new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});translate();
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",initGrowth,{once:true}); else initGrowth();
