const num=value=>Number(value)||0;
const day=value=>String(value||'').slice(0,10);
const inPeriod=(value,from,to)=>{const date=day(value);if(!date)return !from&&!to;return (!from||date>=from)&&(!to||date<=to)};
const stockValue=(state)=>Object.entries(state.stock||{}).reduce((total,[code,balances])=>{
  const cost=num((state.skus||[]).find(item=>item.code===code)?.cost);
  return total+Object.entries(balances||{}).filter(([warehouse])=>warehouse!=='reserved').reduce((sum,[,quantity])=>sum+num(quantity)*cost,0);
},0);

export function serviceLevelKpis(state,{from='',to=''}={}){
  const orders=(state.salesOrders||[]).filter(order=>order.status!=='CANCELLED'&&inPeriod(order.dueDate||order.date,from,to));
  const skuCosts=new Map((state.skus||[]).map(item=>[item.code,num(item.cost)]));
  const rows=orders.map(order=>{
    const shipments=(state.shipments||[]).filter(item=>item.orderNo===order.orderNo&&item.status==='SHIPPED');
    const shippedQty=shipments.reduce((sum,item)=>sum+num(item.pickQty),0);
    const shippedDates=shipments.map(item=>day(item.shippedAt||item.date)).filter(Boolean).sort();
    const orderedQty=num(order.qty),fulfilledQty=Math.min(orderedQty,shippedQty),complete=orderedQty>0&&shippedQty>=orderedQty;
    const shippedDate=complete?shippedDates.at(-1)||'':'';
    const onTime=complete&&!!order.dueDate&&!!shippedDate&&shippedDate<=day(order.dueDate);
    return{order:order.orderNo||'',customer:order.customer||'',sku:order.sku||'',due:day(order.dueDate),orderedQty,shippedQty,fillRate:orderedQty?fulfilledQty/orderedQty*100:0,shippedDate,deliveryStatus:onTime?'OTIF':complete?'LATE':'OPEN'};
  });
  const orderedQty=rows.reduce((sum,row)=>sum+row.orderedQty,0),fulfilledQty=rows.reduce((sum,row)=>sum+Math.min(row.orderedQty,row.shippedQty),0);
  const asOf=to||new Date().toISOString().slice(0,10),eligible=rows.filter(row=>row.orderedQty>0&&row.due&&row.due<=asOf),otifOrders=eligible.filter(row=>row.deliveryStatus==='OTIF').length;
  const periodShipments=(state.shipments||[]).filter(item=>item.status==='SHIPPED'&&inPeriod(item.shippedAt||item.date,from,to));
  const cogs=periodShipments.reduce((sum,shipment)=>{const order=(state.salesOrders||[]).find(item=>item.orderNo===shipment.orderNo);return sum+num(shipment.pickQty)*num(skuCosts.get(order?.sku))},0);
  const endingInventoryValue=stockValue(state);
  const netMovementValue=(state.inventoryMovements||[]).filter(item=>inPeriod(item.at,from,to)).reduce((sum,item)=>sum+(item.direction==='IN'?1:-1)*num(item.qty)*num(skuCosts.get(item.sku)),0);
  const openingInventoryValue=Math.max(0,endingInventoryValue-netMovementValue),averageInventoryValue=(openingInventoryValue+endingInventoryValue)/2;
  const inventoryTurnover=averageInventoryValue?cogs/averageInventoryValue:0;
  return{rows,orderedQty,shippedQty:fulfilledQty,fillRate:orderedQty?fulfilledQty/orderedQty*100:0,eligibleOrders:eligible.length,otifOrders,otifRate:eligible.length?otifOrders/eligible.length*100:0,cogs,openingInventoryValue,endingInventoryValue,averageInventoryValue,inventoryTurnover,daysInventory:inventoryTurnover?365/inventoryTurnover:0};
}
