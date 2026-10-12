// Read-only landing page. All operational permissions remain enforced by the API.
export async function showRoleDashboard({request, session, signOut}) {
  const root = document.createElement('div');
  root.id = 'roleDashboard';
  const style = document.createElement('style');
  style.textContent = '#roleDashboard{max-width:1200px;margin:auto;padding:24px}#roleDashboard header{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}#roleDashboard .dashboard-links{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}#roleDashboard a{color:#155e75;font-weight:600}#roleDashboard .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:20px 0}#roleDashboard .kpi{background:white;padding:20px;border:1px solid #cbd5e1;border-radius:8px}#roleDashboard table{width:100%}#roleDashboard .table-wrap{overflow:auto}#roleDashboard [role=status]{min-height:24px}';
  const node = (tag, text, parent=root) => { const el=document.createElement(tag); if(text!=null)el.textContent=text; parent.append(el); return el; };
  const header=node('header');
  const heading=node('div',null,header);
  node('h1','Operations Dashboard',heading);
  node('p',`${session.workspace.name} · ${session.workspace.slug} · ${session.user.username} · ${session.user.role}`,heading);
  const logout=node('button','Sign out',header); logout.onclick=signOut;
  node('p','View your permitted warehouse and receipt information. Changes and approvals are limited by your role.');
  const links=node('div'); links.className='dashboard-links';
  const dashboard=node('a','Dashboard',links);dashboard.href='./';dashboard.setAttribute('aria-current','page');
  const canReceive=['OPERATOR','PRODUCTION_MANAGER','FACTORY_MANAGER','CEO'].includes(session.user.role);
  if(canReceive) {
    for(const [mode,label] of [['computer','Receive goods on this computer'],['mobile','Receive with mobile'],['usb','Receive with USB scanner']]) {
      const link=node('a',label,links);link.href=`mobile-receipts.html#${mode}`;
    }
  }
  const rights={OPERATOR:'You can submit receipts. Another authorized user must review and approve them.',PRODUCTION_MANAGER:'You can submit receipts and review receiving and quality for receipts submitted by others.',FACTORY_MANAGER:'You can review and approve receipts submitted by others. Only the CEO can post stock.',ACCOUNTING:'This dashboard is read-only. Receipt changes and stock posting are unavailable.'};
  node('p',rights[session.user.role]||'Actions are checked against your assigned role and warehouse access.');
  const refresh=node('button','Refresh dashboard');refresh.type='button';
  const message=node('p','');message.setAttribute('role','status');
  const content=node('div');
  document.body.replaceChildren(style,root);
  async function update() {
    refresh.disabled=true;content.replaceChildren();message.textContent='Loading dashboard…';
    try {
      const bootstrap=await request('/api/mrp/receipt-console/bootstrap');
      const inbox=await request('/api/mrp/receipt-console/receipts');
      const rows=inbox.receipts||[], warehouses=bootstrap.warehouses||[];
      const kpis=node('div',null,content);kpis.className='kpis';
      for(const [label,value] of [['Accessible warehouses',warehouses.length],['Receipts shown',rows.length],['Awaiting completion',rows.filter(r=>!['POSTED','REJECTED'].includes(r.status)).length],['Posted receipts shown',rows.filter(r=>r.status==='POSTED').length]]) {
        const card=node('div',null,kpis);card.className='kpi';node('span',label,card);node('b',String(value),card);
      }
      node('h2','Your warehouses',content);
      node('p',warehouses.map(w=>`${w.code} · ${w.name}`).join(' | ')||'No warehouses assigned.',content);
      node('h2',session.user.role==='OPERATOR'?'Your recent receipts':'Recent receipts',content);
      node('p','Summary of the receipts returned by your permitted inbox (up to the latest 100 company receipts). These counts are not total inventory.',content);
      const wrap=node('div',null,content);wrap.className='table-wrap';const table=node('table',null,wrap),head=node('tr',null,node('thead',null,table));
      for(const label of ['Document','SKU','Quantity','Warehouse','Status'])node('th',label,head);
      const body=node('tbody',null,table);
      for(const r of rows){const row=node('tr',null,body);for(const value of [r.payload.reference,r.payload.sku,`${r.payload.quantity} ${r.payload.unit}`,r.payload.destinationWarehouse,r.status])node('td',value,row);}
      if(!rows.length)node('p','No receipts visible for your account.',content);
      message.textContent='Dashboard updated at '+new Date().toLocaleTimeString();
    } catch(error) {
      message.textContent=error.status===401?'Your session has expired. Sign out and sign in again.':'Dashboard could not be loaded. Use Refresh dashboard to try again.';
    } finally {refresh.disabled=false;}
  }
  refresh.onclick=update;
  await update();
}
