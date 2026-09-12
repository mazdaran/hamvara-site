const num=value=>Number.isFinite(Number(value))?Number(value):0;
const dayMs=86400000;
const addDays=(value,days)=>new Date(new Date(`${value}T12:00:00Z`).getTime()+days*dayMs).toISOString().slice(0,10);

export function normalizeStabilityFrontier(state){state.planningTimeFences??={demandDays:0,planningDays:0};const demandDays=Math.max(0,Math.floor(num(state.planningTimeFences.demandDays))),planningDays=Math.max(demandDays,Math.floor(num(state.planningTimeFences.planningDays)));return{enabled:planningDays>0,demandDays,planningDays}}
export function frontierZone(value,{asOf,demandDays,planningDays}){const date=String(value||'').slice(0,10);if(!date)return'LIQUID';if(date<=addDays(asOf,demandDays))return'FROZEN';if(date<=addDays(asOf,planningDays))return'SLUSHY';return'LIQUID'}
export function assessStabilityFrontier(state,changes,{asOf}={}){
  const settings=normalizeStabilityFrontier(state),assessments=(changes||[]).map(change=>{const effectiveDate=change.currentReleaseDate||change.previousReleaseDate||'',zone=frontierZone(effectiveDate,{asOf,...settings}),severity=zone==='FROZEN'?'BLOCK':zone==='SLUSHY'?'REVIEW':'ALLOW';return{key:change.key,type:change.type,reference:change.reference,sku:change.sku,effectiveDate,zone,severity,quantityChange:num(change.quantityChange)}});
  return{...settings,asOf,frozenThrough:addDays(asOf,settings.demandDays),slushyThrough:addDays(asOf,settings.planningDays),assessments,blocked:settings.enabled?assessments.filter(row=>row.severity==='BLOCK'):[],review:settings.enabled?assessments.filter(row=>row.severity==='REVIEW'):[],allowed:settings.enabled?assessments.filter(row=>row.severity==='ALLOW'):assessments};
}
