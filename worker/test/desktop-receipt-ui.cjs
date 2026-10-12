const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch();
 try{
 const page=await browser.newPage();let attempts=[],pairings=0,failFirst=true;
 await page.route('https://desktop.test/**',async route=>{
  const req=route.request(),url=new URL(req.url()),endpoint=url.pathname.split('/receipt-console')[1];
  if(endpoint){
   if(endpoint==='/bootstrap')return route.fulfill({json:{actor:{workspace:{slug:'test'},user:{id:'u1',username:'operator',role:'OPERATOR'}},warehouses:[{code:'WH-FG',name:'Product'}]}});
   if(endpoint==='/lookup')return route.fulfill({json:{item:{sku:'SKU-1',name:'Test item',unit:'pcs'}}});
   if(endpoint==='/pairings')pairings++;
   if(endpoint==='/receipts'&&req.method()==='POST'){
    attempts.push(req.postDataJSON());
    if(failFirst){failFirst=false;return route.abort('failed');}
    return route.fulfill({json:{receipt:{id:'saved-receipt',status:'SUBMITTED'},duplicate:true}});
   }
   return route.fulfill({json:{receipts:[]}});
  }
  if(url.pathname==='/mrp/config.js')return route.fulfill({contentType:'application/javascript',body:'window.HAMVARA_MRP_CONFIG={apiBase:location.origin};'});
  const file=path.join(process.cwd(),url.pathname);
  return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('https://desktop.test/mrp/mobile-receipts.html');
 await page.locator('[name=workspace]').fill('test');await page.locator('[name=username]').fill('operator');await page.locator('[name=accessKey]').fill('test');await page.locator('#login button').click();
 await page.locator('#desktopCode').fill('123');await page.locator('#desktopCode').press('Enter');
 await page.waitForFunction(()=>!document.querySelector('#desktopFields').disabled);
 for(const [name,value] of Object.entries({quantity:'2',reference:'DESKTOP-1',supplier:'Supplier'}))await page.locator(`#desktopReceipt [name=${name}]`).fill(value);
 await page.locator('#submitDesktop').click();
 await page.waitForFunction(()=>document.querySelector('#submitDesktop').textContent==='Retry same receipt');
 assert.equal(await page.locator('#desktopCode').isDisabled(),true);
 assert.equal(await page.locator('#desktopFields').isDisabled(),true);
 await page.locator('#submitDesktop').click();await page.waitForFunction(()=>document.querySelector('#desktopStatus').textContent.includes('Saved on the server'));
 assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);assert.equal(pairings,0);
 assert.equal(attempts[0].destinationWarehouse,'WH-FG');assert.equal(attempts[0].unit,'pcs');
 assert.equal(await page.locator('#submitDesktop').isDisabled(),true);assert.equal(await page.locator('#desktopCode').inputValue(),'');
 console.log('PASS desktop form, scanner Enter, immutable retry, no pairing');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
