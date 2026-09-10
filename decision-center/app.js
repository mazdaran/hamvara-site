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
quoteBtn.addEventListener("click",()=>{toast.textContent=planName.textContent+" planı için teklif özeti hazırlandı.";toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2600)});
langBtn.addEventListener("click",()=>{toast.textContent="English content will be connected in the next localization phase.";toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2600)});
