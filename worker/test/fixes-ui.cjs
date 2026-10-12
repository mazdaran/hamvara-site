const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
 for(const mode of ['paid','unpaid','trial']) {
  const page=await browser.newPage();let writes=0;
  await page.route('https://fix.test/**',async route=>{
   const url=new URL(route.request().url());
   if(route.request().method()!=='GET')writes++;
   if(url.pathname==='/api/mrp/session')return route.fulfill({json:{workspace:{name:'Test'},user:{username:'owner',role:'CEO'},capabilities:{serverReceipts:mode!=='trial'},trial:{source:mode==='trial'?'trial':'paddle_sandbox',status:mode==='unpaid'?'SUBSCRIPTION_REQUIRED':'ACTIVE',canWrite:mode!=='unpaid',canRead:mode!=='unpaid',endsAt:Date.now()+86400000}}});
   if(url.pathname==='/api/mrp/state')return route.fulfill({json:{state:{stock:{}},revision:1,workspace:{name:'Test'},user:{username:'owner',role:'CEO'}}});
   return route.fulfill({contentType:'text/html',body:'<div class="top-actions"></div><section id="receipts"><button id="postReceipt">Submit</button><input id="receiptQty"><table id="receiptTable"></table></section><section id="stock"><small data-i18n="stockEditHint">old</small><input id="stockSearch"><div id="warehouseBranches"><button>Product</button></div><table id="stockTable"><tr><td><input value="1"></td></tr></table><input data-import="openingStock" type="file"><article><select id="inventoryTransactionType"></select><button id="createInventoryTransaction">Draft</button></article></section>'});
  });
  await page.goto('https://fix.test/');
  await page.evaluate(()=>{window.HAMVARA_MRP_CONFIG={apiBase:location.origin};sessionStorage.setItem('hamvara.mrp.cloud.session.v1',JSON.stringify({workspace:'test',username:'owner',accessKey:'test'}));window.legacyMutations=0;document.querySelector('#postReceipt').onclick=()=>window.legacyMutations++;});
  await page.addScriptTag({path:path.resolve('mrp/cloud.js')});
  await page.evaluate(()=>{window.HAMVARA_MRP_CLOUD.load();});
  await page.waitForSelector('#trialStatus');
  const banner=await page.locator('#trialStatus').textContent();
  if(mode==='trial') {assert.match(banner,/Trial ends/);assert.equal(await page.locator('#postReceipt').isDisabled(),false);}
  else {
   assert.match(banner,/MRP subscription/);assert.doesNotMatch(banner,/Trial ends|No automatic charge/);
   assert.equal(await page.locator('#postReceipt').isDisabled(),true);
   assert.equal(await page.locator('#stockSearch').isDisabled(),false);
   assert.equal(await page.locator('#warehouseBranches button').isDisabled(),false);
   assert.equal(await page.locator('#stockTable input').isDisabled(),true);
   assert.equal(await page.locator('#createInventoryTransaction').isDisabled(),true);
   await page.evaluate(()=>{const b=document.querySelector('#postReceipt');b.disabled=false;b.click();document.querySelector('#stockTable').innerHTML='<tr><td><input value="2"></td></tr>';});
   assert.equal(await page.evaluate(()=>window.legacyMutations),0);
   await page.waitForFunction(()=>document.querySelector('#stockTable input').disabled);
   assert.equal(await page.locator('[data-server-receipt-notice] a').count(),2);
  }
  if(mode==='unpaid') {await page.waitForSelector('#trialAccessGate');assert.match(await page.locator('#trialAccessGate').textContent(),/active MRP sandbox subscription/);assert.doesNotMatch(await page.locator('#trialAccessGate').textContent(),/pilot has not started|Export deadline/);}
  assert.equal(writes,0);await page.close();console.log('PASS UI:',mode);
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
