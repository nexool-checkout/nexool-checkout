import {unwrapWebhook} from '@whop/sdk/helpers';

export class WhopWebhookError extends Error {
 constructor(message:string,public status:number){super(message);this.name='WhopWebhookError';}
}
type Envelope={api_version?:unknown;account_id?:unknown;company_id?:unknown;id?:unknown;type?:unknown;data?:unknown};
export type VerifiedWhopWebhook={kind:'ignored';eventType:string}|{kind:'payment';paymentId:string;deliveryId:string};

/** Accept both documented v1 envelope account fields after verifying the original signed bytes. */
export function verifyWhopWebhook(raw:string,headers:Record<string,string>,key:string,expectedAccount:string):VerifiedWhopWebhook{
 let parsed:unknown;
 try{parsed=unwrapWebhook<unknown>(raw,{headers,key});}catch{throw new WhopWebhookError('Invalid signature',401);}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new WhopWebhookError('Invalid webhook payload',400);
 const event=parsed as Envelope;
 if(event.api_version!=='v1')throw new WhopWebhookError('Unsupported webhook version; use v1',400);
 // An unpinned v1 webhook carries company_id. Dated v1 webhooks carry account_id.
 // Never use data.account_id as the envelope identity, and reject conflicting identities.
 const identities=[event.account_id,event.company_id].filter(value=>value!==undefined&&value!==null);
 if(!identities.length||identities.some(value=>typeof value!=='string'||value!==expectedAccount))throw new WhopWebhookError('Wrong account',400);
 if(typeof event.type!=='string')throw new WhopWebhookError('Invalid webhook event',400);
 if(event.type!=='payment.succeeded')return {kind:'ignored',eventType:event.type};
 const data=event.data;
 if(!data||typeof data!=='object'||Array.isArray(data)||!('id' in data)||typeof data.id!=='string'||!/^pay_\w+$/.test(data.id))throw new WhopWebhookError('Invalid payment',400);
 const deliveryId=headers['webhook-id'];
 if(!deliveryId||(event.id!==undefined&&event.id!==deliveryId))throw new WhopWebhookError('Invalid webhook identity',400);
 return {kind:'payment',paymentId:data.id,deliveryId};
}
