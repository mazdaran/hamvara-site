const problems={
 materials:{title:"MRP Material Check",text:"Sipariş miktarını BOM ile karşılaştırır; kullanılabilir, rezerve ve eksik malzemeyi saniyeler içinde ayırır.",risk:"Yüksek",one:"120 kg",two:"4 saat"},
 inventory:{title:"Live SKU Ledger",text:"RAW, WIP ve mamul depolarındaki tüm giriş, çıkış ve transferleri tek hareket defterinde izlenebilir yapar.",risk:"Orta",one:"3 depo",two:"%100 iz"},
 receiving:{title:"Smart Goods Receipt",text:"Barkod, mobil kamera, Excel veya AI belge okuma ile mal kabulü hızlandırır ve onaya gönderir.",risk:"Orta",one:"%72",two:"8 dk"},
 delivery:{title:"Reliable Delivery Planner",text:"Malzeme, kapasite, operasyon süresi ve mevcut iş yükünü birlikte değerlendirerek gerçekçi teslim tarihi verir.",risk:"Yüksek",one:"18 saat",two:"2 risk"}
};
document.querySelectorAll(".problem").forEach(btn=>btn.addEventListener("click",()=>{
 document.querySelectorAll(".problem").forEach(x=>x.classList.remove("active"));btn.classList.add("active");
 const p=problems[btn.dataset.problem];solutionTitle.textContent=p.title;solutionText.textContent=p.text;riskValue.textContent=p.risk;statOne.textContent=p.one;statTwo.textContent=p.two;
}));
document.querySelector(".jump-demo").addEventListener("click",()=>{document.querySelector("#automation").scrollIntoView();setTimeout(runFlow,500)});
const sku=document.querySelector("#sku"),warehouse=document.querySelector("#warehouse");
function updatePlan(){
 skuOut.value=Number(sku.value).toLocaleString("tr-TR");warehouseOut.value=warehouse.value;
 const f=[...document.querySelectorAll('input[name="feature"]:checked')].map(x=>x.value),s=+sku.value,w=+warehouse.value;
 let name="Portable Lite",price=690,reason="Basit stok ve günlük giriş/çıkış için hızlı başlangıç.",features=["Stok yönetimi","Excel içe aktarma","Yerel kullanım"];
 if(s>250||f.includes("mrp")){name="Medium";price=1490;reason="BOM, malzeme ihtiyacı ve satın alma önerileri için dengeli başlangıç.";features=["MRP ihtiyaç planlama","BOM yönetimi","Satın alma önerileri"]}
 if(s>1500||w>5||f.includes("barcode")){name="Pro";price=2790;reason="Çoklu depo, barkod ve yoğun üretim operasyonu için güçlü kontrol.";features=["Çoklu depo & roller","Barkod ve mobil","Üretim & fire takibi"]}
 if(s>3500||w>12||f.includes("ai")){name="Extended";price=4490;reason="Yüksek ölçek, akıllı belge akışı ve ileri entegrasyonlar için.";features=["AI belge okuma","API & otomasyon","Çoklu tesis yönetimi"]}
 if(f.includes("tr")){price+=290;features.push("e-Belge taslak hazırlama")}
 planName.textContent=name;planReason.textContent=reason;priceValue.innerHTML="₺"+price.toLocaleString("tr-TR")+"<small>/ay</small>";planFeatures.innerHTML=features.map(x=>"<li>"+x+"</li>").join("");
 complianceNote.classList.toggle("visible",f.includes("tr"));
}
document.querySelector("#planForm").addEventListener("input",updatePlan);
let timer;
function runFlow(){
 clearTimeout(timer);const steps=[...document.querySelectorAll(".flow-step")];result.classList.remove("visible");steps.forEach(s=>{s.classList.remove("done","running");s.querySelector("em").textContent="Bekliyor"});
 let i=0;function next(){if(i&&steps[i-1]){steps[i-1].classList.remove("running");steps[i-1].classList.add("done");steps[i-1].querySelector("em").textContent=i===3?"Eksik bulundu":"Tamamlandı"}if(i<steps.length){steps[i].classList.add("running");steps[i].querySelector("em").textContent="İşleniyor";i++;timer=setTimeout(next,650)}else{result.classList.add("visible");runDemo.innerHTML='Tekrar çalıştır <span>↻</span>'}}next();
}
runDemo.addEventListener("click",runFlow);

function openProposalSummary(){
 const selected=[...document.querySelectorAll('input[name="feature"]:checked')].map(input=>input.closest("label")?.textContent.trim()).filter(Boolean);
 const overlay=document.createElement("div");
 overlay.className="proposal-overlay";
 overlay.innerHTML=`<section class="proposal-dialog" role="dialog" aria-modal="true" aria-labelledby="proposal-title">
  <button class="proposal-close" type="button" aria-label="Close proposal summary">×</button>
  <p class="proposal-kicker">HAMVARA PROPOSAL</p>
  <h2 id="proposal-title">${planName.textContent} plan summary</h2>
  <div class="proposal-grid">
   <span>Number of SKUs<strong>${Number(sku.value).toLocaleString("en-US")}</strong></span>
   <span>Warehouses<strong>${warehouse.value}</strong></span>
   <span>Estimated price<strong>${priceValue.textContent.trim()}</strong></span>
  </div>
  <div class="proposal-needs"><b>Selected needs</b><ul>${(selected.length?selected:["Core inventory management"]).map(item=>`<li>${item}</li>`).join("")}</ul></div>
  <p class="proposal-note">The final price is confirmed after reviewing the installation scope.</p>
  <div class="proposal-actions">
   <a class="primary" href="mailto:info@hamvara.com?subject=${encodeURIComponent("Hamvara "+planName.textContent+" proposal request")}">Request by email <span>→</span></a>
   <a class="proposal-secondary" href="https://wa.me/18322398510?text=${encodeURIComponent("Hello Hamvara, I would like a proposal for the "+planName.textContent+" plan.")}" target="_blank" rel="noopener">Continue on WhatsApp</a>
  </div>
 </section>`;
 const close=()=>{overlay.remove();document.body.classList.remove("proposal-open");quoteBtn.focus()};
 overlay.addEventListener("click",event=>{if(event.target===overlay)close()});
 overlay.querySelector(".proposal-close").addEventListener("click",close);
 document.addEventListener("keydown",function escape(event){if(event.key==="Escape"){document.removeEventListener("keydown",escape);close()}},{once:true});
 document.body.appendChild(overlay);document.body.classList.add("proposal-open");overlay.querySelector(".proposal-close").focus();
}

const proposalStyles=document.createElement("style");
proposalStyles.textContent=`body.proposal-open{overflow:hidden}.proposal-overlay{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:rgba(2,12,24,.78);backdrop-filter:blur(8px)}.proposal-dialog{position:relative;width:min(620px,100%);max-height:90vh;overflow:auto;padding:34px;background:#0b213c;color:#f3f7fb;border:1px solid #20d4e5;border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,.5)}.proposal-close{position:absolute;top:14px;right:16px;width:38px;height:38px;border:1px solid #29425b;border-radius:9px;background:#07172b;color:#f3f7fb;font-size:25px;cursor:pointer}.proposal-kicker{margin:0;color:#20d4e5;font-size:12px;font-weight:800;letter-spacing:.14em}.proposal-dialog h2{margin:10px 46px 24px 0;font-size:32px}.proposal-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.proposal-grid span{padding:15px;background:#07172b;border:1px solid #29425b;border-radius:10px;color:#91a5ba;font-size:13px}.proposal-grid strong{display:block;margin-top:6px;color:#f3f7fb;font-size:20px}.proposal-needs{margin:22px 0;padding:18px;background:#102943;border-radius:10px}.proposal-needs ul{margin:10px 0 0;padding-left:20px}.proposal-note{color:#91a5ba;font-size:13px}.proposal-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:24px}.proposal-actions a{text-decoration:none}.proposal-secondary{display:grid;place-items:center;padding:13px 17px;border:1px solid #29425b;border-radius:9px;color:#f3f7fb;font-weight:700}@media(max-width:600px){.proposal-dialog{padding:26px 20px}.proposal-grid,.proposal-actions{grid-template-columns:1fr}.proposal-dialog h2{font-size:26px}}`;
document.head.appendChild(proposalStyles);
quoteBtn.addEventListener("click",openProposalSummary);
langBtn.addEventListener("click",()=>{toast.textContent="English content will be connected in the next localization phase.";toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2600)});
