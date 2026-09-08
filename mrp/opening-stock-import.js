const normalized=value=>String(value??'').trim().toLowerCase().replace(/[\s_.\-/()]+/g,'');

function valueByAlias(row,aliases){
  const wanted=new Set(aliases.map(normalized));
  const key=Object.keys(row||{}).find(name=>wanted.has(normalized(name)));
  return key===undefined?'':row[key];
}

const FIELDS={
  sku:['SKU','Stock Code','Item Code','Product Code','Barcode','Stok Kodu','Ürün Kodu','Malzeme Kodu','کد کالا','کد محصول','بارکد'],
  description:['Description','Name','Item Name','Product Name','Stock Name','Açıklama','Ürün Adı','Stok Adı','Malzeme Adı','شرح','نام کالا','نام محصول'],
  type:['Type','Item Type','Category','Category Code','Tür','Tip','Kategori','نوع','دسته بندی'],
  warehouse:['Warehouse','Warehouse Code','Main Warehouse','Store','Location','Depo','Depo Kodu','Ana Depo','Ambar','انبار','کد انبار','انبار اصلی','محل انبار'],
  quantity:['Quantity','Qty','Stock','On Hand','Balance','Current Stock','Inventory','Miktar','Stok','Stok Miktarı','Mevcut','Mevcut Stok','Bakiye','موجودی','موجودی فعلی','تعداد','مقدار'],
  unit:['UoM','Unit','Unit of Measure','Birim','Ölçü Birimi','واحد','واحد اندازه گیری'],
  cost:['Unit Cost','Cost','Price','Unit Price','Maliyet','Birim Maliyet','Fiyat','قیمت','بهای واحد','قیمت واحد'],
  batch:['Batch No','Batch','Lot No','Lot','Parti No','Parti','بچ','شماره بچ','لات'],
  date:['Opening Date','Date','Inventory Date','Açılış Tarihi','Tarih','Stok Tarihi','تاریخ','تاریخ موجودی'],
  min:['Min Q','Min Qty','Minimum','Minimum Stock','Min Stock','Asgari Stok','حداقل','حداقل موجودی'],
  max:['Max Q','Max Qty','Maximum','Maximum Stock','Max Stock','Azami Stok','حداکثر','حداکثر موجودی']
};

const WAREHOUSE_ALIASES={
  'WH-RM':['WH-RM','RM','Raw Materials','Raw Material','Raw','Hammadde','Ana Depo','Main Warehouse','مواد اولیه','انبار مواد اولیه','انبار اصلی'],
  'WH-PK':['WH-PK','PK','PACK','Packaging','Package','Ambalaj','بسته بندی','انبار بسته بندی'],
  'WH-FG':['WH-FG','FG','Product','Finished Goods','Finished Product','Mamul','Mamul Ürün','Ürün Deposu','محصول','محصول نهایی','انبار محصول'],
  'WH-QA':['WH-QA','QA','QC','Quarantine','Quality','Karantina','Karantina Deposu','قرنطینه','انبار قرنطینه'],
  'WH-SF':['WH-SF','SF','WIP','Shop Floor','Production Floor','Üretim Alanı','Üretim','خط تولید','پای خط','شاپ فلور','کف کارخانه']
};

const UNIT_ALIASES={ADET:['ADET','PIECE','PCS','PC','EA','EACH','عدد','قطعه'],KG:['KG','KILOGRAM','KİLOGRAM','کیلوگرم'],G:['G','GRAM','گرم'],L:['L','LITER','LITRE','LİTRE','لیتر'],ML:['ML','MILLILITER','MILLILITRE','میلی لیتر'],M:['M','METER','METRE','متر'],M2:['M2','M²','SQUARE METER','متر مربع'],M3:['M3','M³','CUBIC METER','متر مکعب'],PAKET:['PAKET','PACK','PACKAGE','بسته'],RULO:['RULO','ROLL','رول'],KUTU:['KUTU','BOX','کارتن']};
const resolveUnit=value=>{const candidate=normalized(value);return Object.entries(UNIT_ALIASES).find(([,aliases])=>aliases.some(alias=>normalized(alias)===candidate))?.[0]||String(value||'ADET').trim()||'ADET'};
const itemTypeForWarehouse=warehouse=>warehouse==='WH-FG'?'FINISHED_GOOD':warehouse==='WH-PK'?'PACKAGING':warehouse==='WH-SF'?'SEMI_FINISHED':'RAW_MATERIAL';

export function openingStockField(row,field){return valueByAlias(row,FIELDS[field]||[field])}

export function resolveOpeningWarehouse(state,value,defaultWarehouse='WH-RM'){
  const candidate=normalized(value);
  if(!candidate)return state.warehouses?.some(item=>item.code===defaultWarehouse)?defaultWarehouse:'WH-RM';
  const direct=(state.warehouses||[]).find(item=>[item.code,item.name].some(name=>normalized(name)===candidate));
  if(direct)return direct.code;
  return Object.entries(WAREHOUSE_ALIASES).find(([,aliases])=>aliases.some(alias=>normalized(alias)===candidate))?.[0]||'';
}

export function readOpeningStockRow(state,row,{parseNumber,parseDate,defaultWarehouse='WH-RM'}={}){
  const code=String(openingStockField(row,'sku')||'').trim();
  const rawWarehouse=openingStockField(row,'warehouse');
  const warehouse=resolveOpeningWarehouse(state,rawWarehouse,defaultWarehouse);
  const rawQuantity=openingStockField(row,'quantity');
  const quantity=parseNumber?parseNumber(rawQuantity):Number(rawQuantity);
  const rawCost=openingStockField(row,'cost');
  const cost=parseNumber?parseNumber(rawCost):Number(rawCost);
  const min=parseNumber?parseNumber(openingStockField(row,'min')):Number(openingStockField(row,'min'));
  const max=parseNumber?parseNumber(openingStockField(row,'max')):Number(openingStockField(row,'max'));
  return{code,name:String(openingStockField(row,'description')||'').trim(),warehouse,rawWarehouse:String(rawWarehouse||'').trim(),quantity:Number.isFinite(quantity)?quantity:0,hasQuantity:String(rawQuantity??'').trim()!=='',rawQuantity:String(rawQuantity??'').trim(),unit:resolveUnit(openingStockField(row,'unit')),cost:Number.isFinite(cost)?cost:0,category:String(openingStockField(row,'type')||'').trim(),itemType:itemTypeForWarehouse(warehouse),min:Number.isFinite(min)?min:0,max:Number.isFinite(max)?max:0,batch:String(openingStockField(row,'batch')||'').trim(),date:parseDate?parseDate(openingStockField(row,'date')):String(openingStockField(row,'date')||'')};
}
