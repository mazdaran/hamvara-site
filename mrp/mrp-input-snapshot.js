const text=value=>String(value??'').trim();
const sortRows=(rows,key)=>[...(rows||[])].sort((a,b)=>text(a?.[key]).localeCompare(text(b?.[key])));

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value??null;
}
export function stableFingerprint(value){
  const normalized=Array.isArray(value)&&value.every(row=>Array.isArray(row))?value:canonical(value),bytes=new TextEncoder().encode(JSON.stringify(normalized)),words=[],bitLength=bytes.length*8;
  for(let index=0;index<bytes.length;index++)words[index>>2]|=bytes[index]<<(24-(index%4)*8);
  words[bitLength>>5]|=0x80<<(24-bitLength%32);words[((bitLength+64>>9)<<4)+15]=bitLength;
  const constants=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2],rotate=(value,bits)=>(value>>>bits)|(value<<(32-bits)),schedule=new Uint32Array(64),hash=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  for(let offset=0;offset<words.length;offset+=16){for(let index=0;index<16;index++)schedule[index]=words[offset+index]||0;for(let index=16;index<64;index++){const a=schedule[index-15],b=schedule[index-2],s0=rotate(a,7)^rotate(a,18)^(a>>>3),s1=rotate(b,17)^rotate(b,19)^(b>>>10);schedule[index]=(schedule[index-16]+s0+schedule[index-7]+s1)>>>0}let[a,b,c,d,e,f,g,h]=hash;for(let index=0;index<64;index++){const s1=rotate(e,6)^rotate(e,11)^rotate(e,25),choice=(e&f)^(~e&g),t1=(h+s1+choice+constants[index]+schedule[index])>>>0,s0=rotate(a,2)^rotate(a,13)^rotate(a,22),majority=(a&b)^(a&c)^(b&c),t2=(s0+majority)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0}hash[0]=(hash[0]+a)>>>0;hash[1]=(hash[1]+b)>>>0;hash[2]=(hash[2]+c)>>>0;hash[3]=(hash[3]+d)>>>0;hash[4]=(hash[4]+e)>>>0;hash[5]=(hash[5]+f)>>>0;hash[6]=(hash[6]+g)>>>0;hash[7]=(hash[7]+h)>>>0}
  return[...hash].map(value=>value.toString(16).padStart(8,'0')).join('');
}
function mapFingerprints(rows,key,select){return Object.fromEntries(sortRows(rows,key).filter(row=>text(row?.[key])).map(row=>[text(row[key]),stableFingerprint(select(row))]))}

export function captureMrpInputSnapshot(state,{asOf,horizonDays,cutoff}={}){
  const orders=(state.orders||[]).filter(row=>!['COMPLETED','CANCELLED'].includes(text(row.status||row.productionStatus).toUpperCase()));
  const products=mapFingerprints(state.products,'code',row=>({code:row.code,outputSku:row.outputSku,phantom:row.phantom,productionStrategy:row.productionStrategy,mtsTarget:row.mtsTarget,productionLeadTimeDays:row.productionLeadTimeDays,productionLeadTimeHours:row.productionLeadTimeHours,routingHours:row.routingHours,bom:state.boms?.[row.code]||[],profile:state.bomProfiles?.[row.code]||{},history:state.bomHistory?.[row.code]||[]}));
  const itemMaster=new Map((state.skus||[]).map(row=>[text(row.code),row])),itemCodes=new Set([...itemMaster.keys(),...Object.keys(state.stock||{}),...(state.purchaseOrders||[]).map(row=>text(row.sku)),...(state.plannedSupplyOrders||[]).map(row=>text(row.sku))]);
  for(const lines of Object.values(state.boms||{}))for(const line of lines||[])itemCodes.add(text(line.sku));
  const items=Object.fromEntries([...itemCodes].filter(Boolean).sort().map(code=>{const row=itemMaster.get(code)||{};return[code,stableFingerprint({code,leadTime:row.leadTime,safetyStock:row.safetyStock,minimumOrderQty:row.minimumOrderQty,orderMultiple:row.orderMultiple,stock:state.stock?.[code]||{},purchaseOrders:(state.purchaseOrders||[]).filter(item=>item.sku===code),plannedSupplyOrders:(state.plannedSupplyOrders||[]).filter(item=>item.sku===code)})]}));
  const demand=mapFingerprints(orders,'orderNo',row=>({orderNo:row.orderNo,productCode:row.productCode,qty:row.qty,due:row.due,priority:row.priority,status:row.status||row.productionStatus}));
  const demandMeta=Object.fromEntries(orders.filter(row=>text(row.orderNo)).map(row=>[text(row.orderNo),{productCode:text(row.productCode),due:text(row.due)}]));
  const snapshot={schemaVersion:2,context:{asOf,horizonDays,cutoff,capacityCalendar:state.capacityCalendar||{}},products,items,demand,demandMeta,forecasts:stableFingerprint(state.demandForecasts||[])};
  return{...snapshot,fingerprint:stableFingerprint(snapshot)};
}
function changedKeys(before={},after={}){const keys=new Set([...Object.keys(before),...Object.keys(after)]);return[...keys].filter(key=>before[key]!==after[key]).sort()}
export function compareMrpInputSnapshots(previous,current){
  if(!previous)return{changed:true,compatible:false,contextChanged:true,dirtyProducts:Object.keys(current.products),dirtyItems:Object.keys(current.items),dirtyOrders:Object.keys(current.demand),forecastChanged:true,reasons:['NO_COMPATIBLE_BASELINE']};
  const contextChanged=stableFingerprint(previous.context)!==stableFingerprint(current.context),dirtyProducts=changedKeys(previous.products,current.products),dirtyItems=changedKeys(previous.items,current.items),dirtyOrders=changedKeys(previous.demand,current.demand),forecastChanged=previous.forecasts!==current.forecasts;
  const reasons=[];if(contextChanged)reasons.push('PLANNING_CONTEXT');if(dirtyProducts.length)reasons.push('PRODUCT_OR_BOM');if(dirtyItems.length)reasons.push('ITEM_STOCK_OR_SUPPLY');if(dirtyOrders.length)reasons.push('DEMAND');if(forecastChanged)reasons.push('FORECAST');
  return{changed:reasons.length>0,compatible:previous.schemaVersion===current.schemaVersion,contextChanged,dirtyProducts,dirtyItems,dirtyOrders,forecastChanged,reasons};
}
