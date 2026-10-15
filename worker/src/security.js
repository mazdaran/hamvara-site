// Exact-origin and hostname validation for OAuth and Google site discovery.
export function hasProductionOrigin(origins) {
  return Array.isArray(origins) && origins.some(origin => origin === 'https://www.hamvara.com');
}
function isHamvaraHostname(hostname) {
  return hostname === 'hamvara.com' || hostname.endsWith('.hamvara.com');
}
export function isHamvaraSearchConsoleProperty(property) {
  if(typeof property!=='string')return false;
  if(property.startsWith('sc-domain:')){
    return isHamvaraHostname(property.slice('sc-domain:'.length).toLowerCase());
  }
  try{
    const url=new URL(property);
    return (url.protocol==='https:' || url.protocol==='http:') && isHamvaraHostname(url.hostname);
  }catch{return false;}
}
