import {handleMrpRequest} from './mrp.js';
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(env.PILOT_STAGING!=='true')return new Response('Staging configuration required',{status:503});
  if(url.pathname==='/health')return Response.json({ok:true,environment:'pilot-staging',databaseConfigured:!!env.DB});
  if(url.pathname.startsWith('/api/')){
   if(!url.pathname.startsWith('/api/mrp/'))return Response.json({error:'Not found'},{status:404});
   const origin=request.headers.get('Origin');
   if(origin&&origin!==url.origin)return Response.json({error:'Use the staging site origin'},{status:403});
   try{return await handleMrpRequest(request,env,url);}catch(error){return Response.json({error:error.status?error.message:'Request failed'},{status:error.status||500,headers:{'cache-control':'no-store'}});}
  }
  if(url.pathname==='/')return Response.redirect(url.origin+'/mrp/',302);
  const response=await env.ASSETS.fetch(request);
  const headers=new Headers(response.headers);headers.set('X-Robots-Tag','noindex, nofollow');headers.set('Cache-Control','no-store');
  return new Response(response.body,{status:response.status,headers});
 }
};
