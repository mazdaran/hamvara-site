// Keep codes as strings: leading zeroes are significant.
export function asciiDigits(value){
 return String(value).replace(/[۰-۹٠-٩]/g,char=>String(char.charCodeAt(0)-(char>='۰'?0x6f0:0x660)));
}
export function parseQuantity(value){
 if(typeof value!=='string'&&typeof value!=='number')return NaN;
 const text=asciiDigits(value).trim().replaceAll('٫','.');
 if(!/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(text))return NaN;
 const quantity=Number(text);
 return Number.isFinite(quantity)&&quantity>0&&quantity<=1e9?quantity:NaN;
}
// Exact catalog identifiers win; translated keyboard digits are a fallback only.
export function matchingItems(items,code){
 const active=items.filter(item=>item.active!==false);
 const exact=active.filter(item=>item.code===code||item.barcode===code);
 if(exact.length)return exact;
 const normalized=asciiDigits(code);
 return active.filter(item=>item.code===normalized||item.barcode===normalized);
}
