// Versioned sandbox catalog. Never put credentials here or mutate an existing plan's meaning.
export const PRODUCTS = Object.freeze({
  sku: Object.freeze({name:'SKU Bridge', description:'Data mapping, validation and approved export workflows.', scope:'user', limits:Object.freeze({users:1}), graceDays:7}),
  mrp: Object.freeze({name:'Hamvara MRP SaaS', description:'Manufacturing planning for one company and one site.', scope:'company', limits:Object.freeze({companies:1,sites:1,users:5}), graceDays:7})
});
export const PRICE_DEFINITIONS = Object.freeze({
  skuMonthly: Object.freeze({priceId:'pri_01m4783eb2dd2j2xqxpdtgxpa8',productId:'pro_01m47773hvx3me0pv82z125w1g',amount:'1200',interval:'month',product:'sku'}),
  skuAnnual: Object.freeze({priceId:'pri_01m4783em9cvg4y6v9jm403wwm',productId:'pro_01m47773hvx3me0pv82z125w1g',amount:'12000',interval:'year',product:'sku'}),
  mrpAnnual: Object.freeze({priceId:'pri_01m4783exjj9kzkbdt2vzp8k79',productId:'pro_01m47773rjzypb3m3c0ha06r3r',amount:'59000',interval:'year',product:'mrp'})
});
