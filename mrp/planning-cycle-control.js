import {appendAudit} from './audit-workflow.js';

const text=value=>String(value??'').trim();
const date=value=>text(value).slice(0,10);
const addDays=(value,days)=>new Date(new Date(`${value}T12:00:00Z`).getTime()+days*86400000).toISOString().slice(0,10);
const definitions=[
  {code:'SOP',name:'Executive S&OP',offset:0,ownerRole:'demand-planner',dependsOn:[]},
  {code:'MPS',name:'MPS freeze',offset:2,ownerRole:'master-planner',dependsOn:['SOP']},
  {code:'MRP',name:'Governed MRP release',offset:3,ownerRole:'material-planner',dependsOn:['MPS']},
  {code:'SCHEDULE',name:'Finite schedule release',offset:4,ownerRole:'scheduler',dependsOn:['MRP']},
  {code:'SUPPLIER',name:'Supplier commitment review',offset:5,ownerRole:'buyer',dependsOn:['MRP']},
  {code:'EXCEPTION',name:'MRP exception synchronization',offset:5,ownerRole:'material-planner',dependsOn:['MRP']}
];
const audit=(state,action,cycle,meta,details='')=>appendAudit(state,{...meta,action,entity:'PLANNING_CYCLE',reference:cycle.cycleNo,details});

export function normalizePlanningCycleControl(state){state.planningCycles??=[];for(const cycle of state.planningCycles)cycle.gates??=[];return state}
function findCycle(state,id){normalizePlanningCycleControl(state);const cycle=state.planningCycles.find(item=>item.id===id);if(!cycle)throw new Error('Planning cycle not found.');return cycle}

export function createPlanningCycle(state,{startDate,coordinator,reviewer}={},meta={}){
  normalizePlanningCycleControl(state);const start=date(startDate),owner=text(coordinator),control=text(reviewer);if(!start||!owner||!control)throw new Error('Cycle start, coordinator and independent reviewer are required.');if(owner.toLowerCase()===control.toLowerCase())throw new Error('Planning-cycle reviewer must be independent from the coordinator.');if(state.planningCycles.some(item=>item.startDate===start&&!['CANCELLED','CLOSED'].includes(item.status)))throw new Error('An active planning cycle already exists for this start date.');const at=meta.at||new Date().toISOString(),cycle={id:`PC-${Date.now()}-${state.planningCycles.length+1}`,cycleNo:`PC-${String(state.planningCycles.length+1).padStart(5,'0')}`,startDate:start,endDate:addDays(start,5),coordinator:owner,reviewer:control,status:'OPEN',createdAt:at,gates:definitions.map(item=>({...item,owner:item.ownerRole,dueDate:addDays(start,item.offset),status:'PENDING',evidenceReference:'',evidenceNote:'',completedBy:'',completedAt:'',reviewedBy:''}))};state.planningCycles.unshift(cycle);audit(state,'PLANNING_CYCLE_CREATED',cycle,meta,`${start} → ${cycle.endDate}`);return cycle
}

function evidenceExists(state,code,reference){const ref=text(reference);if(code==='SOP')return(state.sopPlans||[]).some(item=>(item.planNo===ref||item.id===ref)&&item.status==='APPROVED');if(code==='MPS')return(state.mpsSnapshots||[]).some(item=>(item.versionNo===ref||item.id===ref)&&item.status==='FROZEN');if(code==='MRP')return(state.mrpRuns||[]).some(item=>(item.runNo===ref||item.id===ref)&&item.status==='RELEASED');if(code==='SCHEDULE')return(state.productionSchedules||[]).some(item=>(item.scheduleNo===ref||item.id===ref)&&item.status==='RELEASED');if(code==='SUPPLIER')return(state.supplierSchedules||[]).some(item=>(item.scheduleNo===ref||item.id===ref)&&['CONFIRMED','RESCHEDULE_PENDING'].includes(item.status))||(ref==='N/A'&&!(state.purchaseOrders||[]).some(item=>item.status==='APPROVED'));if(code==='EXCEPTION')return Boolean(state.mrpExceptionLastSyncAt)&&(!ref||ref===state.mrpExceptionLastSyncAt);return false}

export function completePlanningGate(state,cycleId,gateCode,{owner,reviewedBy,evidenceReference,evidenceNote,at=new Date().toISOString()}={},meta={}){
  const cycle=findCycle(state,cycleId),gate=cycle.gates.find(item=>item.code===gateCode);if(!gate)throw new Error('Planning gate not found.');if(gate.status==='COMPLETED')throw new Error('Planning gate is already completed.');const responsible=text(owner),reviewer=text(reviewedBy),reference=text(evidenceReference),note=text(evidenceNote);if(!responsible||!reviewer||note.length<10)throw new Error('Owner, independent reviewer and evidence note of at least 10 characters are required.');if(responsible.toLowerCase()===reviewer.toLowerCase())throw new Error('Gate reviewer must be independent from the owner.');const incomplete=gate.dependsOn.filter(code=>cycle.gates.find(item=>item.code===code)?.status!=='COMPLETED');if(incomplete.length)throw new Error(`Complete prerequisite gate(s): ${incomplete.join(', ')}.`);if(!evidenceExists(state,gate.code,reference))throw new Error(`Valid released evidence is required for ${gate.code}.`);Object.assign(gate,{status:'COMPLETED',owner:responsible,reviewedBy:reviewer,evidenceReference:reference||state.mrpExceptionLastSyncAt,evidenceNote:note,completedBy:responsible,completedAt:at});if(cycle.gates.every(item=>item.status==='COMPLETED')){cycle.status='CLOSED';cycle.closedAt=at}audit(state,'PLANNING_GATE_COMPLETED',cycle,{...meta,user:responsible},`${gate.code}; ${gate.evidenceReference}; reviewed by ${reviewer}`);return gate
}

export function planningCycleSummary(state,{asOf=new Date().toISOString().slice(0,10)}={}){normalizePlanningCycleControl(state);const rows=state.planningCycles.flatMap(cycle=>cycle.gates.map(gate=>({...gate,cycleId:cycle.id,cycleNo:cycle.cycleNo,cycleStatus:cycle.status,executionStatus:gate.status==='COMPLETED'?'COMPLETED':gate.dueDate<asOf?'OVERDUE':gate.dueDate===asOf?'DUE':'PLANNED'})));return{rows,cycles:state.planningCycles.length,openCycles:state.planningCycles.filter(item=>item.status==='OPEN').length,completed:rows.filter(item=>item.status==='COMPLETED').length,overdue:rows.filter(item=>item.executionStatus==='OVERDUE').length,due:rows.filter(item=>item.executionStatus==='DUE').length}}
