import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyWhopWebhook,WhopWebhookError} from '../lib/whop-webhook';

const key='ws_unit_test_key_only',account='biz_test',id='msg_unit_test';
function signed(fields:Record<string,unknown>,timestamp=String(Math.floor(Date.now()/1000))){
 const raw=JSON.stringify({id,api_version:'v1',type:'payment.succeeded',data:{id:'pay_test'},...fields});
 const headers={'webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':'v1,'+createHmac('sha256',key).update(`${id}.${timestamp}.${raw}`).digest('base64')};
 return {raw,headers};
}
function verify(fields:Record<string,unknown>){const {raw,headers}=signed(fields);return verifyWhopWebhook(raw,headers,key,account);}

test('current signed v1 account_id payments are accepted',()=>{
 assert.deepEqual(verify({account_id:account,api_version_date:'2026-10-07-1'}),{kind:'payment',paymentId:'pay_test',deliveryId:id});
});
test('unpinned signed v1 company_id payments are accepted',()=>{
 assert.deepEqual(verify({company_id:account,api_version_date:null}),{kind:'payment',paymentId:'pay_test',deliveryId:id});
});
test('the reported unpinned domain event is acknowledged without payment processing',()=>{
 assert.deepEqual(verify({company_id:account,api_version_date:null,type:'domain.created',data:{id:'dom_test',account_id:account,apple_pay:{state:'action_required'}}}),{kind:'ignored',eventType:'domain.created'});
});
test('wrong, missing, malformed and conflicting envelope accounts are rejected',()=>{
 for(const fields of [{},{account_id:'biz_other'},{company_id:'biz_other'},{account_id:account,company_id:'biz_other'},{account_id:'biz_other',company_id:account},{account_id:''},{account_id:0},{account_id:{}},{account_id:null,data:{id:'pay_test',account_id:account}}])assert.throws(()=>verify(fields),error=>error instanceof WhopWebhookError&&error.status===400&&error.message==='Wrong account');
 assert.equal(verify({account_id:account,company_id:account}).kind,'payment');
 assert.equal(verify({account_id:null,company_id:account}).kind,'payment');
});
test('legacy unsigned-format versions and malformed payment data are rejected',()=>{
 for(const fields of [{account_id:account,api_version:'v2'},{account_id:account,api_version:'v5'},{account_id:account,data:null},{account_id:account,data:{id:'dom_wrong'}},{account_id:account,type:null},{account_id:account,id:'msg_other'}])assert.throws(()=>verify(fields),error=>error instanceof WhopWebhookError&&error.status===400);
});
test('signature verification precedes all account and event handling',()=>{
 const {raw,headers}=signed({company_id:account});
 for(const [body,meta,secret] of [[raw+' ',headers,key],[raw,headers,'ws_wrong_key'],[raw,{},key]] as const)assert.throws(()=>verifyWhopWebhook(body,meta,secret,account),error=>error instanceof WhopWebhookError&&error.status===401);
 const stale=signed({company_id:account},'100');assert.throws(()=>verifyWhopWebhook(stale.raw,stale.headers,key,account),error=>error instanceof WhopWebhookError&&error.status===401);
});
