const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch();
 try {
  for(const role of ['OPERATOR','PRODUCTION_MANAGER','FACTORY_MANAGER','ACCOUNTING','CEO']) {
   const page=await browser.newPage();let stateReads=0,writes=0;
   await page.route('https://dashboard.test/**',async route=>{
    const req=route.request(),url=new URL(req.url());if(req.method()!=='GET')writes++;
    const actor={workspace:{id:'w1',slug:'pilot-tr',name:'Test Company'},user:{id:'u1',username:'user',role}};
    if(url.pathname==='/mrp/config.js')return route.fulfill({contentType:'application/javascript',body:'window.HAMVARA_MRP_CONFIG={apiBase:location.origin}'});
    if(url.pathname==='/api/mrp/session')return route.fulfill({json:{...actor,trial:{canWrite:true},capabilities:{serverReceipts:true}}});
    if(url.pathname==='/api/mrp/state'){stateReads++;return route.fulfill({json:{...actor,state:{settings:{}},revision:1}});}
    if(url.pathname==='/api/mrp/receipt-console/bootstrap')return route.fulfill({json:{actor,warehouses:[{code:'WH-FG',name:'Product'}]}});
    if(url.pathname==='/api/mrp/receipt-console/receipts')return route.fulfill({json:{receipts:[{id:'r1',status:'SUBMITTED',payload:{reference:'<img src=x onerror=alert(1)>',sku:'SKU-1',quantity:2,unit:'pcs',destinationWarehouse:'WH-FG'}}]}});
    if(url.pathname==='/mrp/')return route.fulfill({contentType:'text/html',body:'<body><div class="top-actions"></div><script>window.HAMVARA_MRP_CONFIG={apiBase:location.origin}</script><script src="cloud.js"></script><script>window.HAMVARA_MRP_CLOUD.load().then(()=>{document.body.dataset.loaded="true"})</script></body>'});
    const file=path.join(process.cwd(),url.pathname);return route.fulfill({body:fs.readFileSync(file),contentType:/\.m?js$/.test(file)?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
   });
   await page.goto('https://dashboard.test/mrp/');
   await page.locator('[name=workspace]').fill('pilot-tr');await page.locator('[name=username]').fill('user');await page.locator('[name=accessKey]').fill('test-key');await page.locator('#cloudLogin button').click();
   if(role==='CEO'){await page.waitForFunction(()=>document.body.dataset.loaded==='true');assert.equal(stateReads,1);}
   else {
    await page.waitForFunction(()=>document.querySelector('#roleDashboard [role=status]')?.textContent.startsWith('Dashboard updated'));
    assert.equal(stateReads,0);assert.match(await page.locator('#roleDashboard').textContent(),/Operations Dashboard/);
    assert.equal(await page.locator('#roleDashboard img').count(),0);
    assert.equal(await page.locator('#roleDashboard a[href*="mobile-receipts"]').count(),role==='ACCOUNTING'?0:3);
    assert.equal(await page.locator('#roleDashboard input').count(),0);
    if(role==='OPERATOR'){
     await page.getByRole('link',{name:'Receive goods on this computer',exact:true}).click();
     await page.locator('#workspace').waitFor({state:'visible'});
     assert.match(await page.locator('#actor').textContent(),/OPERATOR/);
     await page.getByRole('link',{name:'← Dashboard',exact:true}).click();
     await page.locator('#roleDashboard').waitFor();
    }
    await page.getByRole('button',{name:'Sign out',exact:true}).click();
    await page.locator('#cloudLogin').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('hamvara.mrp.cloud.session.v1')),null);
   }
   assert.equal(writes,0);await page.close();
  }
  const page=await browser.newPage();
  await page.route('https://dashboard.test/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/mrp/')return route.fulfill({contentType:'text/html',body:'<h1>Dashboard sign in</h1>'});
   if(url.pathname==='/mrp/config.js')return route.fulfill({contentType:'application/javascript',body:'window.HAMVARA_MRP_CONFIG={apiBase:location.origin}'});
   return route.fulfill({body:fs.readFileSync(path.join(process.cwd(),url.pathname)),contentType:/\.m?js$/.test(url.pathname)?'application/javascript':url.pathname.endsWith('.css')?'text/css':'text/html'});
  });
  await page.goto('https://dashboard.test/mrp/mobile-receipts.html');
  await page.waitForURL('https://dashboard.test/mrp/');
  console.log('PASS dashboard-first login, restricted read-only roles, CEO state access, receipt session reuse, logout, direct-link login');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
