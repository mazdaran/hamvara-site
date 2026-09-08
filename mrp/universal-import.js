const normalize=value=>String(value??'').trim().toLowerCase().replace(/[\s_.\-/()]+/g,'').replace(/[ıİ]/g,'i');

const field=(label,aliases,{required=false,type='text'}={})=>({label,aliases:[label,...aliases],required,type});

export const IMPORT_SCHEMAS={
  products:{label:'Products',key:['code'],fields:{
    code:field('Product Code',['Product','Code','Item Code','Ürün Kodu','کد محصول'],{required:true}),
    name:field('Description',['Product Name','Name','Açıklama','Ürün Adı','نام محصول','شرح'],{required:true}),
    unit:field('Unit',['UoM','Unit of Measure','Birim','واحد']),
    leadTimeHours:field('Lead Time Hours',['Production Lead Time','Lead Hours','Üretim Süresi','زمان تولید'],{type:'number'}),
    notes:field('Notes',['Note','Remarks','Notlar','یادداشت'])}},
  skus:{label:'Items & SKU',key:['code'],fields:{
    code:field('SKU',['Stock Code','Item Code','Barcode','Stok Kodu','Malzeme Kodu','کد کالا','بارکد'],{required:true}),
    name:field('Description',['Name','Item Name','Stock Name','Açıklama','Stok Adı','شرح','نام کالا'],{required:true}),
    type:field('Type',['Item Type','Tür','Tip','نوع']),category:field('Category',['Category Code','Kategori','دسته بندی']),
    unit:field('Unit',['UoM','Unit of Measure','Birim','واحد']),cost:field('Unit Cost',['Cost','Price','Maliyet','Birim Maliyet','قیمت واحد'],{type:'number'}),
    warehouse:field('Main Warehouse',['Warehouse','Warehouse Code','Depo','Ana Depo','انبار اصلی']),supplier:field('Supplier',['Vendor','Tedarikçi','تامین کننده']),
    leadTime:field('Lead Time',['Lead Days','Tedarik Süresi','زمان تامین'],{type:'number'}),min:field('Min Qty',['Min Q','Minimum Stock','Asgari Stok','حداقل موجودی'],{type:'number'}),max:field('Max Qty',['Max Q','Maximum Stock','Azami Stok','حداکثر موجودی'],{type:'number'}),
    quantity:field('Quantity',['Qty','Stock','On Hand','Balance','Miktar','Mevcut Stok','موجودی','تعداد'],{type:'number'}),batch:field('Batch',['Batch No','Lot','Lot No','Parti No','بچ']),date:field('Opening Date',['Date','Inventory Date','Tarih','تاریخ'],{type:'date'})}},
  customers:{label:'Customers',key:['code'],fields:{
    code:field('Customer Code',['Account ID','Customer ID','Client Code','Müşteri Kodu','کد مشتری'],{required:true}),name:field('Customer Name',['Account Name','Company','Client Name','Müşteri Adı','نام مشتری'],{required:true}),
    taxNo:field('Tax No',['Tax ID','VAT No','Vergi No','شناسه مالیاتی']),phone:field('Phone',['Telephone','Mobile','Telefon','تلفن']),email:field('Email',['E-mail','Eposta','ایمیل']),address:field('Address',['Billing Address','Adres','آدرس']),currency:field('Currency',['Para Birimi','ارز']),creditLimit:field('Credit Limit',['Limit','Kredi Limiti','حد اعتبار'],{type:'number'})}},
  suppliers:{label:'Suppliers',key:['code'],fields:{
    code:field('Supplier Code',['Vendor Code','Vendor ID','Tedarikçi Kodu','کد تامین کننده'],{required:true}),name:field('Supplier Name',['Vendor Name','Company','Tedarikçi Adı','نام تامین کننده'],{required:true}),approved:field('Approved',['ASL','Active','Onaylı','تایید شده'],{type:'boolean'}),rating:field('Rating',['Score','Puan','امتیاز'],{type:'number'}),terms:field('Payment Terms',['Terms','Vade','شرایط پرداخت']),leadTime:field('Lead Days',['Lead Time','Tedarik Süresi','زمان تامین'],{type:'number'})}},
  productionOrders:{label:'Production Orders',key:['orderNo','productCode'],fields:{
    orderNo:field('Order No',['Order Number','Production Order','Sipariş No','شماره سفارش'],{required:true}),date:field('Date',['Order Date','Tarih','تاریخ'],{type:'date'}),customer:field('Customer',['Customer Name','Müşteri','مشتری']),productCode:field('Product Code',['Product','Item Code','Ürün Kodu','کد محصول'],{required:true}),qty:field('Quantity',['Qty','Order Qty','Miktar','تعداد'],{required:true,type:'number'}),due:field('Due Date',['Need Date','Delivery Date','Termin','تاریخ تحویل'],{type:'date'}),priority:field('Priority',['Öncelik','اولویت']),notes:field('Notes',['Remarks','Notlar','یادداشت'])}},
  salesOrders:{label:'Sales Orders',key:['orderNo','sku'],fields:{
    orderNo:field('Sales Order',['Order No','Order Number','SO No','Satış Siparişi','شماره سفارش فروش'],{required:true}),date:field('Date',['Order Date','Tarih','تاریخ'],{type:'date'}),customer:field('Customer',['Customer Name','Account','Müşteri','مشتری'],{required:true}),sku:field('SKU',['Product SKU','Item Code','Stok Kodu','کد کالا'],{required:true}),qty:field('Quantity',['Qty','Order Qty','Miktar','تعداد'],{required:true,type:'number'}),unitPrice:field('Unit Price',['Price','Sales Price','Birim Fiyat','قیمت واحد'],{type:'number'}),dueDate:field('Due Date',['Delivery Date','Termin','تاریخ تحویل'],{type:'date'}),paymentStatus:field('Payment Status',['Payment','Ödeme Durumu','وضعیت پرداخت']),creditApproved:field('Credit Approved',['Credit','Kredi Onayı','تایید اعتبار'],{type:'boolean'}),notes:field('Notes',['Remarks','Notlar','یادداشت'])}},
  bom:{label:'BOM Materials',key:['productCode','component','warehouse'],fields:{
    productCode:field('Product Code',['Parent SKU','Finished SKU','Ürün Kodu','کد محصول'],{required:true}),component:field('Component SKU',['Material SKU','Child SKU','Malzeme Kodu','کد ماده'],{required:true}),warehouse:field('Source Warehouse',['Warehouse','Depo','انبار'],{required:true}),qty:field('Usage Quantity',['Consumption','Factor','Consumption Coefficient','Kullanım Miktarı','ضریب مصرف'],{required:true,type:'number'}),version:field('BOM Version',['Version','Reçete Versiyonu','نسخه BOM']),effectiveDate:field('Effective Date',['Valid From','Geçerlilik Tarihi','تاریخ اجرا'],{type:'date'})}},
  purchaseRequests:{label:'Purchase Requests',key:['prNo','sku'],fields:{
    prNo:field('PR No',['Purchase Request','Request No','Talep No','شماره درخواست خرید'],{required:true}),date:field('Date',['Request Date','Tarih','تاریخ'],{type:'date'}),requester:field('Requester',['Requested By','Talep Eden','درخواست کننده']),sku:field('SKU',['Item Code','Material Code','Malzeme Kodu','کد کالا'],{required:true}),qty:field('Quantity',['Qty','Requested Qty','Miktar','تعداد'],{required:true,type:'number'}),needDate:field('Need Date',['Required Date','Due Date','İhtiyaç Tarihi','تاریخ نیاز'],{type:'date'}),priority:field('Priority',['Öncelik','اولویت']),budgetStatus:field('Budget Status',['Budget','Bütçe Durumu','وضعیت بودجه']),status:field('Status',['PR Status','Durum','وضعیت'])}},
  purchaseOrders:{label:'Purchase Orders',key:['poNo','sku'],fields:{
    poNo:field('PO No',['Purchase Order','Order No','Satınalma Siparişi','شماره سفارش خرید'],{required:true}),prNo:field('PR No',['Purchase Request','Talep No','شماره درخواست']),supplierCode:field('Supplier Code',['Vendor Code','Supplier','Tedarikçi Kodu','کد تامین کننده'],{required:true}),sku:field('SKU',['Item Code','Material Code','Malzeme Kodu','کد کالا'],{required:true}),qty:field('Quantity',['Qty','Order Qty','Miktar','تعداد'],{required:true,type:'number'}),unitPrice:field('Unit Price',['Price','Birim Fiyat','قیمت واحد'],{type:'number'}),dueDate:field('Due Date',['Delivery Date','Termin','تاریخ تحویل'],{type:'date'}),grnNo:field('GRN',['Receipt No','İrsaliye No','شماره رسید']),invoiceNo:field('Invoice',['Invoice No','Fatura No','شماره فاکتور']),status:field('Status',['PO Status','Durum','وضعیت'])}},
  receipts:{label:'Inventory Transactions',key:['reference','sku'],fields:{
    transaction:field('Transaction Type',['Movement Type','Type','İşlem Türü','نوع گردش']),date:field('Date',['Receipt Date','Tarih','تاریخ'],{type:'date'}),reference:field('Reference',['Document No','GRN','İrsaliye No','شماره سند'],{required:true}),sku:field('SKU',['Item Code','Material Code','Stok Kodu','کد کالا'],{required:true}),qty:field('Quantity',['Qty','Miktar','تعداد'],{required:true,type:'number'}),warehouse:field('Warehouse',['Destination Warehouse','Depo','انبار'],{required:true}),sourceWarehouse:field('Source Warehouse',['From Warehouse','Kaynak Depo','انبار مبدا']),supplier:field('Supplier',['Vendor','Tedarikçi','تامین کننده']),batch:field('Batch',['Batch No','Lot No','Parti No','بچ']),notes:field('Notes',['Remarks','Notlar','یادداشت'])}},
  quality:{label:'Quality & NCR',key:['inspectionNo'],fields:{
    inspectionNo:field('Inspection No',['QC No','Inspection','Kontrol No','شماره بازرسی'],{required:true}),type:field('Inspection Type',['QC Type','Type','Kontrol Türü','نوع کنترل']),reference:field('Reference',['Document No','Order No','Referans','مرجع']),date:field('Date',['Inspection Date','Tarih','تاریخ'],{type:'date'}),sku:field('SKU',['Item Code','Stok Kodu','کد کالا'],{required:true}),qty:field('Quantity',['Qty','Sample Qty','Miktar','تعداد'],{type:'number'}),result:field('Result',['QC Result','Status','Sonuç','نتیجه']),inspector:field('Inspector',['Checked By','Kontrol Eden','بازرس']),ncrNo:field('NCR No',['NCR','Uygunsuzluk No','شماره عدم انطباق']),notes:field('Notes',['Remarks','Notlar','یادداشت'])}},
  invoices:{label:'Invoices',key:['invoiceNo'],fields:{
    invoiceNo:field('Invoice No',['Invoice','Fatura No','شماره فاکتور'],{required:true}),type:field('Invoice Type',['Type','Sales/Purchase','Fatura Türü','نوع فاکتور']),date:field('Date',['Invoice Date','Tarih','تاریخ'],{type:'date'}),customer:field('Customer',['Account','Müşteri','مشتری']),supplier:field('Supplier',['Vendor','Tedarikçi','تامین کننده']),reference:field('Reference',['Order No','PO No','Referans','مرجع']),amount:field('Amount',['Total','Grand Total','Tutar','مبلغ'],{required:true,type:'number'}),currency:field('Currency',['Para Birimi','ارز']),status:field('Status',['Payment Status','Durum','وضعیت'])}},
  shipments:{label:'Shipments',key:['shipmentNo'],fields:{
    shipmentNo:field('Shipment No',['Delivery No','Dispatch No','Sevkiyat No','شماره ارسال'],{required:true}),orderNo:field('Sales Order',['Order No','SO No','Sipariş No','شماره سفارش'],{required:true}),pickQty:field('Pick Quantity',['Quantity','Qty','Toplama Miktarı','تعداد'],{required:true,type:'number'}),packingList:field('Packing List',['Packing List No','Paketleme Listesi','لیست بسته بندی']),invoiceNo:field('Invoice No',['Invoice','Fatura No','شماره فاکتور']),oqcStatus:field('OQC Status',['QC Status','OQC','کنترل خروج']),podNo:field('POD No',['Proof of Delivery','Teslim Belgesi','شماره تحویل']),status:field('Status',['Shipment Status','Durum','وضعیت'])}}
};

export const schemaOptions=()=>Object.entries(IMPORT_SCHEMAS).map(([value,schema])=>({value,label:schema.label}));
export const normalizeHeader=normalize;

export function suggestMapping(headers,entity){
  const schema=IMPORT_SCHEMAS[entity];if(!schema)return{};
  const used=new Set(),mapping={};
  for(const [key,definition] of Object.entries(schema.fields)){
    const aliases=new Set(definition.aliases.map(normalize));
    const header=headers.find(candidate=>!used.has(candidate)&&aliases.has(normalize(candidate)));
    if(header!==undefined){mapping[key]=header;used.add(header)}
  }
  return mapping;
}

export function detectImportEntity(headers){
  let best={entity:'skus',score:-1,mapping:{}};
  for(const entity of Object.keys(IMPORT_SCHEMAS)){
    const mapping=suggestMapping(headers,entity),schema=IMPORT_SCHEMAS[entity];
    const required=Object.entries(schema.fields).filter(([,f])=>f.required);
    const requiredHits=required.filter(([key])=>mapping[key]).length;
    const score=requiredHits*10+Object.keys(mapping).length-(requiredHits<Math.min(2,required.length)?20:0);
    if(score>best.score)best={entity,score,mapping};
  }
  return best;
}

export function canonicalizeRow(row,entity,mapping,{parseNumber=Number,parseDate=value=>String(value??''),parseWarehouse=value=>String(value??'').trim(),parseUnit=value=>String(value??'').trim()}={}){
  const schema=IMPORT_SCHEMAS[entity];if(!schema)throw Error(`Unknown import entity: ${entity}`);
  const clean={};
  for(const [key,definition] of Object.entries(schema.fields)){
    const raw=mapping[key]?row[mapping[key]]:'';
    if(definition.type==='number'){const value=parseNumber(raw);clean[key]=Number.isFinite(value)?value:null}
    else if(definition.type==='date')clean[key]=raw===''?'':parseDate(raw);
    else if(definition.type==='boolean')clean[key]=['1','true','yes','y','approved','active','evet','onayli','onaylı','بله','تایید'].includes(String(raw??'').trim().toLowerCase());
    else if(key.toLowerCase().includes('warehouse'))clean[key]=parseWarehouse(raw);
    else if(key==='unit')clean[key]=parseUnit(raw);
    else clean[key]=String(raw??'').trim();
  }
  return clean;
}

export function validateCanonicalRow(clean,entity){
  const schema=IMPORT_SCHEMAS[entity],errors=[];
  for(const [key,definition] of Object.entries(schema.fields)){
    const value=clean[key];
    if(definition.required&&(value===''||value===null||value===undefined))errors.push(`${definition.label} required`);
    if(definition.type==='number'&&value!==null&&value<0)errors.push(`${definition.label} must be zero or positive`);
  }
  for(const key of Object.keys(schema.fields).filter(key=>key.toLowerCase().includes('warehouse')))if(clean[key]===null)errors.push(`${schema.fields[key].label} is invalid`);
  return errors;
}

export function importKey(clean,entity){return (IMPORT_SCHEMAS[entity]?.key||[]).map(key=>String(clean[key]??'').trim()).join('::')}

export function analyzeCanonicalRows(rows,entity){
  const counts=new Map();for(const row of rows){const key=importKey(row.clean,entity);if(key)counts.set(key,(counts.get(key)||0)+1)}
  const duplicateRows=[...counts.values()].reduce((sum,count)=>sum+Math.max(0,count-1),0);
  return{rows:rows.length,unique:counts.size,duplicateRows,duplicateKeys:new Set([...counts].filter(([,count])=>count>1).map(([key])=>key))};
}
