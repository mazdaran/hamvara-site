const PROVIDERS = {
  google: {
    authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    clientId: 'GOOGLE_CLIENT_ID',
    clientSecret: 'GOOGLE_CLIENT_SECRET',
    scopes: ['openid','email','profile','https://www.googleapis.com/auth/webmasters.readonly','https://www.googleapis.com/auth/analytics.readonly']
  },
  linkedin: {
    authorization: 'https://www.linkedin.com/oauth/v2/authorization',
    token: 'https://www.linkedin.com/oauth/v2/accessToken',
    clientId: 'LINKEDIN_CLIENT_ID',
    clientSecret: 'LINKEDIN_CLIENT_SECRET',
    scopes: ['openid','profile','email']
  },
  wordpress: {
    authorization: 'https://public-api.wordpress.com/oauth2/authorize',
    token: 'https://public-api.wordpress.com/oauth2/token',
    clientId: 'WORDPRESS_CLIENT_ID',
    clientSecret: 'WORDPRESS_CLIENT_SECRET',
    scopes: []
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      let response;
      if (url.pathname === '/health') response = json({ ok: true, service: 'hamvara-growth-api', pageSpeedApiKeyConfigured: Boolean(env.PAGESPEED_API_KEY), oauthConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.OAUTH_STATE_SECRET && env.TOKEN_ENCRYPTION_KEY), databaseConfigured: Boolean(env.DB), time: new Date().toISOString() });
      else if (url.pathname === '/api/audit' && request.method === 'POST') response = await audit(request, env);
      else if (url.pathname === '/api/integrations' && request.method === 'GET') response = await integrationStatuses(env);
      else if (/^\/api\/integrations\/(google|meta|linkedin|wordpress)\/test$/.test(url.pathname) && request.method === 'GET') response = await testIntegration(url.pathname.split('/')[3], env);
      else if (/^\/api\/oauth\/(google|meta|linkedin|wordpress)\/start$/.test(url.pathname)) response = await oauthStart(request, env);
      else if (/^\/api\/oauth\/(google|meta|linkedin|wordpress)\/callback$/.test(url.pathname)) response = await oauthCallback(request, env);
      else response = json({ error: 'Not found' }, 404);
      const headers = new Headers(response.headers); Object.entries(cors).forEach(([k,v]) => headers.set(k,v));
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      console.error(error);
      return json({ error: error.message || 'Unexpected server error' }, error.status || 500, cors);
    }
  }
};

async function audit(request, env) {
  const body = await request.json();
  const target = validHttpUrl(body.url); if (!target) throw httpError(400, 'A valid http/https URL is required.');
  const strategy = body.strategy === 'desktop' ? 'desktop' : 'mobile';
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', target.href); endpoint.searchParams.set('strategy', strategy);
  ['performance','accessibility','best-practices','seo'].forEach(x => endpoint.searchParams.append('category',x));
  if (env.PAGESPEED_API_KEY) endpoint.searchParams.set('key', env.PAGESPEED_API_KEY);
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  const raw = await response.json();
  if (!response.ok) throw httpError(response.status, raw.error?.message || 'PageSpeed analysis failed.');
  return json(normalizePageSpeed(raw, target.href, strategy));
}

function normalizePageSpeed(raw, requestedUrl, strategy) {
  const lr=raw.lighthouseResult||{}, cats=lr.categories||{}, audits=lr.audits||{};
  const score=id=>Math.round((cats[id]?.score||0)*100);
  const metric=id=>({id,label:audits[id]?.title||id,value:audits[id]?.displayValue||'—',score:audits[id]?.score});
  const findings=Object.values(audits).filter(a=>a&&a.score!==null&&a.score<.9&&a.details?.type==='opportunity').sort((a,b)=>(b.details?.overallSavingsMs||0)-(a.details?.overallSavingsMs||0)).slice(0,8).map(a=>({id:a.id,title:a.title,description:stripMarkdownLinks(a.description||''),score:a.score,savingsMs:Math.round(a.details?.overallSavingsMs||0)}));
  if(!findings.length) Object.values(audits).filter(a=>a&&a.score!==null&&a.score<.9&&a.title).sort((a,b)=>(a.score??1)-(b.score??1)).slice(0,8).forEach(a=>findings.push({id:a.id,title:a.title,description:stripMarkdownLinks(a.description||''),score:a.score,savingsMs:Math.round(a.details?.overallSavingsMs||0)}));
  return {source:'Google PageSpeed Insights / Lighthouse',url:lr.finalUrl||requestedUrl,requestedUrl,strategy,fetchedAt:raw.analysisUTCTimestamp||new Date().toISOString(),scores:{performance:score('performance'),accessibility:score('accessibility'),'best-practices':score('best-practices'),seo:score('seo')},vitals:[metric('largest-contentful-paint'),metric('interaction-to-next-paint'),metric('cumulative-layout-shift'),metric('first-contentful-paint'),metric('speed-index'),metric('total-blocking-time')],findings};
}

async function integrationStatuses(env) {
  const rows = env.DB ? await env.DB.prepare('SELECT provider, updated_at FROM oauth_connections WHERE workspace_id = ?').bind('hamvara').all() : { results: [] };
  const found = Object.fromEntries((rows.results||[]).map(x=>[x.provider,x]));
  return json({ integrations: {
    'google-search-console': status(found.google), 'google-analytics': status(found.google), meta: status(found.meta), linkedin: status(found.linkedin), wordpress: status(found.wordpress)
  }});
}

async function oauthStart(request, env) {
  requireEnv(env, ['OAUTH_STATE_SECRET','TOKEN_ENCRYPTION_KEY']);
  const url=new URL(request.url), provider=url.pathname.split('/')[3], redirectUri=`${url.origin}/api/oauth/${provider}/callback`;
  const cfg=providerConfig(provider,env); requireEnv(env,[cfg.clientId,cfg.clientSecret]);
  const returnTo=safeReturnTo(url.searchParams.get('return_to'),env);
  const state=await signState({provider,returnTo,createdAt:Date.now()},env.OAUTH_STATE_SECRET);
  const authorization=new URL(cfg.authorization); authorization.searchParams.set('client_id',env[cfg.clientId]); authorization.searchParams.set('redirect_uri',redirectUri); authorization.searchParams.set('response_type','code'); authorization.searchParams.set('state',state);
  if(cfg.scopes.length)authorization.searchParams.set('scope',cfg.scopes.join(' '));
  if(provider==='google'){authorization.searchParams.set('access_type','offline');authorization.searchParams.set('prompt','consent');authorization.searchParams.set('include_granted_scopes','true');}
  return Response.redirect(authorization.toString(),302);
}

async function oauthCallback(request, env) {
  requireEnv(env,['OAUTH_STATE_SECRET','TOKEN_ENCRYPTION_KEY']); if(!env.DB)throw httpError(503,'Database binding is not configured.');
  const url=new URL(request.url), provider=url.pathname.split('/')[3], code=url.searchParams.get('code'), state=url.searchParams.get('state');
  if(!code||!state)throw httpError(400,url.searchParams.get('error_description')||'OAuth callback is incomplete.');
  const stateData=await verifyState(state,env.OAUTH_STATE_SECRET); if(stateData.provider!==provider||Date.now()-stateData.createdAt>600000)throw httpError(400,'OAuth state is invalid or expired.');
  const cfg=providerConfig(provider,env); requireEnv(env,[cfg.clientId,cfg.clientSecret]); const redirectUri=`${url.origin}/api/oauth/${provider}/callback`;
  const form=new URLSearchParams({client_id:env[cfg.clientId],client_secret:env[cfg.clientSecret],redirect_uri:redirectUri,code,grant_type:'authorization_code'});
  const tokenResponse=await fetch(cfg.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:form});
  const token=await tokenResponse.json(); if(!tokenResponse.ok||!token.access_token)throw httpError(400,token.error_description||token.error||'Token exchange failed.');
  const access=await encrypt(token.access_token,env.TOKEN_ENCRYPTION_KEY); const refresh=token.refresh_token?await encrypt(token.refresh_token,env.TOKEN_ENCRYPTION_KEY):null;
  const expiresAt=token.expires_in?new Date(Date.now()+Number(token.expires_in)*1000).toISOString():null;
  await env.DB.prepare(`INSERT INTO oauth_connections (workspace_id,provider,access_token_ciphertext,refresh_token_ciphertext,expires_at,scopes,metadata,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(workspace_id,provider) DO UPDATE SET access_token_ciphertext=excluded.access_token_ciphertext,refresh_token_ciphertext=COALESCE(excluded.refresh_token_ciphertext,oauth_connections.refresh_token_ciphertext),expires_at=excluded.expires_at,scopes=excluded.scopes,metadata=excluded.metadata,updated_at=datetime('now')`).bind('hamvara',provider,access,refresh,expiresAt,token.scope||cfg.scopes.join(' '),JSON.stringify({token_type:token.token_type||'Bearer'})).run();
  const destination=new URL(stateData.returnTo); destination.searchParams.set('connected',provider); return Response.redirect(destination.toString(),302);
}

async function testIntegration(provider,env){
  if(!env.DB)throw httpError(503,'Database binding is not configured.');
  const row=await env.DB.prepare('SELECT access_token_ciphertext FROM oauth_connections WHERE workspace_id=? AND provider=?').bind('hamvara',provider).first(); if(!row)throw httpError(404,'Integration is not connected.');
  const token=await decrypt(row.access_token_ciphertext,env.TOKEN_ENCRYPTION_KEY); let endpoint,headers={Authorization:`Bearer ${token}`,Accept:'application/json'};
  if(provider==='google')endpoint='https://openidconnect.googleapis.com/v1/userinfo';
  if(provider==='linkedin')endpoint='https://api.linkedin.com/v2/userinfo';
  if(provider==='wordpress')endpoint='https://public-api.wordpress.com/rest/v1.1/me';
  if(provider==='meta'){const version=env.META_GRAPH_VERSION||'v23.0';endpoint=`https://graph.facebook.com/${version}/me?fields=id,name`;}
  const response=await fetch(endpoint,{headers});const body=await response.json();if(!response.ok)throw httpError(response.status,body.error?.message||'Provider rejected the token.');
  return json({ok:true,provider,account:{id:body.id||body.ID||body.sub||null,name:body.name||body.display_name||body.email||null}});
}

function providerConfig(provider,env){
  if(provider!=='meta')return PROVIDERS[provider];
  const version=env.META_GRAPH_VERSION||'v23.0';return{authorization:`https://www.facebook.com/${version}/dialog/oauth`,token:`https://graph.facebook.com/${version}/oauth/access_token`,clientId:'META_APP_ID',clientSecret:'META_APP_SECRET',scopes:['pages_show_list','pages_read_engagement','instagram_basic','instagram_manage_insights']};
}
function status(row){return{connected:Boolean(row),updatedAt:row?.updated_at||null};}
function validHttpUrl(value){try{const url=new URL(String(value||''));return /^https?:$/.test(url.protocol)?url:null}catch{return null}}
function safeReturnTo(value,env){const fallback='https://hamvara.com/growth/';try{const url=new URL(value||fallback);const allowed=(env.ALLOWED_ORIGINS||'https://hamvara.com,http://localhost:8080').split(',').map(x=>x.trim());return allowed.includes(url.origin)?url.toString():fallback}catch{return fallback}}
function corsHeaders(origin,env){const allowed=(env.ALLOWED_ORIGINS||'https://hamvara.com,http://localhost:8080').split(',').map(x=>x.trim());return{'Access-Control-Allow-Origin':allowed.includes(origin)?origin:allowed[0],'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Vary':'Origin'};}
function stripMarkdownLinks(text){return text.replace(/\[([^\]]+)\]\([^\)]+\)/g,'$1').replace(/\s+/g,' ').trim();}
function requireEnv(env,names){const missing=names.filter(x=>!env[x]);if(missing.length)throw httpError(503,`Missing server configuration: ${missing.join(', ')}`);}
function httpError(status,message){const error=new Error(message);error.status=status;return error;}
function json(body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}});}

async function signState(payload,secret){const encoded=base64url(new TextEncoder().encode(JSON.stringify(payload)));const signature=await hmac(encoded,secret);return `${encoded}.${signature}`;}
async function verifyState(value,secret){const [encoded,signature]=value.split('.');if(!encoded||!signature||!constantTimeEqual(signature,await hmac(encoded,secret)))throw httpError(400,'Invalid OAuth state.');return JSON.parse(new TextDecoder().decode(fromBase64url(encoded)));}
async function hmac(value,secret){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return base64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))));}
async function encrypt(value,keyText){const key=await aesKey(keyText),iv=crypto.getRandomValues(new Uint8Array(12)),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value)));return `${base64url(iv)}.${base64url(cipher)}`;}
async function decrypt(value,keyText){const [iv,cipher]=value.split('.');const key=await aesKey(keyText);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64url(iv)},key,fromBase64url(cipher)));}
async function aesKey(keyText){const bytes=fromBase64url(keyText);if(bytes.byteLength!==32)throw httpError(503,'TOKEN_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
function base64url(bytes){let binary='';bytes.forEach(x=>binary+=String.fromCharCode(x));return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromBase64url(value){const normalized=value.replace(/-/g,'+').replace(/_/g,'/');const binary=atob(normalized+'='.repeat((4-normalized.length%4)%4));return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function constantTimeEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
