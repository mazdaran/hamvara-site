const PRIORITY_RANK={VERY_URGENT:0,URGENT:1,NORMAL:2};

function higherPriority(a='NORMAL',b='NORMAL'){
  return (PRIORITY_RANK[a]??PRIORITY_RANK.NORMAL)<=(PRIORITY_RANK[b]??PRIORITY_RANK.NORMAL)?a:b;
}

export function buildPurchaseSuggestions(requirementDetails=[],purchaseRequests=[]){
  const grouped=new Map();
  for(const row of requirementDetails){
    const shortage=Number(row.shortage)||0;
    if(row.status!=='SHORTAGE'||shortage<=0||!row.sku)continue;
    const warehouse=row.warehouse||'';
    const key=`${row.sku}|${warehouse}`;
    const item=grouped.get(key)||{key,sku:row.sku,name:row.name||'',warehouse,shortage:0,orders:[],priority:'NORMAL',needDate:''};
    item.shortage+=shortage;
    if(row.orderNo&&!item.orders.includes(row.orderNo))item.orders.push(row.orderNo);
    item.priority=higherPriority(item.priority,row.priority||'NORMAL');
    if(row.needDate&&(!item.needDate||row.needDate<item.needDate))item.needDate=row.needDate;
    grouped.set(key,item);
  }
  const openByKey=new Map();
  for(const pr of purchaseRequests){
    if(pr.source!=='MRP'||!pr.mrpSuggestionKey||['CLOSED','REJECTED'].includes(pr.status))continue;
    openByKey.set(pr.mrpSuggestionKey,(openByKey.get(pr.mrpSuggestionKey)||0)+(Number(pr.qty)||0));
  }
  return [...grouped.values()].map(item=>{
    const openPrQty=openByKey.get(item.key)||0;
    return {...item,openPrQty,suggestedQty:Math.max(0,item.shortage-openPrQty)};
  }).filter(item=>item.suggestedQty>0);
}

export function createPurchaseRequestFromSuggestion(suggestion,fields={}){
  if(!suggestion||!(Number(suggestion.suggestedQty)>0))throw new Error('No uncovered MRP shortage.');
  return {
    id:fields.id,
    prNo:fields.prNo,
    date:fields.date,
    requester:fields.requester||'MRP',
    sku:suggestion.sku,
    qty:suggestion.suggestedQty,
    needDate:suggestion.needDate||'',
    priority:suggestion.priority||'NORMAL',
    budgetStatus:'PENDING',
    status:'DRAFT',
    source:'MRP',
    mrpSuggestionKey:suggestion.key,
    sourceOrders:[...suggestion.orders]
  };
}
