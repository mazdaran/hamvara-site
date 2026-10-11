const mapping={'pilot-tr-workspace':'billing-company-a','pilot-us-workspace':'billing-company-b'};
const unavailable=()=>{throw Object.assign(Error('Subscription verification is unavailable. Try again later.'),{status:503});};
export async function sandboxPaidAccess(env,workspaceId,now=Date.now()) {
 if(env?.MRP_BILLING_SANDBOX!=='true')return null;
 if(env.PILOT_STAGING!=='true')return unavailable();
 if(!Object.hasOwn(mapping,workspaceId))return null;
 if(!env.BILLING_ACCESS?.companyAccess)return unavailable();
 let decision;
 try{decision=await env.BILLING_ACCESS.companyAccess(mapping[workspaceId]);}catch{return unavailable();}
 if(decision?.environment!=='sandbox'||decision.companyId!==mapping[workspaceId]||decision.product!=='mrp'||typeof decision.access!=='boolean'||!Number.isFinite(decision.checkedAt)||Math.abs(now-decision.checkedAt)>30000)return unavailable();
 const until=Date.parse(decision.accessUntil);
 let active=decision.access===true&&Number.isFinite(until)&&until>now;
 if(active){
  if(!Number.isInteger(decision.maxUsers)||decision.maxUsers<1)return unavailable();
  const row=await env.DB.prepare('SELECT COUNT(*) AS count FROM mrp_users WHERE workspace_id=? AND active=1').bind(workspaceId).first();
  if(!row||!Number.isInteger(row.count))return unavailable();
  active=row.count<=decision.maxUsers;
 }
 return {status:active?'ACTIVE':'SUBSCRIPTION_REQUIRED',source:'paddle_sandbox',canRead:active,canWrite:active,endsAt:Number.isFinite(until)?until:null,serverNow:now};
}
