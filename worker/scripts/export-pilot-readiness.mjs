import {readFile,mkdir,writeFile,mkdtemp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// This exact allowlisted origin hosts the same existing internal pilot Worker and D1.
// Never accept a URL from CLI input or environment when sending private access keys.
export const PILOT_ORIGIN='https://pilot.hamvara.com';
const EXPECTED_DATABASE='873e4f9d-df81-4a3a-bfda-86491e729ae8';
const roles={owner:'CEO',operator:'OPERATOR',manager:'PRODUCTION_MANAGER'};
const label=value=>String(value??'').replace(/[\r\n\t]/g,' ');

// Read-only requests. No activation, provisioning, grants, payment or stock mutations.
export async function inspectPilots(credentials,fetcher=fetch){
 if(credentials.databaseId!==EXPECTED_DATABASE)throw Error('Unexpected staging database. No credentials sent.');
 if(!Array.isArray(credentials.companies)||credentials.companies.length!==2||new Set(credentials.companies.map(c=>c.workspace)).size!==2)throw Error('Expected two internal pilot companies.');
 for(const c of credentials.companies){
  if(!['pilot-tr','pilot-us'].includes(c.workspace)||!Array.isArray(c.users)||c.users.length!==3||new Set(c.users.map(u=>u.username)).size!==3)throw Error('Invalid internal pilot user list.');
  for(const u of c.users)if(!Object.hasOwn(roles,u.username)||roles[u.username]!==u.role||!/^[-_A-Za-z0-9]{32,128}$/.test(u.accessKey||''))throw Error('Invalid user or key format.');
 }
 async function get(path,company,user){
  let response;
  try{response=await fetcher(PILOT_ORIGIN+path,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:company?{'X-Hamvara-Workspace':company,'X-Hamvara-User':user.username,'X-Hamvara-Key':user.accessKey}:{}});}catch{throw Error('Read-only check could not reach the pilot server. No export created.');}
  let data;try{data=await response.json();}catch{throw Error('Pilot server returned an unexpected response. No export created.');}
  return {status:response.status,data};
 }
 const health=await get('/health');
 if(health.status!==200||health.data.ok!==true||health.data.environment!=='pilot-staging'||health.data.databaseConfigured!==true)throw Error('Isolated staging health check failed. No credentials sent.');
 const reports=[];
 for(const c of credentials.companies){
  const report={workspace:c.workspace,customerReady:false,purpose:'INTERNAL TEST ONLY',users:[],blockers:['Internal sample workspace: create a separate workspace for each real customer.']};
  let owner;
  for(const u of c.users){
   const session=await get('/api/mrp/session',c.workspace,u),s=session.data;
   if(session.status!==200||s.workspace?.slug!==c.workspace||s.workspace?.id!==c.workspace+'-workspace'||s.user?.username!==u.username||s.user?.role!==u.role)throw Error(`Identity verification failed for ${c.workspace}/${u.username}. No export created.`);
   const foreign=await get('/api/mrp/session',c.workspace==='pilot-tr'?'pilot-us':'pilot-tr',u);
   if(foreign.status!==401)throw Error('Cross-company isolation check failed. No export created.');
   report.users.push({username:u.username,role:u.role,login:'PASS',crossCompanyDenied:true});
   if(u.username==='owner'){owner=s;report.access={status:s.trial?.status,source:s.trial?.source||'trial',canRead:s.trial?.canRead===true,canWrite:s.trial?.canWrite===true,endsAt:s.trial?.endsAt??null};}
   if(s.capabilities?.serverReceipts!==true)report.blockers.push(`${u.username}: secure receipt capability unavailable.`);
   const bootstrap=await get('/api/mrp/receipt-console/bootstrap',c.workspace,u);
   const warehouses=bootstrap.status===200&&Array.isArray(bootstrap.data.warehouses)?bootstrap.data.warehouses.map(w=>w.code):[];
   report.users.at(-1).receiptWarehouses=warehouses;
   report.users.at(-1).receiptConsoleStatus=bootstrap.status;
   if(!warehouses.includes('WH-FG'))report.blockers.push(`${u.username}: Product warehouse receipt access unavailable (HTTP ${bootstrap.status}).`);
  }
  if(!report.access.canWrite)report.blockers.push('MRP write access is not active. Resolve entitlement before operational testing.');
  if(report.access.source==='paddle_sandbox')report.blockers.push('Payment entitlement is sandbox-only, not a live customer subscription.');
  const user=c.users.find(u=>u.username==='owner');
  const profile=await get('/api/mrp/company-profile',c.workspace,user),members=await get('/api/mrp/members',c.workspace,user);
  report.profileStatus=profile.status;
  if(profile.status===200&&profile.data.profile){
   const p=profile.data.profile;report.profile={country:label(p.country),language:label(p.language),timezone:label(p.timezone),currency:label(p.currency),memberLimit:p.memberLimit};
   if(!p.contactEmail||p.contactEmail.endsWith('.invalid'))report.blockers.push('A real customer contact email has not been configured.');
  }else report.blockers.push(`Company profile could not be checked (HTTP ${profile.status}).`);
  report.membersStatus=members.status;
  if(members.status===200&&Array.isArray(members.data.members)){
   const active=members.data.members.filter(u=>u.active===1||u.active===true);
   report.activeMembers=active.length;
   if(active.length!==3||members.data.memberLimit!==3||!c.users.every(u=>active.some(m=>m.username===u.username&&m.role===u.role)))report.blockers.push('Server members or three-user limit differ from the expected internal pilot.');
  }else report.blockers.push(`Named users could not be checked (HTTP ${members.status}).`);
  report.internalOperationalReady=report.access.canWrite&&report.users.every(u=>u.receiptWarehouses.includes('WH-FG'))&&report.activeMembers===3;
  reports.push(report);
 }
 return {checkedAt:new Date().toISOString(),origin:PILOT_ORIGIN,readOnly:true,companies:reports};
}

export async function exportReadiness(credentials,report,directory){
 await mkdir(directory,{recursive:true,mode:0o700});
 const output=await mkdtemp(resolve(directory,'readiness-'));
 await writeFile(resolve(output,'readiness-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 for(const c of credentials.companies){
  const status=report.companies.find(r=>r.workspace===c.workspace);
  const lines=['HAMVARA — INTERNAL TEST ACCESS — KEEP PRIVATE','Not a real customer handover. Contains existing access keys.',`Checked: ${report.checkedAt}`,`Workplace / Workspace: ${c.workspace}`,`Login: ${PILOT_ORIGIN}/mrp/`,`Computer receipts: ${PILOT_ORIGIN}/mrp/mobile-receipts.html#computer`,`Mobile pairing console: ${PILOT_ORIGIN}/mrp/mobile-receipts.html#mobile`,`MRP access: ${status.access.status} (${status.access.source})`,''];
  for(const u of c.users){
   const record=status.users.find(v=>v.username===u.username);
   lines.push(`Username: ${u.username}`,`Role: ${u.role}`,`Access key: ${u.accessKey}`,`Receipt warehouses: ${record.receiptWarehouses.join(', ')||'Unavailable'}`,'');
  }
  lines.push('BLOCKERS / NEXT ACTIONS',...status.blockers.map(b=>'- '+b),'','Only the administrator should keep this combined file. Deliver each real user only their own credential.','No new keys were created or rotated. No trial was activated.');
  await writeFile(resolve(output,c.workspace+'-access.txt'),'\ufeff'+lines.join('\r\n')+'\r\n',{mode:0o600,flag:'wx'});
 }
 return output;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const root=fileURLToPath(new URL('../../.pilot-staging/',import.meta.url));
  const credentials=JSON.parse(await readFile(resolve(root,'credentials.json'),'utf8'));
  const report=await inspectPilots(credentials);
  const output=await exportReadiness(credentials,report,root);
  // The report uses an explicit allowlist; no server payloads, keys or admin token are logged.
  console.log(JSON.stringify(report,null,2));console.log('Private access files saved in: '+output);
 }catch(error){console.error(error.code?'Local readiness files could not be read or written.':error.message);process.exitCode=1;}
}
