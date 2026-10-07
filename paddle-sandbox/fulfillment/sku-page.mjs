// Only the loopback server injects the existing sandbox payment adapter.
export function renderSkuPage(source) {
  const marker='<!-- SKU_ACCESS_ADAPTER -->';
  if(source.split(marker).length!==2)throw Error('sku_page_contract_changed');
  return source.replace(marker,'<script src="/paddle-sandbox/sku-access.js"></script>');
}
