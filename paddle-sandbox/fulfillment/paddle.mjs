import { HttpError } from './auth.mjs';
export function makePaddle(apiKey, request = fetch) {
  if(!apiKey) return null;
  if(!/^pdl_sdbx_apikey_/.test(apiKey)) throw new HttpError(503,'sandbox_api_key_required');
  async function call(path, method='GET', body) {
    const response=await request(`https://sandbox-api.paddle.com${path}`, {
      method, headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}), signal:AbortSignal.timeout(15000), redirect:'error'
    });
    // Never echo upstream errors: they can contain metadata or credentials.
    if(!response.ok) throw new HttpError(502,'sandbox_paddle_request_failed');
    const result=await response.json();
    if(!result.data) throw new HttpError(502,'sandbox_paddle_response_invalid');
    return result;
  }
  return {
    listAdjustments:(transactionId,after)=>call('/adjustments?'+new URLSearchParams({transaction_id:transactionId,per_page:'30',...(after?{after}:{})})),
    createTransaction:async body=>(await call('/transactions','POST',body)).data,
    getTransaction:async id=>(await call(`/transactions/${encodeURIComponent(id)}`)).data,
    getSubscription:async id=>(await call(`/subscriptions/${encodeURIComponent(id)}`)).data,
    listCompletedTransactions:(subscriptionId,after)=>call('/transactions?'+new URLSearchParams({subscription_id:subscriptionId,status:'completed',per_page:'30',...(after?{after}:{})}))
  };
}
