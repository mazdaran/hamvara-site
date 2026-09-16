(function(root){
'use strict';
const text=v=>String(v??'').replace(/\s+/g,' ').trim();
const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
const statusOf=a=>a.approved?'APPROVED':a.confidence>=.92&&a.evidenceVerified&&a.verifierAgreement?'READY_TO_APPROVE':a.confidence>=.72?'REVIEW_REQUIRED':'INSUFFICIENT_EVIDENCE';
function normalizeAttribute(a,index=0){
  const source=['Manual','Image','PDF','Document','AI inference'].includes(a.source)?a.source:'AI inference';
  const confidence=source==='Manual'?1:clamp(a.confidence);
  const evidence=text(a.evidence).slice(0,300);
  const evidenceVerified=source==='Manual'?true:Boolean(a.evidenceVerified&&evidence);
  const verifierAgreement=source==='Manual'?true:Boolean(a.verifierAgreement);
  const row={id:text(a.id)||`A-${index+1}`,name:text(a.name).slice(0,100),value:text(a.value).slice(0,240),unit:text(a.unit).slice(0,40),source,sourceFile:text(a.sourceFile).slice(0,140),evidence,confidence,evidenceVerified,verifierAgreement,approved:Boolean(a.approved),edited:Boolean(a.edited)};
  row.status=statusOf(row);return row;
}
function quality(attributes){
  const rows=attributes.map(normalizeAttribute).filter(x=>x.name&&x.value),approved=rows.filter(x=>x.approved),ready=rows.filter(x=>x.status==='READY_TO_APPROVE'),review=rows.filter(x=>x.status==='REVIEW_REQUIRED'),insufficient=rows.filter(x=>x.status==='INSUFFICIENT_EVIDENCE');
  const grounded=rows.filter(x=>x.evidenceVerified||x.source==='Manual').length;
  const score=rows.length?Math.round((grounded/rows.length*.45+rows.filter(x=>x.verifierAgreement).length/rows.length*.25+rows.reduce((s,x)=>s+x.confidence,0)/rows.length*.3)*100):0;
  return{rows,approved,ready,review,insufficient,score,canGenerate:approved.length>0&&review.length===0&&insufficient.length===0};
}
function conflicts(attributes){
  const groups=new Map();attributes.map(normalizeAttribute).forEach(x=>{const k=x.name.toLowerCase();if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x)});
  return[...groups.entries()].filter(([,v])=>new Set(v.map(x=>`${x.value.toLowerCase()}|${x.unit.toLowerCase()}`)).size>1).map(([name,values])=>({name,values}));
}
const api={normalizeAttribute,quality,conflicts,statusOf};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.SpecPackEngine=api;
})(typeof window!=='undefined'?window:globalThis);
