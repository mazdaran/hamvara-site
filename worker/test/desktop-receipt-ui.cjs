const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch();
 try{
 const page=await browser.newPage();
 await page.addInitScript(()=>sessionStorage.setItem('hamvara.mrp.cloud.session.v1',JSON.stringify({workspace:'test',username:'operator',accessKey:'test'})));let attempts=[],pairings=0,failFirst=true;
 await page.addInitScript(()=>{if(location.search==='?nohid'){Object.defineProperty(navigator,'hid',{value:undefined,configurable:true});return;}const hid=new EventTarget();const device={productName:'Test USB scanner',opened:false,open:async function(){this.opened=true;},close:async function(){this.opened=false;}};hid.requestDevice=async()=>[device];Object.defineProperty(navigator,'hid',{value:hid,configurable:true});window.testHidDevice=device;});
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
  return route.fulfill({body:fs.readFileSync(file),contentType:/\.m?js$/.test(file)?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('https://desktop.test/mrp/mobile-receipts.html');
 await page.locator('#workspace').waitFor({state:'visible'});
 assert.equal(await page.locator('#desktopEntry').isVisible(),true);assert.equal(await page.locator('#mobileEntry').isVisible(),false);
 await page.locator('.receipt-modes a[href="#mobile"]').click();
 assert.equal(await page.locator('#desktopEntry').isVisible(),false);assert.equal(await page.locator('#mobileEntry').isVisible(),true);
 await page.locator('.receipt-modes a[href="#usb"]').click();
 assert.equal(await page.locator('#usbPanel').isVisible(),true);
 await page.locator('#connectUsb').click();
 await page.waitForFunction(()=>document.querySelector('#usbConnection').textContent.includes('Connected HID scanner'));
 await page.evaluate(()=>{const e=new Event('disconnect');Object.defineProperty(e,'device',{value:window.testHidDevice});navigator.hid.dispatchEvent(e);});
 assert.equal(await page.locator('#usbConnection').textContent(),'USB scanner disconnected.');
 await page.locator('#desktopCode').fill('123');await page.locator('#desktopCode').press('Enter');
 await page.waitForFunction(()=>!document.querySelector('#desktopFields').disabled);
 assert.match(await page.locator('#usbInputStatus').textContent(),/Barcode input received/);
 assert.equal(await page.locator('#usbConnection').textContent(),'USB scanner disconnected.');
 for(const [name,value] of Object.entries({quantity:'۱۲٫۵',reference:'DESKTOP-1',supplier:'Supplier'}))await page.locator(`#desktopReceipt [name=${name}]`).fill(value);
 await page.locator('#submitDesktop').click();
 await page.waitForFunction(()=>document.querySelector('#submitDesktop').textContent==='Retry same receipt');
 assert.equal(await page.locator('#desktopCode').isDisabled(),true);
 assert.equal(await page.locator('#desktopFields [name=quantity]').isDisabled(),true);
 await page.locator('#submitDesktop').click();await page.waitForFunction(()=>document.querySelector('#desktopStatus').textContent.includes('Saved on the server'));
 assert.equal(attempts[0].quantity,12.5);assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);assert.equal(pairings,0);
 assert.equal(attempts[0].destinationWarehouse,'WH-FG');assert.equal(attempts[0].unit,'pcs');
 assert.equal(await page.locator('#submitDesktop').isDisabled(),true);assert.equal(await page.locator('#desktopCode').inputValue(),'');
 await page.goto('https://desktop.test/mrp/mobile-receipts.html?nohid#usb');
 assert.match(await page.locator('#usbConnection').textContent(),/Connection detection unavailable/);
 console.log('PASS separate entry modes, HID connect/disconnect, honest keyboard fallback, immutable retry');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
