const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {readFileSync} = require('node:fs');
const { chromium } = require('playwright');
(async()=>{
 const {fixture}=await import(pathToFileURL(path.resolve(__dirname,'../test/tenant-fixture.mjs')).href);
 let cleanup; const f=await fixture({after:fn=>cleanup=fn});
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.exposeFunction('serverCall',async(path,options={})=>{
  try{const response=await f.call(path.replace('/api/mrp/',''),{method:options.method||'GET',headers:f.a.headers,...(options.body?{body:JSON.parse(options.body)}:{})});return {data:await response.json()};}
  catch(e){return {error:e.message};}
 });
 const html=readFileSync(path.resolve(__dirname,'../../mrp/index.html'),'utf8');
 await page.setContent(html.slice(html.indexOf('<div id="companyManagement">'),html.indexOf('<label><span>Interface Language</span>')));
 await page.evaluate(()=>{window.HAMVARA_MRP_CLOUD={request:async(...args)=>{const r=await window.serverCall(...args);if(r.error)throw Error(r.error);return r.data;}}});
 await page.addScriptTag({path:path.resolve(__dirname,'../../mrp/workspace-management.js'),type:'module'});
 await page.getByText('Open company management',{exact:true}).click();
 for(const [name,value] of Object.entries({country:'TR',timezone:'Europe/Istanbul',currency:'TRY',contactEmail:'owner@example.test'}))await page.locator(`[name="${name}"]`).fill(value);
 await page.locator('[name="language"]').selectOption('tr');
 await page.getByText('Save company profile',{exact:true}).click();
 await page.getByText('Company profile saved.',{exact:true}).waitFor();
 await page.locator('[name="username"]').fill('shop-operator');
 await page.getByText('Create user',{exact:true}).click();
 await page.getByLabel('New user access key').waitFor();
 const key=await page.getByLabel('New user access key').inputValue();if(key.length!==32)throw Error('missing key');
 await page.getByText('I saved the key — hide',{exact:true}).click();
 await page.getByText('shop-operator · OPERATOR · Active',{exact:false}).waitFor();
 page.on('dialog',d=>d.accept());
 await page.getByText('Disable access',{exact:true}).click();
 await page.getByText('shop-operator · OPERATOR · Disabled',{exact:false}).waitFor();
 console.log('PASS: profile save, create user, one-time key display/hide, disable user through UI and real SQLite handler.');
 }finally{await browser.close();cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
