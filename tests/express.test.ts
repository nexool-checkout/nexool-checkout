import test from 'node:test';
import assert from 'node:assert/strict';
import {expressLocationSchema,assertWalletQuote,quoteMinor,subtotalMinor,walletDelivery,walletLocation,walletLineItems,walletShippingOptions,sameWalletDelivery,walletCancelled,walletEmail} from '../lib/express';
import {draftInput} from '../lib/shopify';
import type {Address,Quote,Item} from '../lib/model';
const quote:Quote={currency:'USD',subtotal:'39.00',total:'43.95',tax:'0.00',shipping:'4.95',discount:'0',taxesIncluded:false,rates:[{handle:'standard',title:'Standard',price:{amount:'4.95',currencyCode:'USD'}},{handle:'express',title:'Express',price:{amount:'9.95',currencyCode:'USD'}}],shippingHandle:'standard',warnings:[]};
const address:Address={email:'customer@example.com',firstName:'Alex',lastName:'Sample',address1:'123 Example Street',address2:'',city:'Los Angeles',provinceCode:'CA',zip:'90001',countryCode:'US',phone:''};
test('wallet pricing rejects changed totals, currencies, shipping options and unsafe amounts',()=>{
 assert.doesNotThrow(()=>assertWalletQuote(quote,'usd',4395,'standard'));
 for(const [currency,amount,shipping] of [['EUR',4395,'standard'],['USD',4394,'standard'],['USD',4395,'express'],['USD',0,'standard'],['USD',NaN,'standard']] as const)assert.throws(()=>assertWalletQuote(quote,currency,amount,shipping));
});
test('wallet totals preserve zero and three decimal currency precision',()=>{
 assert.equal(quoteMinor({...quote,currency:'JPY',total:'1500'}),1500);assert.equal(quoteMinor({...quote,currency:'KWD',total:'2.345'}),2345);
 const cart=[{price:{amount:'0.10',currencyCode:'USD'},quantity:3}] as Item[];assert.equal(subtotalMinor(cart,'USD'),30);assert.throws(()=>quoteMinor({...quote,total:'2.345'}));
});
test('shipping options put the priced option first so the native default matches the total',()=>{
 const q={...quote,total:'48.95',shipping:'9.95',shippingHandle:'express'};assert.equal(walletShippingOptions(q)[0].id,'express');assert.equal(walletShippingOptions(q)[0].amount,995);
});
test('tax-inclusive wallet breakdowns do not add tax twice',()=>{
 const inclusive={...quote,subtotal:'39',tax:'6.50',taxesIncluded:true};assert.equal(walletLineItems(inclusive).reduce((n,item)=>n+item.amount,0),4395);
 assert.deepEqual(walletLineItems({...quote,total:'42.00'}),[{label:'Order total',amount:4200}]);
});
test('redacted wallet addresses stay partial and cannot inject a browser price',()=>{
 const partial=walletLocation({country:'US',state:'California',city:'Los Angeles',postal_code:'90001'});assert.equal(partial.provinceCode,'CA');assert.equal(partial.address1,undefined);
 assert.throws(()=>expressLocationSchema.parse({...partial,total:'0.01'}));
 const input=draftInput([{variantId:'1',quantity:1,price:{amount:'39',currencyCode:'USD'}} as Item],partial);
 assert.equal(input.email,undefined);assert.equal(input.shippingAddress.address1,undefined);assert.equal(input.shippingAddress.lastName,undefined);
});
test('only a matching known address fills a wallet-redacted street and postal suffix',()=>{
 assert.equal(walletLocation({country:'US',state:'US-CA',city:'Los Angeles',postal_code:'90001'},address).address1,address.address1);
 assert.equal(walletLocation({country:'US',state:'CA',city:'San Diego',postal_code:'92101'},address).address1,undefined);
 assert.throws(()=>walletLocation({country:'['}));
});
test('full wallet contacts normalize international regions and refuse incomplete shipping',()=>{
 const contact={payer:{email:address.email},shipping:{address:{name:'Alex Sample',line1:address.address1,city:address.city,state:'California',postal_code:'90001',country:'us'}}};
 assert.deepEqual(walletDelivery(contact),address);assert(sameWalletDelivery(walletDelivery(contact),address));assert(!sameWalletDelivery({...address,zip:'90002'},address));
 assert.throws(()=>walletDelivery({payer:{email:address.email},shipping:{address:{country:'US',postal_code:'90001'}}}));
});
test('wallet cancellation is distinguished from a failed charge and valid email is reused',()=>{
 assert(walletCancelled({code:'payment_request_cancelled'}));assert(!walletCancelled({code:'declined'}));assert.equal(walletEmail(' customer@example.com '),'customer@example.com');assert.equal(walletEmail('invalid'),undefined);
});
