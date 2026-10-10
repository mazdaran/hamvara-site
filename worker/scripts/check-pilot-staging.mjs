import {readFile} from 'node:fs/promises';
const [base,flag]=process.argv.slice(2),url=new URL(base);
if(url.protocol!=='https:'||!/^hamvara-pilot-staging\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Use the exact hamvara-pilot-staging workers.dev origin.');
const health=await fetch(new URL('/health',url),{redirect:'error'}).then(r=>r.json());
if(health.environment!=='pilot-staging'||!health.databaseConfigured)throw Error('Expected isolated pilot staging, refusing credentials.');
const credentials=JSON.parse(await readFile(new URL('../../.pilot-staging/credentials.json',import.meta.url),'utf8'));
async function request(path,headers,body){const response=await fetch(new URL('/api/mrp/'+path,url),{redirect:'error',method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();return {status:response.status,data};}
for(const company of credentials.companies){
 const owner=company.users.find(u=>u.username==='owner'),headers={'X-Hamvara-Workspace':company.workspace,'X-Hamvara-User':owner.username,'X-Hamvara-Key':owner.accessKey};
 const session=await request('session',headers);if(session.status!==200)throw Error('Session failed: '+company.workspace);
 const foreign=await request('session',{...headers,'X-Hamvara-Workspace':company.workspace==='pilot-tr'?'pilot-us':'pilot-tr'});if(foreign.status!==401)throw Error('Cross-tenant credentials were not rejected.');
 if(flag==='--activate-internal'){
  const activated=await request(`workspaces/${company.workspace}/trial/activate`,{Authorization:`Bearer ${credentials.adminToken}`},{ready:true,customerAgreed:true});
  if(activated.status!==200||activated.data.trial.status!=='ACTIVE')throw Error('Internal pilot activation failed or is no longer active: '+company.workspace);
 }
 const current=await request('trial',headers);
 if(current.data.trial?.status==='ACTIVE'){
  const [profile,members,state]=await Promise.all([request('company-profile',headers),request('members',headers),request('state',headers)]);
  if(profile.status!==200||members.status!==200||state.status!==200||members.data.members.length!==3||!state.data.state.company.includes('internal test'))throw Error('Tenant acceptance failed: '+company.workspace);
  const overflow=await request('members',headers,{username:'fourth-user',role:'OPERATOR'});if(overflow.status!==409)throw Error('Seat limit failed.');
 }
 console.log(company.workspace+': session and cross-tenant denial PASS; trial '+current.data.trial.status);
}
console.log('Remote API check finished. No access keys printed. Browser/phone receipt acceptance is a separate check.');
