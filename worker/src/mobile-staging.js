import {handleMrpRequest} from './mrp.js';

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(env.MOBILE_STAGING!=='true')return new Response('Staging configuration required',{status:503});
  if(url.pathname==='/health')return Response.json({ok:true,environment:'mobile-staging',databaseConfigured:!!env.DB});
  if(url.pathname.startsWith('/api/')){
   // Keep provisioning and unrelated public services outside this pilot surface.
   const allowed=url.pathname==='/api/mrp/session'||url.pathname==='/api/mrp/state'||url.pathname==='/api/mrp/mobile-receipts'||url.pathname.startsWith('/api/mrp/mobile-receipts/')||url.pathname.startsWith('/api/mrp/receipt-console/');
   if(!allowed)return Response.json({error:'Not found'},{status:404});
   const origin=request.headers.get('Origin');
   if(origin&&origin!==url.origin)return Response.json({error:'Use the staging site origin'},{status:403});
   try{return await handleMrpRequest(request,env,url);}catch(error){return Response.json({error:error.message||'Request failed'},{status:error.status||500,headers:{'cache-control':'no-store'}});}
  }
  if(url.pathname==='/')return Response.redirect(url.origin+'/mrp/mobile-receipts.html',302);
  return env.ASSETS.fetch(request);
 }
};
