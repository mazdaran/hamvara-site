// All visible content uses textContent; no visitor or model HTML is interpreted.
export function renderMessages(container,messages,copy){
 const previous=container.dataset.last||'',last=String(messages.at(-1)?.seq||'');if(previous===last)return;
 const nearBottom=container.scrollHeight-container.scrollTop-container.clientHeight<100;
 container.replaceChildren();for(const m of messages){const el=document.createElement('div');el.className='message '+m.role;const who=document.createElement('strong');who.textContent=copy[m.role]||copy.operator;const time=document.createElement('time');time.dateTime=new Date(m.at).toISOString();time.textContent=new Date(m.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});const p=document.createElement('p');p.textContent=m.text;el.append(who,time,p);
 for(const s of m.sources||[]){let u;try{u=new URL(s.url);}catch{continue;}if(u.origin!=='https://hamvara.com'||!u.pathname.startsWith('/guides/'))continue;const a=document.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=copy.source+': '+s.title;el.append(a);}container.append(el);}
 container.dataset.last=last;if(nearBottom||!previous)container.scrollTop=container.scrollHeight;
}
export async function request(path,{api,token,method='GET',body}={}){const response=await fetch(api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(24000),cache:'no-store'});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'unavailable'),{status:response.status});return result;}
