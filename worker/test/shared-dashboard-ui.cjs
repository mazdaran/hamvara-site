const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});const root=path.resolve(__dirname,'../..');
 try{for(const role of ['OPERATOR','PRODUCTION_MANAGER','FACTORY_MANAGER','CEO']){
  const page=await browser.newPage(),errors=[],writes=[];let summaryCalls=0,summaryFails=false,summaryCount=3;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>sessionStorage.setItem('hamvara.mrp.cloud.session.v1',JSON.stringify({workspace:'pilot-tr',username:'test',accessKey:'test'})));
  const state=JSON.parse(fs.readFileSync(path.join(root,'mrp/initial-data.json'),'utf8'));
  state.warehouses=[{code:'WH-RM',name:'Raw materials'},{code:'WH-PK',name:'Packaging'},{code:'WH-FG',name:'Product'},{code:'WH-SF',name:'Shop floor'}];
  state.skus=[{code:'ITEM-1',name:'Sample',unit:'pcs',warehouse:'WH-RM',min:2,active:true}];state.stock={'ITEM-1':{'WH-RM':5,'WH-PK':0,'WH-FG':0,'WH-SF':0}};
  const actor={workspace:{id:'w1',slug:'pilot-tr',name:'Internal test'},user:{id:'u1',username:'test',role}};
  await page.route('https://shared.test/**',async route=>{
   const url=new URL(route.request().url()),respond=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   if(url.pathname==='/api/mrp/session')return respond({...actor,trial:{status:'ACTIVE',canWrite:true},capabilities:{serverReceipts:true,rolePolicy:true}});
   if(url.pathname==='/api/mrp/state')return respond({...actor,state,revision:0});
   if(url.pathname==='/api/mrp/operations'){writes.push(route.request().postDataJSON());return respond({ok:true,state,revision:1});}
   if(url.pathname==='/api/mrp/receipt-console/summary'){summaryCalls++;return summaryFails?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Unavailable'})}):respond({pendingCount:summaryCount,byStatus:{SUBMITTED:summaryCount}});}
   if(url.pathname.startsWith('/api/'))return respond({count:0});
   if(url.pathname==='/mrp/config.js')return route.fulfill({contentType:'text/javascript',body:'window.HAMVARA_MRP_CONFIG={apiBase:location.origin};'});
   let relative=url.pathname==='/mrp/'?'mrp/index.html':url.pathname.slice(1),file=path.join(root,relative);
   if(!fs.existsSync(file))return route.fulfill({status:404,body:'Not found'});
   return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/javascript',body:fs.readFileSync(file)});
  });
  await page.goto('https://shared.test/mrp/');
  await page.locator('#kpis').getByText('Accessible warehouses').waitFor({timeout:30000});
  await page.waitForFunction(()=>document.getElementById('rolePendingReceiptCount')?.textContent==='3');
  assert.equal(await page.locator('#dashboard').evaluate(x=>x.classList.contains('active')),true);
  assert.equal(await page.locator('#nav [data-page]').count(),23);
  assert.equal(await page.locator('#nav [data-page="finance"]').isDisabled(),role!=='CEO');
  assert.equal(await page.locator('#nav [data-page="quality"]').isDisabled(),role==='OPERATOR');
  assert.equal(await page.locator('#nav [data-page="procurement"]').isDisabled(),role==='OPERATOR');
  assert.equal(await page.locator('#nav [data-page="settings"]').isDisabled(),role!=='CEO');
  async function assertMetric(selector, denied, expected) {
   const card=page.locator(selector),metric=card.locator('b');
   assert.equal(await card.getAttribute('aria-disabled'),denied?'true':null,role+' metric access presentation');
   assert.equal(await card.evaluate(x=>x.classList.contains('role-kpi-disabled')),denied);
   assert.equal(await metric.evaluate(x=>x.hidden),denied);
   if(denied){
    assert.equal(await metric.textContent(),'','Denied card has no value, not even zero');
    assert.equal(await metric.isVisible(),false,'Denied value is hidden');
    assert.match(await card.getAttribute('aria-label'),/not available for this role/);
    assert(!/Restricted/i.test(await card.innerText()),'No visible restriction placeholder');
   }else{
    assert.equal(await metric.isVisible(),true);
    if(expected!==undefined)assert.equal(await metric.textContent(),expected);
   }
  }
  async function assertDashboardMetrics() {
   await assertMetric('#kpis .kpi:last-child',role==='OPERATOR','0');
   await assertMetric('#productionManagementKpis .kpi',role!=='CEO','0');
   assert.equal(await page.locator('#rolePendingReceiptCount').isVisible(),true);
   assert.equal(await page.locator('#rolePendingReceiptCount').evaluate(x=>x.closest('.kpi').hasAttribute('aria-disabled')),false);
  }
  // CSS viewports equivalent to 100%, 110%, 125% zoom on 1920px and 1366px desktops.
  for(const desktop of [1920,1366])for(const zoom of [1,1.1,1.25]){
   await page.setViewportSize({width:Math.round(desktop/zoom),height:Math.round(900/zoom)});
   await page.waitForTimeout(80);
   const layout=await page.evaluate(()=>{
    const header=document.querySelector('.topbar'),tools=document.querySelector('.role-header-tools'),h=header.getBoundingClientRect();
    const rects=[...tools.children].map(x=>x.getBoundingClientRect());
    const overlapping=rects.some((a,i)=>rects.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1));
    return {overflow:header.scrollWidth>header.clientWidth+1,overlapping,inside:rects.every(r=>r.left>=h.left&&r.right<=h.right+1&&r.bottom<=h.bottom+1),
     singleLine:[...tools.querySelectorAll('button,.button')].every(x=>getComputedStyle(x).whiteSpace==='nowrap'),
     offset:parseFloat(getComputedStyle(document.getElementById('nav')).top),height:h.height};
   });
   assert.equal(layout.overflow,false,role+' header overflow '+desktop+'/'+zoom);
   assert.equal(layout.overlapping,false,role+' header tools overlap');assert.equal(layout.inside,true);assert.equal(layout.singleLine,true);
   assert(Math.abs(layout.offset-layout.height)<=1,'sidebar offset follows header height');
   await assertDashboardMetrics();
  }
  await page.setViewportSize({width:1366,height:900});
  assert.equal(await page.locator('.topbar #cloudAccount').count(),1);
  assert.equal(await page.locator('.topbar label:has(#importFile)').getAttribute('aria-disabled'),'true');
  assert.equal(await page.locator('#receipts > p > a[href="mobile-receipts.html"]').count(),0);
  assert.equal(await page.locator('#receipts .role-notice a').count(),3);
  // No timer polling: idle does not send summary requests. Failure never displays a fabricated zero.
  await page.waitForTimeout(100);const callsBeforeIdle=summaryCalls;await page.waitForTimeout(1200);assert.equal(summaryCalls,callsBeforeIdle);
  summaryFails=true;await page.locator('#roleReceiptSummaryRefresh').click();
  await page.waitForFunction(()=>document.getElementById('rolePendingReceiptCount').textContent==='Unavailable');
  await assertDashboardMetrics();
  assert.match(await page.locator('#roleReceiptSummaryStatus').textContent(),/could not be refreshed/);
  for(const width of [1920,1745,1536,1366,1242,1093]){
   await page.setViewportSize({width,height:800});
   assert.equal(await page.locator('#rolePendingReceiptCount').evaluate(x=>x.scrollWidth<=x.clientWidth+1),true,'Failure message stays within card');
  }
  await page.setViewportSize({width:1366,height:900});
  summaryFails=false;summaryCount=0;await page.locator('#roleReceiptSummaryRefresh').click();
  await page.waitForFunction(()=>document.getElementById('rolePendingReceiptCount').textContent==='0');
  await page.locator('#nav [data-page="stock"]').click();
  assert.equal(await page.locator('#stock').evaluate(x=>x.classList.contains('active')),true);
  await assertMetric('#warehouseKpis .kpi:nth-child(4)',role!=='CEO');
  // A stock rerender must not restore the redacted-cost fallback or its placeholder.
  await page.locator('#warehouseBranches button').first().click();
  await assertMetric('#warehouseKpis .kpi:nth-child(4)',role!=='CEO');
  await page.locator('#nav [data-page="dashboard"]').click();
  await page.waitForFunction(()=>document.getElementById('rolePendingReceiptCount').textContent==='0');
  await assertDashboardMetrics();
  await page.locator('#nav [data-page="stock"]').click();
  assert.equal(await page.locator('#createInventoryTransaction').isDisabled(),false);
  assert.equal(await page.locator('#inventoryTransactionRequester').inputValue(),'test');
  assert.equal(await page.locator('#inventoryTransactionRequester').isDisabled(),true);
  assert.equal(await page.locator('#inventoryTransactionSource option').count(),4);
  assert.equal(await page.locator('#stockTable input').first().isDisabled(),true);
  await page.locator('#nav [data-page="skus"]').click();
  assert.equal(await page.locator('#addSku').isDisabled(),role==='OPERATOR');
  await page.locator('#nav [data-page="counts"]').click();
  await page.locator('#counts').getByRole('button',{name:'Create count',exact:true}).waitFor({state:'visible'});
  if(role==='CEO'){await page.locator('#nav [data-page="finance"]').click();await page.locator('#finance').getByRole('button',{name:'Create period',exact:true}).waitFor({state:'visible'});}
  assert.deepEqual(errors,[],role+' browser errors');assert.equal(writes.length,0,'Read-only navigation must not write company data');
  if(role==='OPERATOR'){
   await page.locator('#nav [data-page="stock"]').click();
   await page.locator('#inventoryTransactionSku').fill('ITEM-1');await page.locator('#inventoryTransactionQty').fill('۲');await page.locator('#inventoryTransactionReason').fill('Workshop issue');
   await page.locator('#createInventoryTransaction').click();await page.waitForFunction(()=>document.getElementById('toast').textContent==='Saved.');
   assert.equal(writes.at(-1).action,'inventory.create');assert.equal(writes.at(-1).input.quantity,2);assert(!('requestedBy' in writes.at(-1).input));
  }else if(role==='PRODUCTION_MANAGER'){
   await page.locator('#nav [data-page="skus"]').click();
   await page.locator('#skuTable [data-field="name"]').first().fill('Edited material');await page.locator('#skuTable [data-field="name"]').first().press('Tab');
   await page.waitForResponse(r=>r.url().endsWith('/api/mrp/operations'));
   assert.equal(writes.at(-1).action,'edit');assert.equal(writes.at(-1).input.changes.skus[0].name,'Edited material');assert(!('cost' in writes.at(-1).input.changes.skus[0]));
  }
  assert.deepEqual(errors,[],role+' mutation errors');
  await page.close();console.log('PASS shared dashboard '+role);
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
