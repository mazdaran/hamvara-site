function clone(value){return JSON.parse(JSON.stringify(value))}
function number(value){const result=Number(value);return Number.isFinite(result)?result:0}

export function ensureBomProfile(state,productCode){
  state.bomProfiles??={};state.bomHistory??={};
  const profile=state.bomProfiles[productCode]??={version:'1.0',effectiveDate:new Date().toISOString().slice(0,10),model:'',design:'',packageType:'',variables:[],laborCost:0,overheadCost:0,otherCost:0};
  profile.version=String(profile.version||'1.0');profile.variables=Array.isArray(profile.variables)?profile.variables.slice(0,20):[];
  for(const field of ['laborCost','overheadCost','otherCost'])profile[field]=number(profile[field]);
  state.bomProfiles[productCode]=profile;state.bomHistory[productCode]??=[];return profile;
}

export function addBomVariable(state,productCode){
  const profile=ensureBomProfile(state,productCode);if(profile.variables.length>=20)throw new Error('A BOM can contain at most 20 process variables.');
  profile.variables.push({name:'',value:'',unit:'',category:'PROCESS',required:true});return profile.variables.at(-1);
}

export function calculateBomCost(state,productCode,{materials=state.boms?.[productCode]||[],profile=ensureBomProfile(state,productCode),quantity=1}={}){
  const lines=materials.map(line=>{
    const item=(state.skus||[]).find(candidate=>candidate.code===line.sku),usageQty=number(line.qty),wastePercent=Math.max(0,number(line.wastePercent)),grossQty=usageQty*(1+wastePercent/100),unitCost=Math.max(0,number(line.unitCost??item?.cost)),lineCost=grossQty*unitCost;
    return{...clone(line),name:item?.name||line.name||'',unit:item?.unit||line.unit||'',type:item?.type||line.type||'',usageQty,wastePercent,grossQty,unitCost,lineCost};
  });
  const packagingCost=lines.filter(line=>line.type==='PACKAGING').reduce((sum,line)=>sum+line.lineCost,0),materialCost=lines.filter(line=>line.type!=='PACKAGING').reduce((sum,line)=>sum+line.lineCost,0),laborCost=Math.max(0,number(profile.laborCost)),overheadCost=Math.max(0,number(profile.overheadCost)),otherCost=Math.max(0,number(profile.otherCost)),unitCost=materialCost+packagingCost+laborCost+overheadCost+otherCost,productionQty=Math.max(0,number(quantity));
  return{lines,materialCost,packagingCost,laborCost,overheadCost,otherCost,unitCost,quantity:productionQty,totalCost:unitCost*productionQty};
}

export function validateBomRevision(state,productCode,{allowExistingVersion=false}={}){
  const profile=ensureBomProfile(state,productCode),materials=state.boms?.[productCode]||[],errors=[],warehouses=new Set((state.warehouses||[]).map(item=>item.code)),keys=new Set();
  if(!(state.products||[]).some(item=>item.code===productCode))errors.push('Product not found.');
  if(!String(profile.version||'').trim())errors.push('BOM version is required.');
  if(!profile.effectiveDate)errors.push('BOM effective date is required.');
  if(!materials.length)errors.push('At least one material row is required.');
  if(profile.variables.length>20)errors.push('A BOM can contain at most 20 process variables.');
  if(profile.variables.some(variable=>!String(variable.name||'').trim()))errors.push('Every process variable needs a name.');
  for(const field of ['laborCost','overheadCost','otherCost'])if(number(profile[field])<0)errors.push(`${field} must be zero or positive.`);
  materials.forEach((line,index)=>{
    const row=index+1,key=`${line.sku}|${line.warehouse}`;
    if(!(state.skus||[]).some(item=>item.code===line.sku))errors.push(`BOM row ${row}: valid SKU required.`);
    if(!warehouses.has(line.warehouse))errors.push(`BOM row ${row}: valid source warehouse required.`);
    if(!(Number(line.qty)>0))errors.push(`BOM row ${row}: usage quantity must be greater than zero.`);
    if(number(line.wastePercent)<0)errors.push(`BOM row ${row}: waste percent must be zero or positive.`);
    if(keys.has(key))errors.push(`BOM row ${row}: duplicate SKU and warehouse.`);keys.add(key);
  });
  if(!allowExistingVersion&&(state.bomHistory?.[productCode]||[]).some(item=>item.version===profile.version))errors.push(`BOM version ${profile.version} already exists. Enter a new version.`);
  return errors;
}

export function saveBomRevision(state,productCode,{user='unknown',device='unknown',at=new Date().toISOString()}={}){
  const profile=ensureBomProfile(state,productCode),errors=validateBomRevision(state,productCode);if(errors.length)throw new Error(errors.join(' '));
  const cost=calculateBomCost(state,productCode,{profile}),materials=cost.lines.map(line=>({sku:line.sku,name:line.name,warehouse:line.warehouse,qty:line.usageQty,wastePercent:line.wastePercent,unit:line.unit,type:line.type,unitCost:line.unitCost,grossQty:line.grossQty,lineCost:line.lineCost}));
  const snapshot={id:`${productCode}@${profile.version}@${at}`,productCode,version:profile.version,effectiveDate:profile.effectiveDate,model:profile.model||'',design:profile.design||'',packageType:profile.packageType||'',laborCost:cost.laborCost,overheadCost:cost.overheadCost,otherCost:cost.otherCost,materialCost:cost.materialCost,packagingCost:cost.packagingCost,standardUnitCost:cost.unitCost,variables:clone(profile.variables),materials,savedAt:at,savedBy:user,device};
  state.bomHistory[productCode].unshift(snapshot);return snapshot;
}

export function bomSnapshot(state,productCode,onDate=new Date().toISOString().slice(0,10)){
  const profile=ensureBomProfile(state,productCode),revision=(state.bomHistory?.[productCode]||[]).find(item=>item.version===profile.version);
  if(!revision)throw new Error(`Save BOM version ${profile.version} before creating a work order.`);
  if(revision.effectiveDate&&revision.effectiveDate>onDate)throw new Error(`BOM version ${profile.version} is not effective until ${revision.effectiveDate}.`);
  return clone(revision);
}

export function activateBomRevision(state,productCode,version){
  const revision=(state.bomHistory?.[productCode]||[]).find(item=>item.version===version);if(!revision)throw new Error(`BOM version ${version} not found.`);
  const profile=ensureBomProfile(state,productCode);Object.assign(profile,{version:revision.version,effectiveDate:revision.effectiveDate||'',model:revision.model||'',design:revision.design||'',packageType:revision.packageType||'',laborCost:number(revision.laborCost),overheadCost:number(revision.overheadCost),otherCost:number(revision.otherCost),variables:clone(revision.variables||[])});
  state.boms[productCode]=clone(revision.materials||[]).map(line=>({sku:line.sku,name:line.name||'',warehouse:line.warehouse,qty:number(line.qty||line.usageQty),wastePercent:number(line.wastePercent)}));return revision;
}
