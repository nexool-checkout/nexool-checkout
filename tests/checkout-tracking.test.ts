import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanAttribution,orderAttribution,checkoutTracking,NEXOOL_PIXEL_ID} from '../lib/checkout-tracking';
import {cartSchema,type Session} from '../lib/model';
import {createDraft} from '../lib/shopify';
const attribution={marketingAllowed:true,Parkour_external_id:'CID-12345-abc',Parkour_fbp:'fb.1.1793280000000.12345',Parkour_fbc:'fb.1.1793280000000.Real_Click-AQY'};
const session={id:'00000000-0000-4000-8000-000000000001',attribution,country:'FR',currency:'EUR',cart:[{variantId:'123',quantity:2,title:'Pillow',variantTitle:'',price:{amount:'41.475',currencyCode:'EUR'},requiresShipping:true,image:null}],quote:{currency:'EUR',total:'87.90',shippingHandle:'shipping'},payment_id:'pay_verified',order_id:'gid://shopify/Order/1234',status:'complete',address:{email:'private@example.com',lastName:'Buyer',address1:'Private address',city:'Paris',zip:'75001',countryCode:'FR'},expires_at:'2099-01-01T00:00:00Z'} as Session;
test('only allowed Parkour identifiers survive a checkout handoff, unchanged',()=>{
 const input=cartSchema.parse({country:'FR',currency:'EUR',items:[{variantId:'123',quantity:1}],attribution:{...attribution,email:'secret@example.com',token:'secret',price:0.01,glang:'fr'}});
 assert.deepEqual(input.attribution,attribution);
 assert.deepEqual(orderAttribution(session.id,input.attribution),[{key:'nexool_session',value:session.id},...Object.entries(attribution).filter(([k])=>k.startsWith('Parkour_')).map(([key,value])=>({key,value}))]);
 assert.throws(()=>cartSchema.parse({country:'FR',items:[{variantId:'123',quantity:1,price:1}]}));
});
test('missing, denied, malformed and oversized attribution never grants consent or blocks checkout',()=>{
 for(const bad of [undefined,null,[],{},false,{...attribution,marketingAllowed:false},{...attribution,marketingAllowed:'true'}])assert.equal(Object.keys(cleanAttribution(bad)).filter(k=>k.startsWith('Parkour')).length,0);
 assert.deepEqual(cleanAttribution({marketingAllowed:true,Parkour_external_id:'bad; cookie=1',Parkour_fbc:'x'.repeat(2000)}),{marketingAllowed:true});
 assert.equal(cartSchema.safeParse({country:'FR',items:[{variantId:'123',quantity:1}],attribution:'invalid'}).success,true);
});
test('Purchase exists only after verified payment and completed Shopify order',()=>{
 for(const status of ['cart','quoted','ready','paying','payment_pending','payment_unknown','syncing','needs_review','needs_configuration'])assert.equal(checkoutTracking({...session,status}).purchase,null,status);
 for(const patch of [{order_id:null},{payment_id:null},{order_id:'not-an-order'},{quote:null},{quote:{...session.quote!,currency:'USD'}},{quote:{...session.quote!,total:'NaN'}}])assert.equal(checkoutTracking({...session,...patch}).purchase,null);
});
test('purchase uses server currency, final charged total and stable order ID',()=>{
 const data=checkoutTracking(session);assert.equal(data.pixelId,NEXOOL_PIXEL_ID);assert.equal(data.checkout?.value,82.95);assert.equal(data.purchase?.value,87.90);assert.equal(data.purchase?.currency,'EUR');assert.equal(data.purchase?.eventId,'nexool_purchase_1234');assert.equal(data.purchase?.num_items,2);
 assert.equal(JSON.stringify(data).includes('private@example.com'),false);assert.equal(JSON.stringify(data).includes('Private address'),false);
 assert.deepEqual(checkoutTracking(session).purchase,data.purchase);
 for(const currency of ['USD','JPY','KWD'])assert.equal(checkoutTracking({...session,currency,quote:{...session.quote!,currency}}).purchase?.currency,currency);
});
test('old sessions remain usable without fabricating attribution',()=>{const data=checkoutTracking({...session,attribution:undefined});assert.deepEqual(data.attribution,{});assert.deepEqual(orderAttribution(session.id,undefined),[{key:'nexool_session',value:session.id}]);});
test('Shopify draft receives the original attribution without changing payment or prices',async t=>{
 process.env.SHOPIFY_SHOP_DOMAIN='test.myshopify.com';process.env.SHOPIFY_CLIENT_ID='test';process.env.SHOPIFY_CLIENT_SECRET='test';
 let input:any;t.mock.method(globalThis,'fetch',async(url:any,options:any)=>{if(String(url).includes('oauth'))return Response.json({access_token:'test'});input=JSON.parse(options.body).variables.input;return Response.json({data:{draftOrderCreate:{draftOrder:{id:'draft',totalPriceSet:{presentmentMoney:{amount:'87.90'}},presentmentCurrencyCode:'EUR'},userErrors:[]}}});});
 await createDraft(session,'');assert.deepEqual(input.customAttributes,orderAttribution(session.id,attribution));assert.deepEqual(input.lineItems[0].priceOverride,session.cart[0].price);assert.equal(input.presentmentCurrencyCode,'EUR');
});
