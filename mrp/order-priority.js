const PRIORITY_RANK={VERY_URGENT:0,URGENT:1,NORMAL:2};

export function sortOrdersForAllocation(orders=[]){
  return orders
    .map((order,index)=>({order,index}))
    .sort((a,b)=>{
      const priority=(PRIORITY_RANK[a.order.priority]??PRIORITY_RANK.NORMAL)-(PRIORITY_RANK[b.order.priority]??PRIORITY_RANK.NORMAL);
      if(priority)return priority;
      const aDue=a.order.due||'9999-12-31',bDue=b.order.due||'9999-12-31';
      if(aDue!==bDue)return aDue.localeCompare(bDue);
      const aDate=a.order.date||'9999-12-31',bDate=b.order.date||'9999-12-31';
      if(aDate!==bDate)return aDate.localeCompare(bDate);
      return a.index-b.index;
    })
    .map(({order})=>order);
}
