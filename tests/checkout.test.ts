import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {unwrapWebhook} from '@whop/sdk/helpers';
import {cartSchema,moneyMinor,sameMoney,mergeItems,type Session} from '../lib/model';
import {validatePayment} from '../lib/whop';
import {sameOrigin,equal,hash} from '../lib/security';
import {draftInput,getCart,completeDraft} from '../lib/shopify';
import type {Whop} from '@whop/sdk';
process.env.APP_URL='https://checkout.nexool.shop';
process.env.WHOP_BUSINESS_ID='biz_test';
process.env.SHOPIFY_SHOP_DOMAIN='test.myshopify.com';
process.env.SHOPIFY_CLIENT_ID='test';process.env.SHOPIFY_CLIENT_SECRET='test';process.env.WHOP_ENABLED_CURRENCIES='USD,EUR,JPY,KWD';
const s={id:'a-session',whop_quote_id:'pq_test',payment_id:null,quote:{total:'29.90',currency:'EUR'}} as Session;
const p={id:'pay_test',account_id:'biz_test',metadata:{nexool_session:'a-session'},quote_id:'pq_test',total:{amount:'29.90',currency:'eur'},presentment_total:null,auto_refunded:false,refunded_amount:null,refunded_at:null} as unknown as Whop.Payment;
test('currency precision preserves EUR, JPY and KWD without silent rounding',()=>{assert.equal(moneyMinor('29.90',2),2990);assert.equal(moneyMinor('1500',0),1500);assert.equal(moneyMinor('2.345',3),2345);assert.throws(()=>moneyMinor('2.345',2));assert.throws(()=>moneyMinor('-1',2));assert(sameMoney('29.9','29.900'));});
test('browser cannot submit its own price or negative/oversized quantities',()=>{assert.throws(()=>cartSchema.parse({country:'US',items:[{variantId:'1',quantity:1,price:0.01}]}));assert.throws(()=>cartSchema.parse({country:'US',items:[{variantId:'1',quantity:-1}]}));assert.throws(()=>mergeItems([{variantId:'1',quantity:20},{variantId:'1',quantity:1}]));assert.deepEqual(mergeItems([{variantId:'1',quantity:2},{variantId:'1',quantity:3}]),[{variantId:'1',quantity:5}]);});
test('payment reconciliation rejects wrong merchant, session, quote, amount and currency',()=>{validatePayment(p,s);for(const altered of [{account_id:'biz_other'},{metadata:{nexool_session:'other'}},{quote_id:'pq_other'},{total:{amount:'0.01',currency:'eur'}},{total:{amount:'29.90',currency:'usd'}},{auto_refunded:true}])assert.throws(()=>validatePayment({...p,...altered} as Whop.Payment,s));assert.throws(()=>validatePayment(p,{...s,payment_id:'pay_other'}));});
test('presentment currency, not settlement currency, determines amount reconciliation',()=>{validatePayment({...p,total:{amount:'33.00',currency:'usd'},presentment_total:{amount:'29.90',currency:'eur'}} as Whop.Payment,s);});
test('webhook signature verifies raw bytes and rejects tampering and stale events',()=>{const key='ws_test_secret_only',payload=JSON.stringify({type:'payment.succeeded',data:{id:'pay_test'}}),id='msg_test';const sign=(timestamp:string)=>({'webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':'v1,'+createHmac('sha256',key).update(`${id}.${timestamp}.${payload}`).digest('base64')});const headers=sign(String(Math.floor(Date.now()/1000)));assert.equal(unwrapWebhook<any>(payload,{headers,key}).data.id,'pay_test');assert.throws(()=>unwrapWebhook(payload+' ',{headers,key}));assert.throws(()=>unwrapWebhook(payload,{headers:sign('100'),key}));});
test('checkout mutations require the configured origin',()=>{sameOrigin(new Request('https://checkout.nexool.shop/api/pay',{headers:{origin:'https://checkout.nexool.shop'}}));assert.throws(()=>sameOrigin(new Request('https://checkout.nexool.shop/api/pay',{headers:{origin:'https://evil.example'}})));assert(!equal('abc','abcd'));assert.equal(hash('test').length,64);});
test('Shopify contextual price overrides come from fetched catalogue, not client price',()=>{const input=draftInput([{variantId:'1',quantity:2,title:'Product',variantTitle:'',image:null,price:{amount:'19.50',currencyCode:'EUR'},requiresShipping:true}],{email:'buyer@example.com',firstName:'A',lastName:'B',address1:'1 Street',address2:'',city:'Paris',provinceCode:'',zip:'75001',countryCode:'FR',phone:''});assert.deepEqual(input.lineItems[0].priceOverride,{amount:'19.50',currencyCode:'EUR'});assert.equal(input.presentmentCurrencyCode,'EUR');assert.equal('taxExempt' in input,false);});
test('catalogue rejects unavailable inventory and disabled markets',async(t)=>{
 const variant={id:'gid://shopify/ProductVariant/1',title:'Default Title',availableForSale:true,inventoryQuantity:2,inventoryPolicy:'DENY',inventoryItem:{tracked:true,requiresShipping:true},product:{title:'Example',status:'ACTIVE',requiresSellingPlan:false},contextualPricing:{price:{amount:'10.00',currencyCode:'EUR'}}};
 let active=true;
 t.mock.method(globalThis,'fetch',async(url:any)=>String(url).includes('oauth')?Response.json({access_token:'test',expires_in:86400}):Response.json({data:{marketByGeography:{status:active?'ACTIVE':'DRAFT'},nodes:[variant]}}));
 const rows=await getCart({country:'FR',items:[{variantId:'1',quantity:1}]});assert.equal(rows[0].price.currencyCode,'EUR');
 await assert.rejects(()=>getCart({country:'FR',items:[{variantId:'1',quantity:3}]}),/unavailable/);
 active=false;await assert.rejects(()=>getCart({country:'FR',items:[{variantId:'1',quantity:1}]}),/not enabled/);
});
test('already-completed draft is reused instead of creating a duplicate order',async(t)=>{
 let mutations=0;t.mock.method(globalThis,'fetch',async(_url:any,options:any)=>{if(String(_url).includes('oauth'))return Response.json({access_token:'test',expires_in:86400});const {query}=JSON.parse(options.body);if(query.includes('mutation'))mutations++;return Response.json({data:{draftOrder:{order:{id:'gid://shopify/Order/123',statusPageUrl:'https://test.myshopify.com/orders/example'}}}});});
 const order=await completeDraft({...s,draft_id:'gid://shopify/DraftOrder/1'});assert.equal(order.id,'gid://shopify/Order/123');assert.equal(mutations,0);
});

