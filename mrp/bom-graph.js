const text=value=>String(value??'').trim();
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const heapPush=(heap,value)=>{heap.push(value);let index=heap.length-1;while(index){const parent=(index-1)>>1;if(heap[parent]<=value)break;heap[index]=heap[parent];index=parent}heap[index]=value};
const heapPop=heap=>{const first=heap[0],last=heap.pop();if(heap.length){let index=0;while(true){const left=index*2+1,right=left+1;if(left>=heap.length)break;const child=right<heap.length&&heap[right]<heap[left]?right:left;if(heap[child]>=last)break;heap[index]=heap[child];index=child}heap[index]=last}return first};

function activeRevision(state,productCode,onDate){
  const profile=state.bomProfiles?.[productCode];
  const history=state.bomHistory?.[productCode]||[];
  if(profile?.version){
    const selected=history.find(item=>item.version===profile.version&&(!item.effectiveDate||item.effectiveDate<=onDate));
    if(selected)return selected;
  }
  return history.filter(item=>!item.effectiveDate||item.effectiveDate<=onDate).sort((a,b)=>String(b.effectiveDate||'').localeCompare(String(a.effectiveDate||''))||String(b.savedAt||'').localeCompare(String(a.savedAt||'')))[0]||null;
}

export function bomLinesForProduct(state,productCode,{onDate=new Date().toISOString().slice(0,10)}={}){
  const revision=activeRevision(state,productCode,onDate);
  return(revision?.materials||state.boms?.[productCode]||[]).filter(line=>text(line.sku)&&number(line.qty||line.usageQty)>0);
}

function productMaps(state){
  const byCode=new Map(),byItem=new Map();
  for(const product of state.products||[]){
    const code=text(product.code),item=text(product.outputSku)||code;
    if(!code)continue;
    byCode.set(code,product);
    byItem.set(code,product);
    byItem.set(item,product);
  }
  return{byCode,byItem};
}

function cyclePath(nodes,outgoing){
  const state=new Map(),path=[];
  const visit=node=>{
    state.set(node,1);path.push(node);
    for(const edge of outgoing.get(node)||[]){
      const child=edge.childItem;
      if(state.get(child)===1){const start=path.indexOf(child);return[...path.slice(start),child]}
      if(!state.get(child)){const found=visit(child);if(found)return found}
    }
    path.pop();state.set(node,2);return null;
  };
  for(const node of nodes)if(!state.get(node)){const found=visit(node);if(found)return found}
  return[];
}

export function buildBomGraph(state,{onDate=new Date().toISOString().slice(0,10)}={}){
  const {byCode,byItem}=productMaps(state),nodes=new Set(),outgoing=new Map(),whereUsed=new Map(),indegree=new Map(),edges=[];
  const addNode=item=>{if(!nodes.has(item)){nodes.add(item);indegree.set(item,0)}};
  for(const product of byCode.values()){
    const parentItem=text(product.outputSku)||text(product.code);addNode(parentItem);
    for(const line of bomLinesForProduct(state,product.code,{onDate})){
      const childItem=text(line.sku),childProduct=byItem.get(childItem)||null;addNode(childItem);
      const edge={parentItem,parentProductCode:product.code,childItem,childProductCode:childProduct?.code||null,quantity:number(line.qty||line.usageQty),wastePercent:Math.max(0,number(line.wastePercent)),warehouse:text(line.warehouse)||'WH-RM',phantom:Boolean(line.phantom||childProduct?.phantom)};
      edges.push(edge);
      if(!outgoing.has(parentItem))outgoing.set(parentItem,[]);outgoing.get(parentItem).push(edge);
      if(!whereUsed.has(childItem))whereUsed.set(childItem,[]);whereUsed.get(childItem).push(edge);
      indegree.set(childItem,(indegree.get(childItem)||0)+1);
    }
  }
  const queue=[],topological=[],remaining=new Map(indegree);for(const node of nodes)if(!indegree.get(node))heapPush(queue,node);
  while(queue.length){const node=heapPop(queue);topological.push(node);for(const edge of outgoing.get(node)||[]){const next=remaining.get(edge.childItem)-1;remaining.set(edge.childItem,next);if(next===0)heapPush(queue,edge.childItem)}}
  if(topological.length!==nodes.size){const path=cyclePath(nodes,outgoing);throw new Error(`Circular BOM detected: ${path.join(' → ')||'unresolved cycle'}.`)}
  const lowLevelCode=new Map([...nodes].map(node=>[node,0]));
  for(const parent of topological)for(const edge of outgoing.get(parent)||[])lowLevelCode.set(edge.childItem,Math.max(lowLevelCode.get(edge.childItem)||0,(lowLevelCode.get(parent)||0)+1));
  const levels=new Map();for(const [item,level] of lowLevelCode){if(!levels.has(level))levels.set(level,[]);levels.get(level).push(item)}for(const items of levels.values())items.sort();
  const graph={onDate,nodes:[...nodes].sort(),edges,topological,lowLevelCode,levels,outgoing,whereUsed,productByItem:byItem};
  return graph;
}

export function affectedItems(graph,changedItems){
  const affected=new Set([...changedItems].map(text).filter(Boolean)),queue=[...affected];
  while(queue.length){const child=queue.shift();for(const edge of graph.whereUsed.get(child)||[])if(!affected.has(edge.parentItem)){affected.add(edge.parentItem);queue.push(edge.parentItem)}}
  return[...affected].sort((a,b)=>(graph.lowLevelCode.get(b)||0)-(graph.lowLevelCode.get(a)||0)||a.localeCompare(b));
}
