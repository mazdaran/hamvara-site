window.HAMVARA_MRP_CONFIG = {
  apiBase: new URLSearchParams(location.search).get('local') === '1' ? '' : 'https://hamvara-growth-api.yahya-mazdarani.workers.dev'
};
