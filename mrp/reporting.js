const num=value=>Number(value)||0;
const dateOf=value=>String(value||'').slice(0,10);
const inPeriod=(value,from,to)=>{const date=dateOf(value);return (!from||!date||date>=from)&&(!to||!date||date<=to)};
const includesQuery=(row,query)=>!query||Object.values(row).some(value=>String(value??'').toLowerCase().includes(query));
const filterRows=(rows,filters,dateKey='date')=>rows.filter(row=>inPeriod(row[dateKey],filters.from,filters.to)&&includesQuery(row,filters.query));
const warehouseName=(state,code)=>state.warehouses?.find(item=>item.code===code)?.name||code||'—';
const skuName=(state,code)=>state.skus?.find(item=>item.code===code)?.name||'';

function overviewReport(state){
  const inventoryValue=(state.skus||[]).reduce((sum,item)=>sum+(state.warehouses||[]).reduce((qty,w)=>qty+num(state.stock?.[item.code]?.[w.code]),0)*num(item.cost),0);
  const openOrders=(state.orders||[]).filter(item=>item.productionStatus!=='COMPLETED').length;
  const openPr=(state.purchaseRequests||[]).filter(item=>!['CLOSED','REJECTED'].includes(item.status)).length;
  const openPo=(state.purchaseOrders||[]).filter(item=>!['MATCHED','CANCELLED'].includes(item.status)).length;
  const pendingQc=(state.qualityInspections||[]).filter(item=>item.result==='PENDING').length;
  const ncr=(state.qualityInspections||[]).filter(item=>item.ncrNo||item.result==='REJECTED').length;
  const production=(state.productionJobs||[]),completed=production.filter(item=>item.status==='COMPLETED').length;
  const shipped=(state.shipments||[]).filter(item=>item.status==='SHIPPED').length;
  const salesValue=(state.salesOrders||[]).reduce((sum,item)=>sum+num(item.qty)*num(item.unitPrice),0);
  const purchaseValue=(state.purchaseOrders||[]).reduce((sum,item)=>sum+num(item.qty)*num(item.unitPrice),0);
  const rows=[
    {area:'Inventory',metric:'Inventory value',value:inventoryValue,status:'LIVE'},
    {area:'Production',metric:'Open production orders',value:openOrders,status:openOrders?'ACTION':'OK'},
    {area:'Production',metric:'Completed work orders',value:completed,status:'INFO'},
    {area:'Quality',metric:'Pending inspections',value:pendingQc,status:pendingQc?'ACTION':'OK'},
    {area:'Quality',metric:'NCR / rejected inspections',value:ncr,status:ncr?'ACTION':'OK'},
    {area:'Procurement',metric:'Open purchase requests',value:openPr,status:openPr?'OPEN':'OK'},
    {area:'Procurement',metric:'Open purchase orders',value:openPo,status:openPo?'OPEN':'OK'},
    {area:'Procurement',metric:'Purchase order value',value:purchaseValue,status:'INFO'},
    {area:'Sales',metric:'Sales order value',value:salesValue,status:'INFO'},
    {area:'Shipping',metric:'Shipped consignments',value:shipped,status:'INFO'}
  ];
  return{title:'Business Management Overview',columns:['area','metric','value','status'],rows,kpis:[['Inventory value',inventoryValue],['Open orders',openOrders],['Pending QC',pendingQc],['Open PR',openPr],['Open PO',openPo],['Sales value',salesValue]]};
}

function inventoryReport(state,filters){
  const rows=[];
  for(const item of state.skus||[])for(const warehouse of state.warehouses||[]){
    if(filters.warehouse&&warehouse.code!==filters.warehouse)continue;
    const quantity=num(state.stock?.[item.code]?.[warehouse.code]);
    if(!quantity)continue;
    rows.push({warehouse:warehouse.name||warehouse.code,sku:item.code,description:item.name||'',unit:item.unit||'',quantity,unitCost:num(item.cost),value:quantity*num(item.cost),state:warehouse.code==='WH-QA'?'QUARANTINE':warehouse.code==='WH-SF'?'IN PROCESS':'ON HAND'});
  }
  const filtered=filterRows(rows,filters,'date');
  return{title:'Inventory by Warehouse',columns:['warehouse','sku','description','unit','quantity','unitCost','value','state'],rows:filtered,kpis:[['Rows',filtered.length],['Quantity',filtered.reduce((s,x)=>s+x.quantity,0)],['Inventory value',filtered.reduce((s,x)=>s+x.value,0)],['Warehouses',new Set(filtered.map(x=>x.warehouse)).size]]};
}

function movementReport(state,filters){
  let rows=(state.inventoryMovements||[]).map(item=>({date:item.at,warehouse:warehouseName(state,item.warehouse),sku:item.sku,description:skuName(state,item.sku),direction:item.direction,quantity:num(item.qty),type:item.type,reference:item.reference||'',batch:item.batchNo||'',user:item.user||'',device:item.device||''}));
  if(filters.warehouse)rows=rows.filter(item=>item.warehouse===warehouseName(state,filters.warehouse));
  rows=filterRows(rows,filters,'date');
  return{title:'Inventory Movement & Traceability',columns:['date','warehouse','sku','description','direction','quantity','type','reference','batch','user','device'],rows,kpis:[['Movements',rows.length],['Inbound',rows.filter(x=>x.direction==='IN').reduce((s,x)=>s+x.quantity,0)],['Outbound',rows.filter(x=>x.direction==='OUT').reduce((s,x)=>s+x.quantity,0)],['Tracked batches',new Set(rows.map(x=>x.batch).filter(Boolean)).size]]};
}

function productionReport(state,filters){
  const rows=filterRows((state.productionJobs||[]).map(item=>({date:item.completedAt||item.startedAt||item.createdAt||'',workOrder:item.workOrderNo||'',order:item.orderNo||'',product:item.productName||item.productCode||'',batch:item.batchNo||'',planned:num(item.plannedQty),completed:num(item.completedQty),scrap:num(item.scrapQty),yield:item.completedQty||item.scrapQty?num(item.completedQty)/(num(item.completedQty)+num(item.scrapQty))*100:0,plannedHours:num(item.plannedLeadTimeHours),actualHours:item.startedAt&&item.completedAt?(new Date(item.completedAt)-new Date(item.startedAt))/36e5:0,status:item.status||'',user:item.completedBy?.user||item.createdBy?.user||''})),filters,'date');
  const good=rows.reduce((s,x)=>s+x.completed,0),scrap=rows.reduce((s,x)=>s+x.scrap,0);
  return{title:'Production Performance & KPI',columns:['date','workOrder','order','product','batch','planned','completed','scrap','yield','plannedHours','actualHours','status','user'],rows,kpis:[['Work orders',rows.length],['Completed',rows.filter(x=>x.status==='COMPLETED').length],['Good quantity',good],['Scrap',scrap],['Yield %',good+scrap?good/(good+scrap)*100:0],['Avg actual h',rows.length?rows.reduce((s,x)=>s+x.actualHours,0)/rows.length:0]]};
}

function qualityReport(state,filters){
  const rows=filterRows((state.qualityInspections||[]).map(item=>({date:item.date||item.decidedAt||'',inspection:item.inspectionNo||'',type:item.type||'',reference:item.reference||'',sku:item.sku||'',description:skuName(state,item.sku),quantity:num(item.qty),result:item.result||'',ncr:item.ncrNo||'',disposition:item.disposition||'',released:item.released?'YES':'NO',notes:item.notes||''})),filters,'date');
  return{title:'Quality Control & NCR',columns:['date','inspection','type','reference','sku','description','quantity','result','ncr','disposition','released','notes'],rows,kpis:[['Inspections',rows.length],['Accepted',rows.filter(x=>x.result==='ACCEPTED').length],['Pending',rows.filter(x=>x.result==='PENDING').length],['Rejected',rows.filter(x=>x.result==='REJECTED').length],['NCR',rows.filter(x=>x.ncr).length]]};
}

function procurementReport(state,filters){
  const rows=filterRows((state.purchaseOrders||[]).map(item=>({date:item.dueDate||'',po:item.poNo||'',pr:item.prNo||'',supplier:item.supplierCode||'',sku:item.sku||'',description:skuName(state,item.sku),quantity:num(item.qty),unitPrice:num(item.unitPrice),total:num(item.qty)*num(item.unitPrice),due:item.dueDate||'',grn:item.grnNo||'',invoice:item.invoiceNo||'',status:item.status||''})),filters,'date');
  return{title:'Procurement, Supplier & Cost',columns:['po','pr','supplier','sku','description','quantity','unitPrice','total','due','grn','invoice','status'],rows,kpis:[['Purchase orders',rows.length],['Total value',rows.reduce((s,x)=>s+x.total,0)],['Open',rows.filter(x=>!['MATCHED','CANCELLED'].includes(x.status)).length],['Matched',rows.filter(x=>x.status==='MATCHED').length],['Suppliers',(state.suppliers||[]).filter(x=>x.approved).length]]};
}

function salesReport(state,filters){
  const rows=filterRows((state.salesOrders||[]).map(item=>{const shipment=(state.shipments||[]).find(x=>x.orderNo===item.orderNo)||{};return{date:item.date||'',order:item.orderNo||'',customer:item.customer||'',sku:item.sku||'',description:skuName(state,item.sku),quantity:num(item.qty),unitPrice:num(item.unitPrice),total:num(item.qty)*num(item.unitPrice),due:item.dueDate||'',payment:item.paymentStatus||'',invoice:shipment.invoiceNo||'',shipment:shipment.shipmentNo||'',shippingStatus:shipment.status||'',status:item.status||''}}),filters,'date');
  return{title:'Sales, Invoice & Shipping',columns:['date','order','customer','sku','description','quantity','unitPrice','total','due','payment','invoice','shipment','shippingStatus','status'],rows,kpis:[['Sales orders',rows.length],['Order value',rows.reduce((s,x)=>s+x.total,0)],['Invoiced',rows.filter(x=>x.invoice).length],['Shipped',rows.filter(x=>x.shippingStatus==='SHIPPED').length],['Open',rows.filter(x=>!['SHIPPED','CANCELLED'].includes(x.status)).length]]};
}

function receiptReport(state,filters){
  let rows=(state.receipts||[]).map(item=>({date:item.date||item.postedAt||'',reference:item.reference||'',sku:item.sku||'',description:item.description||skuName(state,item.sku),destination:warehouseName(state,item.targetWarehouse||item.warehouse),quantity:num(item.qty),supplier:item.supplier||'',qc:item.qcStatus||'',manager:item.managerStatus||'',status:item.status||'',type:item.transactionType||'',user:item.postedBy?.user||''}));
  if(filters.warehouse)rows=rows.filter(item=>item.destination===warehouseName(state,filters.warehouse));
  rows=filterRows(rows,filters,'date');
  return{title:'Goods Receipt & Posting',columns:['date','reference','sku','description','destination','quantity','supplier','qc','manager','status','type','user'],rows,kpis:[['Receipts',rows.length],['Quantity',rows.reduce((s,x)=>s+x.quantity,0)],['Posted',rows.filter(x=>x.status==='POSTED').length],['Pending',rows.filter(x=>String(x.status).startsWith('PENDING')).length]]};
}

function auditReport(state,filters){
  const rows=filterRows((state.auditTrail||[]).map(item=>({date:item.at||'',action:item.action||'',entity:item.entity||'',reference:item.reference||'',user:item.user||'',role:item.role||'',device:item.device||'',workspace:item.workspace||'',details:item.details||''})),filters,'date');
  return{title:'Audit Trail & Last Changes',columns:['date','action','entity','reference','user','role','device','workspace','details'],rows,kpis:[['Changes',rows.length],['Users',new Set(rows.map(x=>x.user).filter(Boolean)).size],['Devices',new Set(rows.map(x=>x.device).filter(Boolean)).size],['Entities',new Set(rows.map(x=>x.entity).filter(Boolean)).size]]};
}

export function buildBusinessReport(state,rawFilters={}){
  const filters={type:rawFilters.type||'overview',from:rawFilters.from||'',to:rawFilters.to||'',warehouse:rawFilters.warehouse||'',query:String(rawFilters.query||'').trim().toLowerCase()};
  const builders={overview:overviewReport,inventory:inventoryReport,movements:movementReport,production:productionReport,quality:qualityReport,procurement:procurementReport,sales:salesReport,receipts:receiptReport,audit:auditReport};
  return(builders[filters.type]||overviewReport)(state,filters);
}
