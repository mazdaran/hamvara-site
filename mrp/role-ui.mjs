import {installRolePresentation,syncRolePresentation,renderReceiptSummaryControls} from './role-presentation.mjs';
import {pageAccess,isManager,isWarehouseUser,roleLabel,privateMoneyField} from './access-policy.mjs';
const $=id=>document.getElementById(id);
const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(parent)parent.append(n);return n;};
export function renderAccessDashboard(state,role){
 const permitted=state.warehouses.filter(x=>x.code!=='WH-QA');
 const cards=[['Accessible warehouses',permitted.length],['Items & SKU',state.skus.length],['Pending receipts','Loading…'],['Open stock documents',(state.inventoryTransactions||[]).filter(x=>!['POSTED','REVERSED'].includes(x.status)).length],['Open counts',(state.cycleCounts||[]).filter(x=>x.status!=='APPROVED').length],['Quality pending',isManager(role)?(state.qualityInspections||[]).filter(x=>x.result==='PENDING').length:'Restricted']];
 for(const id of ['kpis','productionManagementKpis','productionManagementAlerts','alerts'])$(id)?.replaceChildren();
 for(const [label,value] of cards){const card=el('div',label,$('kpis'));card.className='kpi';const metric=el('b',String(value),card);if(label==='Pending receipts')metric.id='rolePendingReceiptCount';}
 const finance=el('div','Financial documents',$('productionManagementKpis'));finance.className='kpi';el('b',role==='CEO'?String((state.journalEntries||[]).length):'Restricted',finance);
 el('p',`${roleLabel(role)} · ${permitted.map(x=>x.name||x.code).join(' · ')}`,$('productionManagementAlerts'));
 el('p','Select a section from the left menu. Changes and approvals follow your assigned role.',$('alerts'));
 renderReceiptSummaryControls();
}
export function installRoleUI({role,user,getState,action}){
 const pages=pageAccess(role),manager=isManager(role),ceo=role==='CEO';
 const shippingLink=document.querySelector('#nav [data-page="shipping"]');shippingLink?.removeAttribute('data-i18n');if(shippingLink)shippingLink.textContent='Shipping & dispatch';
 const style=el('style',null,document.head);style.textContent='#nav button:disabled{opacity:.42;cursor:not-allowed}#nav{overflow-y:auto;padding-bottom:45vh}#nav button:disabled:hover{transform:none}.role-notice{padding:12px;border-left:4px solid #155e75;background:#eaf3f7}.role-form{display:flex;gap:12px;flex-wrap:wrap;padding:16px 0}.role-form label{display:flex;flex-direction:column;gap:5px}.role-form input,.role-form select{max-width:260px}.role-register{margin-top:20px;overflow:auto}.role-register table{width:100%}';
 function addPage(id,label){const b=el('button',label,$('nav'));b.dataset.page=id;const section=el('section',null,document.querySelector('main'));section.id=id;section.className='page';el('h2',label,section);return section;}
 const counts=addPage('counts','Cycle counting'),finance=addPage('finance','Accounting & financial reports');
 const note=el('p',`Signed in as ${user} · ${roleLabel(role)}.`,document.querySelector('.topbar'));note.className='role-notice';
 for(const id of ['receipts','quality']){const p=el('p',null,$(id));p.className='role-notice';el('span','Goods receipts and their quality decisions: ',p);for(const [hash,label] of [['computer','Receive on this computer'],['mobile','Receive with mobile'],['usb','USB scanner']]){const a=el('a',label,p);a.href=`mobile-receipts.html#${hash}`;a.style.marginInlineEnd='16px';}$(id).prepend(p);}
 function button(parent,label,fn){const b=el('button',label,parent);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){alert(e.message);}finally{b.disabled=false;}};return b;}
 function field(form,label,name,type='text',options){const l=el('label',label,form),n=el(options?'select':'input',null,l);n.name=name;if(options)for(const [value,title] of options){const o=el('option',title,n);o.value=value;}else n.type=type;return n;}
 function form(parent,fields,label,fn){const f=el('form',null,parent);f.className='role-form';for(const row of fields)field(f,...row);const b=el('button',label,f);b.type='submit';f.onsubmit=async e=>{e.preventDefault();b.disabled=true;try{await fn(Object.fromEntries(new FormData(f)));}catch(e){alert(e.message);}finally{b.disabled=false;}};return f;}
 function table(parent,headers,rows){const div=el('div',null,parent);div.className='role-register';const table=el('table',null,div),tr=el('tr',null,el('thead',null,table));headers.forEach(x=>el('th',x,tr));const body=el('tbody',null,table);for(const cells of rows){const row=el('tr',null,body);for(const value of cells){const cell=el('td',null,row);if(typeof value==='function')value(cell);else cell.textContent=String(value??'');}}return table;}
 function renderCounts(){
  counts.replaceChildren();el('h2','Cycle counting',counts);
  const state=getState(),warehouses=state.warehouses.filter(x=>x.code!=='WH-QA');
  form(counts,[['Warehouse','warehouse','text',warehouses.map(x=>[x.code,x.name||x.code])]],'Create count',data=>action('count.create',{...data,scope:'ALL'}));
  table(counts,['Count','Warehouse','Status','Action'],(state.cycleCounts||[]).map(c=>[c.countNo,c.warehouse,c.status,cell=>{
   if(c.status==='OPEN')button(cell,'Enter count',()=>{const values={};for(const line of c.lines){const v=prompt(`Counted quantity: ${line.sku}`);if(v===null)return;values[line.id]=v;}return action('count.submit',{id:c.id,counts:values});});
   if(manager&&['SUBMITTED','REVIEW_REQUIRED'].includes(c.status))button(cell,'Review count',()=>action('count.review',{id:c.id}));
   if(ceo&&c.status==='REVIEWED')button(cell,'Approve adjustment',()=>action('count.approve',{id:c.id}));
  }]));
 }
 function renderFinance(){
  finance.replaceChildren();el('h2','Accounting & financial reports',finance);if(!ceo){el('p','Restricted to CEO / Finance.',finance);return;}
  const state=getState(),accounts=state.chartOfAccounts||[];
  el('h3','Accounting periods',finance);
  form(finance,[['Code','code'],['Start','startDate','date'],['End','endDate','date']],'Create period',data=>action('finance.period-create',data));
  table(finance,['Period','Start','End','Status','Action'],(state.accountingPeriods||[]).map(p=>[p.code,p.startDate,p.endDate,p.status,cell=>{if(p.status==='OPEN')button(cell,'Close period',()=>action('finance.period-close',{id:p.id}));}]));
  el('h3','Manual journal',finance);
  form(finance,[['Date','date','date'],['Reference','reference'],['Description','description'],['Debit account','debitAccount','text',accounts.map(x=>[x.code,`${x.code} · ${x.name}`])],['Credit account','creditAccount','text',accounts.map(x=>[x.code,`${x.code} · ${x.name}`])],['Amount','amount','number']],'Post balanced journal',data=>action('finance.journal-post',{date:data.date,reference:data.reference,description:data.description,lines:[{accountCode:data.debitAccount,debit:data.amount},{accountCode:data.creditAccount,credit:data.amount}]}));
  table(finance,['Journal','Date','Description','Debit','Credit','Status','Action'],(state.journalEntries||[]).map(j=>[j.entryNo,j.date,j.description,j.totalDebit,j.totalCredit,j.status,cell=>{if(j.status==='DRAFT')button(cell,'Review & post',()=>action('finance.journal-post',{id:j.id}));if(j.status==='POSTED'&&!j.reversedBy)button(cell,'Reverse',()=>{const reason=prompt('Correction reason');if(reason)return action('finance.journal-reverse',{id:j.id,reason,date:new Date().toISOString().slice(0,10)});});}]));
  const balances=new Map(accounts.map(a=>[a.code,{...a,debit:0,credit:0}]));
  for(const j of state.journalEntries||[])if(j.status==='POSTED')for(const line of j.lines||[]){const row=balances.get(line.accountCode);if(row){row.debit+=Number(line.debit)||0;row.credit+=Number(line.credit)||0;}}
  const sum=(type,credit=false)=>[...balances.values()].filter(x=>x.type===type).reduce((n,x)=>n+(credit?x.credit-x.debit:x.debit-x.credit),0);
  const profit=sum('REVENUE',true)-sum('EXPENSE');
  el('h3','Financial position and profit / loss',finance);el('p','All posted journals to date · '+(state.accountingSettings?.baseCurrency||state.settings.currency),finance);
  table(finance,['Measure','Amount'],[['Assets (net)',sum('ASSET')+sum('CONTRA_ASSET')],['Liabilities',sum('LIABILITY',true)],['Equity before current profit',sum('EQUITY',true)],['Revenue',sum('REVENUE',true)],['Expenses',sum('EXPENSE')],['Current profit / loss',profit]]);
  table(finance,['Account','Name','Debit','Credit'],[...balances.values()].filter(x=>x.debit||x.credit).map(x=>[x.code,x.name,x.debit.toFixed(2),x.credit.toFixed(2)]));
 }
 const readControls='#productSearch,#productPrev,#productNext,#skuSearch,#skuPrev,#skuNext,#stockSearch,#stockPrev,#stockNext,#warehouseRoot,#warehouseBranches button,#warehousePills button,#reportType,#reportFrom,#reportTo,#reportWarehouse,#reportQuery,#refreshReport,#exportReport,#printReport';
 function locked(node){
  if(!node?.matches?.('button,input,select,textarea,a'))return false;
  if(node.closest('#nav'))return node.dataset.page&&!pages[node.dataset.page];
  if(node.closest('#counts,#finance,[data-role-controlled]'))return false;
  if(node.closest('.role-notice'))return false;
  if(node.closest('#cloudAccount'))return false;
  const page=node.closest('.page')?.id;if(page&&!pages[page])return true;
  if(node.closest('#receipts')&&!node.matches('a,[data-template]'))return true;
  if(node.closest('#stockTable')&&!node.matches('a'))return true;
  if(node.matches('[data-import="openingStock"],[data-import="receipts"],#importFile'))return true;
  if(node.matches('#inventoryTransactionRequester,#inventoryTransactionApprover,#inventoryTransactionPoster,#cycleCountRequester,#cycleCountCounter,#cycleCountApprover,#cycleCountThreshold,#createCycleCount,[data-count-action]'))return true;
  if(node.closest('#qualityTable'))return !manager||!node.matches('[data-field="result"],[data-field="notes"],[data-qc-action]');
  if(node.matches('[data-po-action]')&&node.textContent==='Receive to QA')return true;
  if(!ceo&&(node.matches('#backupBtn,#exportBtn,#addFinanceApproval,#addProjectFinance')||node.closest('#financeTable,#projectFinanceTable,#skuCostMethodTable')))return true;
  if(!ceo&&node.matches('[data-field],[data-project-field]')&&privateMoneyField(node.dataset.field||node.dataset.projectField))return true;
  if(!ceo&&node.matches('#createWhatIfSimulation,#createCashflowPlan,#projectBudget,#bomLaborCost,#bomOverheadCost,#bomOtherCost,[data-post-variance],[data-settle-wip],[data-reopen-wip]'))return true;
  if(!manager){
   if(node.matches(readControls))return false;
   if(node.closest('#stock')&&node.closest('article')?.querySelector('#inventoryTransactionType'))return node.matches('[data-inventory-action]')&&node.textContent!=='Submit';
   if(node.closest('#shipping')&&node.closest('#shipmentTable'))return !node.matches('[data-field="orderNo"],[data-field="pickQty"],[data-field="packingList"],[data-field="invoiceNo"],[data-field="podNo"]');
   if(node.matches('#addShipment'))return false;
   if(page&&page!=='dashboard')return true;
  }
  return false;
 }
 let queued=false;
 function apply(){
  queued=false;for(const b of document.querySelectorAll('#nav [data-page]'))if(!pages[b.dataset.page]){b.disabled=true;b.title='Not available for your role';b.setAttribute('aria-disabled','true');}
  for(const node of document.querySelectorAll('button,input,select,textarea'))if(locked(node)){if(!node.disabled)node.disabled=true;if(node.title!=='Not available for your role')node.title='Not available for your role';}
  for(const id of ['inventoryTransactionRequester','inventoryTransactionApprover','inventoryTransactionPoster'])if($(id))$(id).value=user;
  if(!ceo)for(const option of document.querySelectorAll('#reportType option'))if(/cost|financ|valuat|journal|profit|balance|cashflow|margin/i.test(option.value+' '+option.textContent))option.disabled=true;
  if(!ceo)for(const id of ['projectFinanceTable','productionVarianceTable','wipSettlementTable','financeTable','cashflowSource','whatIfName']){const article=$(id)?.closest('article');if(article&&!article.dataset.roleRestricted){article.dataset.roleRestricted='';article.style.display='none';}}
  syncRolePresentation(role);
 }
 const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(apply);}});observer.observe(document.querySelector('main'),{subtree:true,childList:true});
 for(const type of ['click','input','change','submit'])document.addEventListener(type,event=>{const n=event.target.closest?.('button,input,select,textarea,a');if(locked(n)){event.preventDefault();event.stopImmediatePropagation();}},true);
 document.addEventListener('click',event=>{const page=event.target.closest?.('#nav [data-page]')?.dataset.page;if(page==='counts')renderCounts();if(page==='finance')renderFinance();});
 installRolePresentation(role);
 apply();return {apply,refresh(){apply();renderCounts();renderFinance();}};
}
