const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const {fixture}=await import(pathToFileURL(path.resolve(__dirname,'../test/tenant-fixture.mjs')).href);
 let cleanup;const f=await fixture({after:fn=>cleanup=fn});
 const browser=await chromium.launch({headless:true});
 const DAY=86400000,start=Date.now()-31*DAY;
 f.db.prepare('INSERT INTO mrp_trials (workspace_id,starts_at,ends_at,read_until,activated_at) VALUES (?,?,?,?,?)').run(f.a.id,start,start+30*DAY,start+44*DAY,start);
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  let writes=0;
  await page.route('https://trial.example.test/**',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(!url.pathname.startsWith('/api/mrp/'))return route.fulfill({contentType:'text/html',body:'<html><body><div class="top-actions"></div></body></html>'});
   if(req.method()!=='GET')writes++;
   try{const response=await f.call(url.pathname.replace('/api/mrp/',''),{method:req.method(),headers:f.a.headers,...(req.postData()?{body:JSON.parse(req.postData())}:{})});await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}
   catch(e){await route.fulfill({status:e.status||500,contentType:'application/json',body:JSON.stringify({error:e.message})});}
  });
  await page.goto('https://trial.example.test/');
  async function setup(){
   await page.evaluate(headers=>{window.HAMVARA_MRP_CONFIG={apiBase:'https://trial.example.test'};sessionStorage.setItem('hamvara.mrp.cloud.session.v1',JSON.stringify({workspace:headers['X-Hamvara-Workspace'],username:headers['X-Hamvara-User'],accessKey:headers['X-Hamvara-Key']}));},f.a.headers);
   await page.addScriptTag({path:path.resolve(__dirname,'../../mrp/cloud.js')});
   await page.evaluate(()=>{window.HAMVARA_MRP_CLOUD.load();});
  }
  await setup();
  await page.getByText('Trial ended — view and export',{exact:true}).waitFor();
  await page.getByText('View saved data',{exact:true}).click();
  await page.locator('#trialAccessGate pre').filter({hasText:'istanbul-test'}).waitFor();
  const download=page.waitForEvent('download');await page.getByText('Download saved company data (JSON)',{exact:true}).click();await download;
  if(writes!==0)throw Error('Read-only startup attempted a write');
  await page.keyboard.press('Escape');if(!await page.locator('#trialAccessGate').isVisible())throw Error('Gate dismissed by Escape');
  const expired=Date.now()-45*DAY;
  f.db.prepare('UPDATE mrp_trials SET starts_at=?,ends_at=?,read_until=?,activated_at=? WHERE workspace_id=?').run(expired,expired+30*DAY,expired+44*DAY,expired,f.a.id);
  await page.getByText('View saved data',{exact:true}).click();
  await page.getByText('Trial access is not active.',{exact:false}).waitFor();
  await page.reload();await setup();
  await page.getByRole('heading',{name:'Company access'}).waitFor();
  if(await page.getByText('Download saved company data (JSON)',{exact:true}).count())throw Error('Expired account exposes export');
  if(await page.locator('#cloudLogin').count())throw Error('Expired account entered a login loop');
  console.log('PASS: grace viewer, authenticated download, no writes, expiry rejection, locked gate and no login loop.');
 }finally{await browser.close();cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
