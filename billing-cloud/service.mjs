import {WorkerEntrypoint} from 'cloudflare:workers';
import worker from './worker.mjs';
import {companyAccess} from './company-access.mjs';
// Only a service binding to this named entrypoint can invoke this method.
// The public fetch handler does not expose entitlement lookups by company ID.
export class BillingAccess extends WorkerEntrypoint {
 async companyAccess(companyId) { return companyAccess(this.env,companyId); }
}
export default worker;
