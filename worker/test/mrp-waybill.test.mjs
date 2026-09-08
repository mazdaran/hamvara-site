import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMrpRequest } from '../src/mrp.js';

async function keyHash(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Buffer.from(digest).toString('base64url');
}

test('waybill recognition uses document OCR before structured extraction',async()=>{
  const accessKey='abcdefghijklmnopqrstuvwxyzABCDEF123456';
  let convertedFile;
  let modelCall;
  const env={
    DB:{prepare(sql){return{bind(){return this},async first(){
      if(sql.includes('JOIN mrp_users'))return{workspace_id:'w1',slug:'factory',name:'Factory',user_id:'u1',username:'owner',role:'CEO',access_key_hash:await keyHash(accessKey)};
      if(sql.includes('SELECT state_json'))return{state_json:JSON.stringify({skus:[{code:'SKU-001'}]})};
      return null;
    },async run(){return{success:true}}}}},
    AI:{
      async toMarkdown(file){convertedFile=file;return{format:'markdown',data:'INV-77 | Steel | SKU-001 | 12 | KG'}},
      async run(model,input){modelCall={model,input};return{response:'{"documentNo":"INV-77","supplier":"Test","rows":[{"description":"Steel","sku":"SKU-001","qty":12,"unit":"KG","batchNo":"","expiryDate":""}]}'}}
    }
  };
  const request=new Request('https://example.test/api/mrp/waybill/analyze',{method:'POST',headers:{'Content-Type':'application/json','X-Hamvara-Workspace':'factory','X-Hamvara-User':'owner','X-Hamvara-Key':accessKey},body:JSON.stringify({fileName:'waybill.png',image:'data:image/png;base64,aGVsbG8='})});
  const response=await handleMrpRequest(request,env,new URL(request.url));
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(convertedFile.name,'waybill.png');
  assert.equal(modelCall.model,'@cf/qwen/qwen3-30b-a3b-fp8');
  assert.match(modelCall.input.messages[1].content,/INV-77/);
  assert.equal(body.rows[0].sku,'SKU-001');
  assert.equal(body.rows[0].qty,12);
  assert.equal(body.ocr,'markdown-conversion');
});
