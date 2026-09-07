const PERSIAN_DIGITS='۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS='٠١٢٣٤٥٦٧٨٩';

export function normalizeNumericText(value){
  return String(value??'')
    .replace(/[۰-۹]/g,d=>String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g,d=>String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[٫,]/g,'.')
    .replace(/٬/g,'');
}

export function parseLocalizedNumber(value){
  return Number(normalizeNumericText(value).trim());
}
