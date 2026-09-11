function requireReceipt(state,receiptId){
  const receipt=state.receipts.find(item=>item.id===receiptId);
  if(!receipt)throw new Error('Receipt not found.');
  return receipt;
}

export function calculateAvailableStock(stockRecord,warehouses){
  const stock=stockRecord||{};
  return warehouses
    .filter(warehouse=>!['WH-QA','WH-SF'].includes(warehouse.code))
    .reduce((total,warehouse)=>total+Number(stock[warehouse.code]||0),0)-Number(stock.reserved||0);
}

export function queueReceiptForApproval(state,data,meta={}){
  const qty=Number(data.qty);
  if(!data.sku||!Number.isFinite(qty)||qty<=0)throw new Error('Valid SKU and quantity are required.');
  if(!data.targetWarehouse||data.targetWarehouse==='WH-QA')throw new Error('A destination warehouse is required.');
  const item=(state.skus||[]).find(value=>value.code===data.sku);if(item?.lotTracked&&!String(data.lotNo||'').trim())throw new Error('Lot number is required for this SKU.');if(item?.serialTracked&&(!String(data.serialNo||'').trim()||qty!==1))throw new Error('A unique serial number and quantity 1 are required for this SKU.');if(data.expiryDate&&data.expiryDate<data.date)throw new Error('Expired stock cannot be received.');
  state.stock[data.sku]??={};
  const before=Number(state.stock[data.sku]['WH-QA']||0);
  state.stock[data.sku]['WH-QA']=before+qty;
  const receipt={...data,qty,warehouse:'WH-QA',before,after:before+qty,status:'PENDING_QC',qcStatus:'PENDING',managerStatus:'PENDING'};
  const inspection={
    id:data.inspectionId,
    inspectionNo:data.inspectionNo,
    type:'IQC',
    reference:data.reference,
    receiptId:data.id,
    targetWarehouse:data.targetWarehouse,
    sku:data.sku,
    qty,
    result:'PENDING',
    date:data.date,
    ncrNo:'',
    disposition:'HOLD',
    released:false,
    stockReleased:false,
    notes:''
  };
  state.receipts.unshift(receipt);
  state.qualityInspections.unshift(inspection);
  appendInventoryMovement(state,{...metaFields(meta),sku:data.sku,warehouse:'WH-QA',qty,direction:'IN',type:'QUARANTINE_RECEIPT',reference:data.reference,at:data.postedAt});
  appendAudit(state,{...metaFields(meta),action:'RECEIPT_SUBMITTED_FOR_QC',entity:'RECEIPT',reference:data.reference,at:data.postedAt});
  return {receipt,inspection};
}

export function applyReceiptQcDecision(state,inspectionId,ncrNo=''){
  const inspection=state.qualityInspections.find(item=>item.id===inspectionId);
  if(!inspection?.receiptId)throw new Error('Linked receipt not found.');
  if(inspection.result==='PENDING')throw new Error('Select a QC result first.');
  const receipt=requireReceipt(state,inspection.receiptId);
  receipt.qcStatus=inspection.result;
  inspection.released=true;
  if(inspection.result==='ACCEPTED'){
    receipt.status='PENDING_MANAGER';
    return receipt;
  }
  inspection.ncrNo||=ncrNo;
  receipt.ncrNo=inspection.ncrNo;
  receipt.status='HOLD_NCR';
  receipt.managerStatus='NOT_REQUIRED';
  return receipt;
}

export function applyManagerReceiptDecision(state,receiptId,approved,ncrNo='',meta={}){
  const receipt=requireReceipt(state,receiptId);
  if(receipt.qcStatus!=='ACCEPTED'||receipt.status!=='PENDING_MANAGER')throw new Error('QC acceptance is required before manager approval.');
  const inspection=state.qualityInspections.find(item=>item.receiptId===receiptId);
  if(!approved){
    receipt.managerStatus='REJECTED';
    receipt.status='HOLD_NCR';
    receipt.ncrNo=ncrNo;
    if(inspection){inspection.ncrNo||=ncrNo;inspection.disposition='HOLD'}
    appendAudit(state,{...metaFields(meta),action:'RECEIPT_MANAGER_REJECTED',entity:'RECEIPT',reference:receipt.reference});
    return receipt;
  }
  const stock=state.stock[receipt.sku]??={};
  const quarantine=Number(stock['WH-QA']||0);
  if(quarantine<receipt.qty)throw new Error('Insufficient matching quarantine stock.');
  const destination=receipt.targetWarehouse;
  const before=Number(stock[destination]||0);
  stock['WH-QA']=quarantine-receipt.qty;
  stock[destination]=before+receipt.qty;
  receipt.warehouse=destination;
  receipt.destinationBefore=before;
  receipt.destinationAfter=before+receipt.qty;
  receipt.managerStatus='APPROVED';
  receipt.status='POSTED';
  receipt.approvedAt=new Date().toISOString();
  state.inventoryLots??=[];if(receipt.lotNo||receipt.serialNo){if(receipt.serialNo&&state.inventoryLots.some(item=>item.serialNo===receipt.serialNo&&item.quantity>0))throw new Error('Serial number already exists in inventory.');state.inventoryLots.push({id:`LOT-${receipt.id}`,sku:receipt.sku,warehouse:destination,lotNo:receipt.lotNo||'',serialNo:receipt.serialNo||'',expiryDate:receipt.expiryDate||'',receivedAt:receipt.approvedAt,quantity:receipt.qty,reference:receipt.reference})}
  if(inspection)inspection.stockReleased=true;
  appendInventoryMovement(state,{...metaFields(meta),sku:receipt.sku,warehouse:'WH-QA',qty:receipt.qty,direction:'OUT',type:'QC_RELEASE',reference:receipt.reference,at:receipt.approvedAt});
  appendInventoryMovement(state,{...metaFields(meta),sku:receipt.sku,warehouse:destination,qty:receipt.qty,direction:'IN',type:'GOODS_RECEIPT',reference:receipt.reference,at:receipt.approvedAt});
  appendAudit(state,{...metaFields(meta),action:'RECEIPT_POSTED',entity:'RECEIPT',reference:receipt.reference,at:receipt.approvedAt,details:`${receipt.qty} ${receipt.sku} → ${destination}`});
  return receipt;
}
import {appendAudit,appendInventoryMovement} from './audit-workflow.js';

function metaFields(meta={}){return{user:meta.user||'unknown',role:meta.role||'',workspace:meta.workspace||'',device:meta.device||'unknown'}}
