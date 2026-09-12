import {getBomGraph} from './bom-graph-registry.js';

const text=value=>String(value??'').trim();
export function netChangeScope(state,dirty,{onDate,previousSnapshot}={}){
  const graph=getBomGraph(state,{onDate}),productByCode=new Map((state.products||[]).map(product=>[text(product.code),product])),seeds=new Set(dirty.dirtyItems||[]);
  for(const code of dirty.dirtyProducts||[]){const product=productByCode.get(code);seeds.add(text(product?.outputSku)||code)}
  const directOrders=new Set(dirty.dirtyOrders||[]);
  for(const orderNo of directOrders){const current=(state.orders||[]).find(order=>text(order.orderNo)===orderNo),productCode=text(current?.productCode)||text(previousSnapshot?.demandMeta?.[orderNo]?.productCode),product=productByCode.get(productCode);if(productCode)seeds.add(text(product?.outputSku)||productCode)}
  const connected=new Set([...seeds].filter(Boolean)),queue=[...connected];
  while(queue.length){const item=queue.shift(),neighbors=[...(graph.outgoing.get(item)||[]).map(edge=>edge.childItem),...(graph.whereUsed.get(item)||[]).map(edge=>edge.parentItem)];for(const next of neighbors)if(!connected.has(next)){connected.add(next);queue.push(next)}}
  const impactedItems=[...connected].sort((a,b)=>(graph.lowLevelCode.get(a)||0)-(graph.lowLevelCode.get(b)||0)||a.localeCompare(b)),impactedSet=new Set(impactedItems),impactedOrders=[];
  for(const order of state.orders||[]){const product=productByCode.get(text(order.productCode)),root=text(product?.outputSku)||text(order.productCode);if(directOrders.has(text(order.orderNo))||impactedSet.has(root)||dirty.forecastChanged)impactedOrders.push(text(order.orderNo))}
  return{seedItems:[...seeds].filter(Boolean).sort(),impactedItems,impactedOrders:[...new Set(impactedOrders)].filter(Boolean).sort(),removedOrders:[...directOrders].filter(orderNo=>!(state.orders||[]).some(order=>text(order.orderNo)===orderNo)).sort(),requiresFullFallback:dirty.contextChanged||dirty.forecastChanged||dirty.dirtyProducts?.length>0};
}
