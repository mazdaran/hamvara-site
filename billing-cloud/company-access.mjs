import {billingSnapshot} from './commerce.mjs';
import {projectRecords} from './projection.mjs';
export async function companyAccess(env,companyId,now=Date.now()) {
 if(env.BILLING_ENV!=='sandbox')throw Error('Sandbox required');
 if(!['billing-company-a','billing-company-b'].includes(companyId))throw Error('Unknown sandbox company');
 const records=await billingSnapshot(env.DB);
 const matches=projectRecords(records,now).entitlements.filter(e=>e.product==='mrp'&&e.scope==='company'&&e.ownerId===companyId);
 const e=matches.length===1?matches[0]:null;
 return {environment:'sandbox',companyId,product:'mrp',access:e?.access===true,reason:e?.reason||'no_verified_subscription',accessUntil:e?.accessUntil||null,maxUsers:e?.limits?.users||0,checkedAt:now};
}
