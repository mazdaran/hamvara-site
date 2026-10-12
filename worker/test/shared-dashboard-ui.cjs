const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});const root=path.resolve(__dirname,'../..');
 try{for(const role of ['OPERATOR','PRODUCTION_MANAGER','FACTORY_MANAGER','CEO']){
  const page=await browser.newPage(),errors=[],writes=[];
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
   if(url.pathname.startsWith('/api/'))return respond({count:0});
   if(url.pathname==='/mrp/config.js')return route.fulfill({contentType:'text/javascript',body:'window.HAMVARA_MRP_CONFIG={apiBase:location.origin};'});
   let relative=url.pathname==='/mrp/'?'mrp/index.html':url.pathname.slice(1),file=path.join(root,relative);
   if(!fs.existsSync(file))return route.fulfill({status:404,body:'Not found'});
   return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/javascript',body:fs.readFileSync(file)});
  });
  await page.goto('https://shared.test/mrp/');
  await page.locator('#kpis').getByText('Accessible warehouses').waitFor({timeout:30000});
  assert.equal(await page.locator('#dashboard').evaluate(x=>x.classList.contains('active')),true);
  assert.equal(await page.locator('#nav [data-page]').count(),23);
  assert.equal(await page.locator('#nav [data-page="finance"]').isDisabled(),role!=='CEO');
  assert.equal(await page.locator('#nav [data-page="quality"]').isDisabled(),role==='OPERATOR');
  assert.equal(await page.locator('#nav [data-page="procurement"]').isDisabled(),role==='OPERATOR');
  assert.equal(await page.locator('#nav [data-page="settings"]').isDisabled(),role!=='CEO');
  await page.locator('#nav [data-page="stock"]').click();
  assert.equal(await page.locator('#stock').evaluate(x=>x.classList.contains('active')),true);
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
  await page.close();console.log('PASS shared dashboard '+role);
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
