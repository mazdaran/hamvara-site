const $=s=>document.querySelector(s);
const norm=s=>s.toLowerCase().replace(/[‐‑–—]/g,'-');
const has=(t,re)=>re.test(t);
const item=(id,title,status,detail,fix)=>({id,title,status,detail,fix});
let labelImages=[];

function addImages(files){
  const valid=[...files].filter(f=>f.type.startsWith('image/'));
  labelImages.push(...valid.map(file=>({file,url:URL.createObjectURL(file)})));
  renderPreviews();
}
function renderPreviews(){
  const box=$('#previews');
  box.hidden=!labelImages.length;
  box.innerHTML=labelImages.map((x,i)=>`<div class="preview"><img src="${x.url}" alt="Label image ${i+1}"><button type="button" data-remove="${i}" aria-label="Remove image ${i+1}">×</button><span>Panel ${i+1}</span></div>`).join('');
  box.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.remove);URL.revokeObjectURL(labelImages[i].url);labelImages.splice(i,1);renderPreviews()});
  $('#readImages').disabled=!labelImages.length;
  $('#clearImages').disabled=!labelImages.length;
  $('#scanStatus').textContent=labelImages.length?`${labelImages.length} image${labelImages.length>1?'s':''} ready for OCR.`:'No images selected.';
}
async function scanBarcode(file){
  if(!('BarcodeDetector' in window))return null;
  try{
    const formats=await BarcodeDetector.getSupportedFormats();
    const selected=formats.filter(x=>['ean_13','ean_8','upc_a','upc_e','code_128','qr_code'].includes(x));
    if(!selected.length)return null;
    const detector=new BarcodeDetector({formats:selected});
    const bitmap=await createImageBitmap(file);
    const hits=await detector.detect(bitmap);bitmap.close();
    return hits[0]?.rawValue||null;
  }catch{return null}
}
function updateProgress(progress,message){$('#ocrBar').style.width=`${Math.round(progress*100)}%`;$('#ocrMessage').textContent=message}
async function readImages(){
  if(!labelImages.length)return;
  const button=$('#readImages');button.disabled=true;$('#ocrProgress').hidden=false;$('#barcodeResult').hidden=true;
  const text=[];let barcode=null;
  try{
    if(!window.Tesseract)throw new Error('OCR engine could not load. Check your internet connection and try again.');
    for(let i=0;i<labelImages.length;i++){
      updateProgress(i/labelImages.length,`Reading image ${i+1} of ${labelImages.length}…`);
      if(!barcode)barcode=await scanBarcode(labelImages[i].file);
      const result=await Tesseract.recognize(labelImages[i].file,'eng+tur',{logger:m=>{if(m.status==='recognizing text')updateProgress((i+m.progress)/labelImages.length,`Reading image ${i+1}: ${Math.round(m.progress*100)}%`)}});
      const cleaned=result.data.text.trim();if(cleaned)text.push(`--- PANEL ${i+1} ---\n${cleaned}`);
    }
    $('#labelText').value=text.join('\n\n');
    updateProgress(1,`OCR complete. Review ${text.length} extracted panel${text.length!==1?'s':''}.`);
    $('#scanStatus').textContent=text.length?'Text extracted. Review it below before analysis.':'No readable text was found. Retake closer, brighter photos.';
    if(barcode){$('#barcodeValue').textContent=barcode;$('#barcodeResult').hidden=false}
    $('#labelText').focus();
  }catch(e){updateProgress(0,e.message||'OCR failed. Please try clearer images.');$('#scanStatus').textContent='Images were kept on this device; no analysis was submitted.'}
  finally{button.disabled=false}
}

function analyze(){
  const raw=$('#labelText').value.trim(), t=norm(raw), type=$('#productType').value, outer=$('#packageType').value;
  if(!raw){$('#labelText').focus();return;}
  const rows=[];
  const identity=has(t,/\b(serum|cream|lotion|cosmetic|moisturi[sz]er|cleanser|shampoo|conditioner|mascara|lipstick|foundation|tanning|hair)\b/);
  rows.push(item('identity','Product identity',identity?'pass':'missing',identity?'A recognizable cosmetic identity was found.':'No common or descriptive product identity was detected.','Add a clear identity on the principal display panel, e.g. “Facial Serum”.'));
  const qty=has(t,/\b(net\s*(wt\.?|contents?)?\s*)?\d+(\.\d+)?\s*(fl\.?\s*oz\.?|oz\.?|lb\.?|ml|g|kg)\b/);
  rows.push(item('quantity','Net quantity',qty?'pass':'missing',qty?'A quantity statement was detected.':'No net quantity with a recognized unit was detected.','State accurate net contents; use US customary units and optionally metric units.'));
  const ingr=has(t,/\b(ingredients?|ingredientes)\s*:/);
  rows.push(item('ingredients','Ingredient declaration',ingr?'pass':'missing',ingr?'An ingredient heading was found.':'The ingredient declaration was not detected.','Add “Ingredients:” followed by the applicable ingredient declaration.'));
  const business=has(t,/\b(manufactured\s+(by|for)|distributed\s+by|packed\s+by|responsible\s+person)\b/);
  rows.push(item('business','Company role and name',business?'pass':'missing',business?'A manufacturer/distributor role was detected.':'Manufacturer, packer or distributor role was not detected.','Add the business name and “Manufactured by/for” or “Distributed by” as applicable.'));
  const address=has(t,/\b[A-Z]{2}\s+\d{5}(-\d{4})?\b/i)||has(t,/\b(united states|usa|u\.s\.a\.)\b/);
  rows.push(item('address','Business address',address?'pass':'warning',address?'US address indicators were detected.':'A complete US business address could not be confirmed from text alone.','Verify street where required, city, state and ZIP code.'));
  const contact=has(t,/(https?:\/\/|www\.|@|\bemail\b|\bphone\b|\btel\.?\b|\+?1[\s.-]?\(?\d{3}\)?)/);
  rows.push(item('contact','Adverse-event contact channel',contact?'pass':'missing',contact?'A phone or electronic contact channel was found.':'No phone or electronic contact channel was detected.','Add a domestic address, domestic phone number or electronic contact for adverse-event reports.'));
  const origin=has(t,/\b(made in|product of|country of origin)\b/);
  rows.push(item('origin','Country of origin',origin?'pass':'warning',origin?'A country-of-origin statement was detected.':'Country of origin was not detected. Imported goods may require it.','For imported goods, verify the English country-of-origin marking.'));
  const english=has(t,/\b(the|for|use|ingredients?|warning|net|made|distributed|apply|avoid)\b/);
  rows.push(item('language','English required information',english?'pass':'warning',english?'English label content was detected.':'The tool could not confidently detect English required information.','Ensure all required statements appear in English.'));
  rows.push(item('readability','Readability and contrast',$('#readable').checked?'pass':'warning',$('#readable').checked?'User confirmed readable, contrasting text.':'Readability or contrast was not confirmed.','Check type size, contrast, crowding and normal retail viewing.'));
  rows.push(item('outer','Outer-package visibility',(outer==='single'||$('#outerVisible').checked)?'pass':'missing',(outer==='single'||$('#outerVisible').checked)?'Required information visibility was confirmed.':'Required information is not confirmed on the outer retail package.','Repeat required information on the retail outer package or make it visible through the package.'));
  const drug=has(t,/\b(treats?|cures?|heals?|prevents?|anti-inflammatory|antibacterial|antifungal|eczema|psoriasis|acne treatment|regrows? hair|pain relief|repairs? cells?|changes? (the )?(body|skin) structure)\b/);
  rows.push(item('drugclaims','Drug-like claims',drug?'high':'pass',drug?'A disease, treatment or body-function claim was detected.':'No obvious drug-like claim was detected.','Remove or obtain qualified regulatory review; the product may be regulated as a drug.'));
  const fda=has(t,/\bfda\s+(approved|certified|registered)\b/);
  rows.push(item('fdaclaim','FDA approval representation',fda?'high':'pass',fda?'A potentially misleading FDA representation was detected.':'No FDA approval representation was detected.','Do not imply cosmetic approval or certification by FDA.'));
  const evidence=has(t,/\b(100% safe|guaranteed|hypoallergenic|dermatologist tested|clinically proven|organic|non-toxic|chemical-free)\b/);
  rows.push(item('substantiation','Claims needing substantiation',evidence?'warning':'pass',evidence?'One or more claims may require evidence or additional rules.':'No common high-scrutiny marketing phrase was detected.','Keep substantiation records and check rules applicable to each claim.'));
  const color=has(t,/\b(ci\s*\d{5}|fd&c|d&c|color additives?|red\s*no\.|yellow\s*no\.|blue\s*no\.)\b/);
  rows.push(item('colors','Color additives',color?'warning':'pass',color?'A color additive reference was found; permissibility is not verified.':'No explicit color additive reference was detected.','Verify each color additive is permitted for the intended cosmetic use and area of application.'));
  const warning=has(t,/\b(warning|caution|avoid contact|external use only|flammable|keep out of reach)\b/);
  const special=['aerosol','eye','tanning','hair'].includes(type);
  rows.push(item('warnings','Product-specific warnings',special&&!warning?'missing':warning?'pass':'warning',special&&!warning?'This product type may need a warning, but none was detected.':warning?'A warning/caution statement was detected.':'No warning was detected; applicability depends on formulation and use.','Confirm warnings required for product type, formulation, packaging and directions.'));
  const directions=has(t,/\b(directions?|how to use|apply|usage)\b/);
  rows.push(item('directions','Directions for safe use',directions?'pass':'warning',directions?'Directions or use instructions were detected.':'Directions for safe use were not detected.','Add clear directions when needed for safe consumer use.'));
  const mocra=has(t,/\b(responsible person|fe[i]? number|product listing|mocra)\b/);
  rows.push(item('mocra','MoCRA market-readiness duties','warning',mocra?'MoCRA-related text was found, but external records still require review.':'Registration, listing, safety substantiation and reporting cannot be confirmed from the label.','Verify Responsible Person, facility registration/listing status, safety substantiation and adverse-event process.'));
  render(rows);
}

function render(rows){
  window.reportRows=rows;
  const weights={pass:0,warning:4,missing:9,high:18};
  const score=Math.max(0,100-rows.reduce((n,r)=>n+weights[r.status],0));
  $('#score').textContent=score;
  $('#verdict').textContent=rows.some(r=>r.status==='high')?'High-risk review required':score>=85?'Ready for human approval':score>=65?'Corrections recommended':'Major gaps detected';
  const statuses=['pass','warning','missing','high'];
  const names={pass:'PASS',warning:'WARNING',missing:'MISSING',high:'HIGH RISK'};
  $('#counts').innerHTML=statuses.map(s=>`<div class="count ${s}"><b>${rows.filter(r=>r.status===s).length}</b><span>${names[s]}</span></div>`).join('');
  $('#filters').innerHTML=['all',...statuses].map((s,i)=>`<button type="button" class="filter ${i===0?'active':''}" data-filter="${s}">${s==='all'?'All checks':names[s]}</button>`).join('');
  draw(rows,'all');
  $('#empty').hidden=true;$('#report').hidden=false;$('#printBtn').disabled=false;
  document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');draw(rows,b.dataset.filter)});
}
function draw(rows,filter){
  const names={pass:'PASS',warning:'WARNING',missing:'MISSING',high:'HIGH RISK'};
  $('#results').innerHTML=rows.filter(r=>filter==='all'||r.status===filter).map(r=>`<article class="result"><span class="tag ${r.status}">${names[r.status]}</span><div><h4>${r.title}</h4><p>${r.detail} <b>Action:</b> ${r.fix}</p></div></article>`).join('');
}
$('#checker').addEventListener('submit',e=>{e.preventDefault();analyze()});
$('#cameraInput').addEventListener('change',e=>{addImages(e.target.files);e.target.value=''});
$('#imageInput').addEventListener('change',e=>{addImages(e.target.files);e.target.value=''});
$('#readImages').onclick=readImages;
$('#clearImages').onclick=()=>{labelImages.forEach(x=>URL.revokeObjectURL(x.url));labelImages=[];renderPreviews();$('#ocrProgress').hidden=true;$('#barcodeResult').hidden=true};
$('#sampleBtn').onclick=()=>{$('#productType').value='serum';$('#packageType').value='outer';$('#outerVisible').checked=false;$('#labelText').value=`GlowFix Miracle Serum\nCures acne and eczema in 24 hours. FDA Approved. 100% safe.\nNet 30 ml\nIngredients: Aqua, Glycerin, Fragrance, Red No. 40\nManufactured for GlowFix LLC\nMade in Türkiye`;analyze()};
$('#printBtn').onclick=()=>window.print();
$('#langBtn').onclick=()=>alert('Persian interface is planned for the next build. The regulatory report remains in English for the US-market review.');
