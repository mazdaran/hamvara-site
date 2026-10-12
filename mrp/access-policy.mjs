// Shared vocabulary only. The server always derives the role from authentication.
export const isManager = role => ['PRODUCTION_MANAGER','FACTORY_MANAGER','CEO'].includes(role);
export const isWarehouseUser = role => role === 'OPERATOR' || isManager(role);
export const operationalWarehouses = ['WH-RM','WH-PK','WH-FG','WH-SF'];
export function pageAccess(role) {
  const manager=isManager(role), ceo=role==='CEO', warehouse=isWarehouseUser(role);
  return {dashboard:true,products:warehouse,skus:warehouse,stock:warehouse,receipts:warehouse,
    bom:manager,orders:manager,requirements:manager,planningStandards:manager,reports:warehouse,
    projects:manager,importCenter:manager,production:manager,shopFloorLive:manager,
    documents:warehouse,procurement:manager,quality:manager,sales:manager,shipping:warehouse,
    exchange:manager,settings:ceo,finance:ceo,counts:warehouse};
}
export const roleLabel = role => ({OPERATOR:'Warehouse operator',PRODUCTION_MANAGER:'Operations manager',FACTORY_MANAGER:'Operations manager',CEO:'CEO / Finance',ACCOUNTING:'Accounting (read only)'})[role] || 'Read only';
export const businessFields = ['products','skus','boms','bomProfiles','bomHistory','orders','suppliers','purchaseRequests','purchaseOrders','salesOrders','customers','shipments','invoices','exchangeListings','labelTemplates','projects','projectTasks','kpiDefinitions','projectMilestones','projectSprints','projectFiveWhys','projectDmaicStages','projectErpLinks','operators','workCenters','shopFloorTasks','continuousImprovementItems','demandForecasts','capacityCalendar','planningTimeFences','productRoutings','shiftCalendars','machineDowntimeCalendars','supplierSchedules','productionSchedules','engineeringChanges','mrpPlanningSettings','plannedSupplyOrders'];
businessFields.push('sopPlans','mpsSnapshots','mrpRuns','mrpExceptions','planningCycles','mrp2Assessments','masterDataQualityGates','mrp2E2eValidations','factoryAcceptanceCampaigns','goLivePlans','hypercareCycles','operationsBaselines','releasePackages','capacityFeedbackActions');
export const financialFields = ['accountingSettings','chartOfAccounts','accountingPeriods','journalEntries','inventoryValuations','inventoryCostLayers','inventoryCostMovements','financeApprovals','projectFinance','businessCashflowPlans','productionCostVariances','wipSettlements'];
export const lockedStateFields = ['stock','receipts','qualityInspections','inventoryLots','inventoryMovements','inventoryTransactions','cycleCounts','productionJobs','operationSessions','andonAlerts',...financialFields];
export function editableStateFields(role) {
  if(role==='CEO')return [...businessFields,'company','settings','financeApprovals','projectFinance','businessCashflowPlans','whatIfSimulations'];
  if(isManager(role))return businessFields;
  return role==='OPERATOR'?['shipments']:[];
}
export const privateMoneyField = key => /cost|valuation|margin|profit|budget|journal|accounting|finance|payment|credit|revenue|amount|balance|salary|wage|hourlyRate|laborRate|overheadRate/i.test(key);
export function prepareRoleEdit(role,value){
 if(role==='CEO')return structuredClone(value);
 if(Array.isArray(value))return value.map(x=>prepareRoleEdit(role,x));
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([k])=>!privateMoneyField(k)||['paymentTerms','paymentStatus','budgetStatus'].includes(k)).map(([k,v])=>[k,prepareRoleEdit(role,v)]));
}
