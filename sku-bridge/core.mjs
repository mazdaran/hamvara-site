// Shared, dependency-free rules used by the browser and the export boundary.
export const COLUMNS = ['sku','description','barcode','uom','price','currency','stock','warehouse','min','max'];
export const LIMITS = Object.freeze({rows:10000, columns:100, cell:2000, bytes:10*1024*1024});
const aliases = {
  sku:['sku','item code','product code','stock code','stok kodu','ürün kodu','urun kodu'],
  description:['description','product name','item name','title','açıklama','aciklama','ürün adı','urun adi'],
  barcode:['barcode','gtin','ean','ean13','upc','barkod'],
  uom:['uom','unit','unit of measure','birim'], price:['price','unit price','fiyat','birim fiyat'],
  currency:['currency','currency code','para birimi','döviz','doviz'],
  stock:['stock','quantity','qty','on hand','stok','miktar'],
  warehouse:['warehouse','location','depo'], min:['min','min stock','minimum stock','minimum stok'],
  max:['max','max stock','maximum stock','maksimum stok']
};
const headerKey = value => String(value).trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
export function suggestMapping(headers) {
  return Object.fromEntries(COLUMNS.map(key => {
    const hits=headers.map((h,i)=>aliases[key].includes(headerKey(h))?i:-1).filter(i=>i>=0);
    return [key,hits.length===1?hits[0]:-1];
  }));
}
export function guessDelimiter(text) {
  const candidates=[',',';','\t'];
  return candidates.map(delimiter=> {
    try {
      const result=parseDelimited(text,delimiter,{probe:true});
      const widths=result.records.slice(0,20).filter(r=>r.cells.some(v=>v.trim())).map(r=>r.cells.length);
      const counts=new Map();for(const width of widths)counts.set(width,(counts.get(width)||0)+1);
      const common=[...counts].sort((a,b)=>b[1]-a[1])[0]||[1,0];
      return {delimiter,score:common[0]>1?common[1]*100+Math.min(common[0],50):0};
    } catch { return {delimiter,score:-1}; }
  }).sort((a,b)=>b.score-a.score)[0].delimiter;
}
export function parseDelimited(input, delimiter=',', {probe=false}={}) {
  if(![',',';','\t'].includes(delimiter))throw Error('delimiter_invalid');
  const text=String(input).replace(/^\uFEFF/,'');
  let cells=[],cell='',quoted=false,closed=false,line=1,startLine=1;
  const records=[];
  const field=()=>{if(cell.length>LIMITS.cell)throw Error('cell_too_long');cells.push(cell);cell='';closed=false;if(cells.length>LIMITS.columns)throw Error('too_many_columns');};
  const row=()=>{field();records.push({cells,line:startLine});cells=[];startLine=line+1;if(records.length>LIMITS.rows+101)throw Error('too_many_rows');};
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(quoted) {
      if(ch==='"') {if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}
      else {cell+=ch;if(ch==='\n'||(ch==='\r'&&text[i+1]!=='\n'))line++;}
    } else if(ch===delimiter) field();
    else if(ch==='\n'||ch==='\r') {row();if(ch==='\r'&&text[i+1]==='\n')i++;line++;if(probe&&records.length>=20)return {records,delimiter};}
    else if(ch==='"') {if(cell||closed)throw Error('csv_quotes');quoted=true;}
    else {if(closed){if(ch===' '||ch==='\t')continue;throw Error('csv_quotes');}cell+=ch;}
    if(cell.length>LIMITS.cell)throw Error('cell_too_long');
  }
  if(quoted)throw Error('csv_unclosed_quote');
  if(cell||cells.length||closed)row();
  return {records,delimiter};
}
export function tableFromRecords(records, headerIndex=0) {
  const header=records[headerIndex];
  if(!header||!header.cells.some(c=>String(c).trim()))throw Error('header_missing');
  const headers=header.cells.map(c=>String(c).trim());
  let skipped=0;
  const rows=records.slice(headerIndex+1).filter(r=>{if(r.cells.every(c=>!String(c).trim())){skipped++;return false;}return true;});
  if(rows.length>LIMITS.rows)throw Error('too_many_rows');
  if(rows.some(r=>r.cells.length>headers.length))throw Error('column_mismatch');
  return {headers, rows:rows.map(r=>({...r,cells:headers.map((_,i)=>String(r.cells[i]??''))})), skipped};
}
export function mapRows(rows,mapping) {
  const selected=Object.values(mapping).filter(i=>Number.isInteger(i)&&i>=0);
  if(new Set(selected).size!==selected.length)throw Error('mapping_duplicate');
  if(!(mapping.sku>=0)||!(mapping.price>=0))throw Error('mapping_required');
  return rows.map((r,i)=>{
    const result={id:i+1,sourceRow:r.line,approved:false,excluded:false,numberFormats:{},
      ...Object.fromEntries(COLUMNS.map(k=>[k,mapping[k]>=0?String(r.cells[mapping[k]]??''):'']))};
    for(const field of ['price','stock','min','max'])if(typeof r.numericCells?.[mapping[field]]==='string'){
      result[field]=r.numericCells[mapping[field]];result.numberFormats[field]='canonical';
    }
    return result;
  });
}
// No guessing when a single separator followed by 3 digits could mean decimal or thousands.
export function parseNumber(value,locale='auto') {
  const s=String(value).trim();
  if(!s)return {ok:false,code:'number_missing'};
  if(!['auto','dot','comma','canonical'].includes(locale))return {ok:false,code:'number_invalid'};
  let normalized=s;
  if(locale==='canonical') {
    if(!/^-?\d+(?:\.\d+)?$/.test(s))return {ok:false,code:'number_invalid'};
  } else {
    let decimal=locale==='comma'?',':'.';
    if(locale==='auto') {
      if(s.includes('.')&&s.includes(','))decimal=s.lastIndexOf('.')>s.lastIndexOf(',')?'.':',';
      else {
        const sep=s.includes(',')?',':s.includes('.')?'.':null;
        if(sep) {
          const parts=s.split(sep);
          if(parts.length===2&&/^\d{3}$/.test(parts[1]))return {ok:false,code:'number_ambiguous'};
          decimal=parts.length>2?(sep==='.'?',':'.'):sep;
        }
      }
    }
    const group=decimal==='.'?',':'.',esc=c=>c==='.'?'\\.':c;
    const integer='(?:\\d+|\\d{1,3}(?:'+esc(group)+'\\d{3})+|\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+)';
    if(!new RegExp('^-?'+integer+'(?:'+esc(decimal)+'\\d+)?$').test(s))return {ok:false,code:'number_invalid'};
    normalized=s.split(group).join('').replace(/[ \u00a0\u202f]/g,'').replace(decimal,'.');
  }
  const unsigned=normalized.replace(/^-/,'').split('.'), digits=unsigned.join('').replace(/^0+/,'');
  if(digits.length>15||!Number.isFinite(Number(normalized)))return {ok:false,code:'number_precision'};
  const parts=normalized.split('.');parts[0]=parts[0].replace(/^(-?)0+(?=\d)/,'$1');
  return {ok:true,value:parts.join('.'),number:Number(normalized)};
}
export function barcodeValid(value) {
  if(!value)return true;
  if(!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value))return false;
  const d=[...value].map(Number),check=d.pop();
  return (10-d.reverse().reduce((sum,n,i)=>sum+n*(i%2?1:3),0)%10)%10===check;
}
export function reviewRows(rows,locale='canonical') {
  const counts=new Map();
  for(const row of rows)if(!row.excluded&&String(row.sku??'').trim()) {
    const key=String(row.sku).trim().toLowerCase();counts.set(key,(counts.get(key)||0)+1);
  }
  return rows.map(row=>{
    const issues=[];const add=(field,code)=>issues.push({field,code});
    for(const key of COLUMNS)if(typeof row[key]!=='string'||row[key].length>LIMITS.cell||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(row[key]))add(key,'invalid_cell');
    const sku=String(row.sku??'').trim();
    if(!sku)add('sku','sku_missing');else if(counts.get(sku.toLowerCase())>1)add('sku','sku_duplicate');
    if(!barcodeValid(String(row.barcode??'').trim()))add('barcode','barcode_invalid');
    const numbers={};
    for(const key of ['price','stock','min','max']) {
      const value=String(row[key]??'').trim();if(!value&&key!=='price')continue;
      const parsed=parseNumber(value,row.numberFormats?.[key]||locale);
      if(!parsed.ok)add(key,parsed.code);else {numbers[key]=parsed.number;if(parsed.number<0)add(key,'number_negative');}
    }
    if(numbers.min!==undefined&&numbers.max!==undefined&&numbers.min>numbers.max)add('max','range_invalid');
    const currency=String(row.currency??'').trim();
    if(currency&&!/^[A-Z]{3}$/.test(currency))add('currency','currency_invalid');
    return {...row,issues,status:row.excluded?'EXCLUDED':issues.length?'REVIEW':'READY',approved:!row.excluded&&!issues.length&&row.approved===true};
  });
}
export function safeFixes(rows,locale='auto') {
  const changes=[];
  const next=rows.map(row=> {
    if(row.excluded)return {...row};
    const result={...row,numberFormats:{...row.numberFormats}};
    for(const field of COLUMNS) {
      let value=String(row[field]??'').trim();
      if(['price','stock','min','max'].includes(field)&&value) {const parsed=parseNumber(value,row.numberFormats?.[field]||locale);if(parsed.ok){value=parsed.value;result.numberFormats[field]='canonical';}}
      if(field==='currency')value=value.toUpperCase();
      if(value!==row[field]){changes.push({id:row.id,sourceRow:row.sourceRow,field,before:row[field],after:value});result[field]=value;result.approved=false;}
    }
    return result;
  });
  return {rows:next,changes};
}
export function exportRows(rows,locale='auto') {
  return rows.filter(r=>r.status==='READY'&&r.approved&&!r.excluded).map(row=>({approved:true,
    ...Object.fromEntries(COLUMNS.map(field=> {
      let value=String(row[field]??'').trim();
      if(['price','stock','min','max'].includes(field)&&value)value=parseNumber(value,row.numberFormats?.[field]||locale).value;
      return [field,value];
    }))}));
}
export function csvCell(value) {
  const text=String(value??'');
  const safe=/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text)?"'"+text:text;
  return '"'+safe.replace(/"/g,'""')+'"';
}
export function serializeCsv(rows,columns=COLUMNS) {
  return '\uFEFF'+[columns.join(','),...rows.map(r=>columns.map(k=>csvCell(r[k])).join(','))].join('\r\n')+'\r\n';
}
