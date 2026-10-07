import { PRODUCTS, PRICE_DEFINITIONS } from './product-registry.mjs';
export function buildCatalog(products, prices) {
  const plans = Object.create(null), ids = new Set();
  for (const [key, price] of Object.entries(prices)) {
    const product = Object.hasOwn(products,price.product) ? products[price.product] : null;
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(key) || !/^[a-z][a-z0-9-]{0,79}$/.test(price.product) ||
        !product || !['user','company'].includes(product.scope) ||
        !/^pri_[a-z0-9]{26}$/.test(price.priceId) || !/^pro_[a-z0-9]{26}$/.test(price.productId) ||
        ids.has(price.priceId) || !/^[1-9][0-9]*$/.test(price.amount) || !Number.isSafeInteger(Number(price.amount)) ||
        !['month','year'].includes(price.interval) || !Number.isInteger(product.graceDays) || product.graceDays<0 || product.graceDays>30 ||
        typeof product.name!=='string' || typeof product.description!=='string' || !product.limits ||
        !Number.isInteger(product.limits.users) || product.limits.users<1 ||
        Object.values(product.limits).some(n=>!Number.isInteger(n)||n<1)) throw new Error('invalid_product_catalog');
    ids.add(price.priceId);
    plans[key]=Object.freeze({...price,scope:product.scope,name:product.name,description:product.description,
      limits:Object.freeze({...product.limits}),graceDays:product.graceDays});
  }
  return Object.freeze(plans);
}
export const PLANS = buildCatalog(PRODUCTS, PRICE_DEFINITIONS);
export function publicCatalog(plans=PLANS) {
  return Object.entries(plans).map(([key,p])=>({key,product:p.product,name:p.name,description:p.description,
    scope:p.scope,limits:p.limits,priceId:p.priceId,amount:Number(p.amount),interval:p.interval,currency:'USD'}));
}
export function assertItem(data, plan) {
  const item = data.items?.[0], price = item?.price;
  if (data.items?.length !== 1 || item.quantity !== 1 || item.proration || !price ||
      price.id !== plan.priceId || price.product_id !== plan.productId ||
      price.unit_price?.amount !== plan.amount || price.unit_price?.currency_code !== 'USD' ||
      data.currency_code !== 'USD' || price.tax_mode !== 'external' || price.trial_period !== null ||
      price.billing_cycle?.interval !== plan.interval || price.billing_cycle?.frequency !== 1 ||
      price.unit_price_overrides?.length || data.discount || data.discount_id) throw new Error('catalog_mismatch');
}
