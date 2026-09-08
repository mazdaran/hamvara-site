function clone(value){return JSON.parse(JSON.stringify(value))}

export function ensureBomProfile(state,productCode){
  state.bomProfiles??={};state.bomHistory??={};
  const profile=state.bomProfiles[productCode]??={version:'1.0',effectiveDate:new Date().toISOString().slice(0,10),model:'',design:'',packageType:'',variables:[]};
  profile.version=String(profile.version||'1.0');profile.variables=Array.isArray(profile.variables)?profile.variables.slice(0,20):[];
  state.bomProfiles[productCode]=profile;state.bomHistory[productCode]??=[];return profile;
}

export function addBomVariable(state,productCode){
  const profile=ensureBomProfile(state,productCode);if(profile.variables.length>=20)throw new Error('A BOM can contain at most 20 process variables.');
  profile.variables.push({name:'',value:'',unit:'',category:'PROCESS',required:true});return profile.variables.at(-1);
}

export function saveBomRevision(state,productCode,{user='unknown',device='unknown',at=new Date().toISOString()}={}){
  const profile=ensureBomProfile(state,productCode),materials=state.boms?.[productCode]||[];
  if(!materials.length)throw new Error('At least one material row is required.');
  if(profile.variables.length>20)throw new Error('A BOM can contain at most 20 process variables.');
  const snapshot={id:`${productCode}@${profile.version}@${at}`,productCode,version:profile.version,effectiveDate:profile.effectiveDate,model:profile.model||'',design:profile.design||'',packageType:profile.packageType||'',variables:clone(profile.variables),materials:clone(materials),savedAt:at,savedBy:user,device};
  const history=state.bomHistory[productCode];const existing=history.findIndex(item=>item.version===snapshot.version);
  if(existing>=0)history.splice(existing,1,snapshot);else history.unshift(snapshot);
  return snapshot;
}

export function bomSnapshot(state,productCode){
  const profile=ensureBomProfile(state,productCode);return{version:profile.version,effectiveDate:profile.effectiveDate,model:profile.model||'',design:profile.design||'',packageType:profile.packageType||'',variables:clone(profile.variables)};
}
