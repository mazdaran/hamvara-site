const problems={
 materials:{title:"MRP Material Check",text:"Compares order demand with the BOM and separates available, reserved, and missing materials in seconds.",risk:"High",one:"120 kg",two:"4 hours"},
 inventory:{title:"Live SKU Ledger",text:"Makes every receipt, issue, and transfer across raw-material, WIP, and finished-goods warehouses traceable in one ledger.",risk:"Medium",one:"3 warehouses",two:"100% traceability"},
 receiving:{title:"Smart Goods Receipt",text:"Accelerates receiving with barcodes, mobile camera scanning, Excel imports, or AI document reading, then routes entries for approval.",risk:"Medium",one:"72% faster",two:"8 minutes"},
 delivery:{title:"Reliable Delivery Planner",text:"Calculates realistic delivery dates using materials, capacity, operation times, and the current workload.",risk:"High",one:"18 hours",two:"2 risks"}
};
document.querySelectorAll(".problem").forEach(btn=>btn.addEventListener("click",()=>{
 document.querySelectorAll(".problem").forEach(x=>x.classList.remove("active"));btn.classList.add("active");
 const p=problems[btn.dataset.problem];solutionTitle.textContent=p.title;solutionText.textContent=p.text;riskValue.textContent=p.risk;statOne.textContent=p.one;statTwo.textContent=p.two;
}));
document.querySelector(".jump-demo").addEventListener("click",()=>{document.querySelector("#automation").scrollIntoView();setTimeout(runFlow,500)});
const sku=document.querySelector("#sku"),warehouse=document.querySelector("#warehouse");
function updatePlan(){
 skuOut.value=Number(sku.value).toLocaleString("en-US");warehouseOut.value=warehouse.value;
 const f=[...document.querySelectorAll('input[name="feature"]:checked')].map(x=>x.value),s=+sku.value,w=+warehouse.value;
 let name="Portable Lite",price=690,reason="A fast starting point for basic inventory and daily receipts and issues.",features=["Inventory management","Excel imports","Local operation"];
 if(s>250||f.includes("mrp")){name="Medium";price=1490;reason="A balanced starting point for BOM, material requirements, and purchase recommendations.";features=["MRP requirements planning","BOM management","Purchase recommendations"]}
 if(s>1500||w>5||f.includes("barcode")){name="Pro";price=2790;reason="Powerful control for multi-warehouse, barcode-enabled, and busy production operations.";features=["Multi-warehouse & roles","Barcode & mobile","Production & waste tracking"]}
 if(s>3500||w>12||f.includes("ai")){name="Extended";price=4490;reason="Designed for high scale, intelligent document workflows, and advanced integrations.";features=["AI document reading","API & automation","Multi-facility management"]}
 if(f.includes("tr")){price+=290;features.push("e-Document drafting")}
 planName.textContent=name;planReason.textContent=reason;priceValue.innerHTML="₺"+price.toLocaleString("en-US")+"<small>/month</small>";planFeatures.innerHTML=features.map(x=>"<li>"+x+"</li>").join("");
 complianceNote.classList.toggle("visible",f.includes("tr"));
}
document.querySelector("#planForm").addEventListener("input",updatePlan);
let timer;
function runFlow(){
 clearTimeout(timer);const steps=[...document.querySelectorAll(".flow-step")];result.classList.remove("visible");steps.forEach(s=>{s.classList.remove("done","running");s.querySelector("em").textContent="Waiting"});
 let i=0;function next(){if(i&&steps[i-1]){steps[i-1].classList.remove("running");steps[i-1].classList.add("done");steps[i-1].querySelector("em").textContent=i===3?"Shortage detected":"Completed"}if(i<steps.length){steps[i].classList.add("running");steps[i].querySelector("em").textContent="Processing";i++;timer=setTimeout(next,650)}else{result.classList.add("visible");runDemo.innerHTML='Run again <span>↻</span>'}}next();
}
runDemo.addEventListener("click",runFlow);

function openProposalSummary(){
 const selected=[...document.querySelectorAll('input[name="feature"]:checked')].map(input=>input.closest("label")?.textContent.trim()).filter(Boolean);
 const proposalSubject="Hamvara "+planName.textContent+" proposal request";
 const proposalBody=[
  "Hello Hamvara,",
  "",
  "I would like to request a proposal with the following configuration:",
  "",
  "Plan: "+planName.textContent,
  "Number of SKUs: "+Number(sku.value).toLocaleString("en-US"),
  "Warehouses: "+warehouse.value,
  "Selected needs: "+(selected.length?selected.join(", "):"Core inventory management"),
  "Estimated price: "+priceValue.textContent.trim(),
  "",
  "Please contact me to confirm the installation scope and final price."
 ].join("\n");
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
   <a class="primary" href="mailto:info@hamvara.com?subject=${encodeURIComponent(proposalSubject)}&body=${encodeURIComponent(proposalBody)}">Request by email <span>→</span></a>
   <a class="proposal-secondary" href="https://wa.me/18322398510?text=${encodeURIComponent(proposalBody)}" target="_blank" rel="noopener">Continue on WhatsApp</a>
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
document.querySelector("#langBtn")?.remove();
