import test from 'node:test';
import assert from 'node:assert/strict';
import {addressFromPlace,addressRows,addressRules,normalizeProvince} from '../lib/address-rules';
import {addressSchema,assertReviewedOrder,type Session} from '../lib/model';
import {placeProof,suggestPlaces,resolvePlace} from '../lib/places';
const component=(type:string,longText:string,shortText=longText)=>({types:[type],longText,shortText});
const base={email:'buyer@example.com',firstName:'',lastName:'Customer',address1:'1 Main Street',address2:'',city:'Los Angeles',provinceCode:'CA',zip:'90001',countryCode:'US',phone:''};

test('country-specific fields support states, prefectures, postcodes and countries without postal codes',()=>{
 assert(addressSchema.safeParse(base).success);assert(!addressSchema.safeParse({...base,zip:''}).success);
 assert(!addressSchema.safeParse({...base,provinceCode:'NOT-A-STATE'}).success);
 assert(addressSchema.safeParse({...base,countryCode:'AE',city:'Dubai',provinceCode:'DU',zip:''}).success);
 assert.equal(addressRules('AE').zip,false);assert.equal(addressRules('FR').province,false);
 assert(addressRows('JP').findIndex(r=>r.includes('zip'))<addressRows('JP').findIndex(r=>r.includes('address1')));
 assert.deepEqual(addressRows('FR').find(r=>r.includes('zip')),['zip','city']);
});
test('address suggestions preserve international street order and Shopify province codes',()=>{
 const german=addressFromPlace([component('country','Germany','DE'),component('route','Friedrichstraße'),component('street_number','12'),component('locality','Berlin'),component('postal_code','10117')],'DE');
 assert.equal(german.address1,'Friedrichstraße 12');assert.equal(german.city,'Berlin');assert.equal(german.provinceCode,'');
 const american=addressFromPlace([component('country','United States','US'),component('route','Main Street'),component('street_number','12'),component('locality','Los Angeles'),component('administrative_area_level_1','California','CA'),component('postal_code','90001'),component('postal_code_suffix','1234'),component('subpremise','4B')],'US');
 assert.equal(american.address1,'12 Main Street');assert.equal(american.provinceCode,'CA');assert.equal(american.zip,'90001-1234');assert.equal(american.address2,'4B');
 assert.equal(normalizeProvince('JP','Tokyo'),'JP-13');assert.equal(normalizeProvince('AE','Dubai'),'DU');
});
test('address resolution rejects a country mismatch instead of changing the market silently',()=>{
 assert.throws(()=>addressFromPlace([component('country','United States','US')],'CA'),/selected country/);
 assert.equal(normalizeProvince('US','unknown'),'');
});
test('UK addresses use postal town and do not require a county',()=>{
 const address=addressFromPlace([component('country','United Kingdom','GB'),component('route','Euston Road'),component('street_number','96'),component('postal_town','London'),component('postal_code','NW1 2DB'),component('administrative_area_level_1','England','ENG')],'GB');
 assert.equal(address.city,'London');assert.equal(address.provinceCode,'');assert(addressSchema.safeParse({...base,...address}).success);
});
test('suggestion tokens are scoped to the checkout, country and search session',async t=>{
 process.env.GOOGLE_PLACES_API_KEY='test-key-not-real';let request:any;
 t.mock.method(globalThis,'fetch',async(_url:any,options:any)=>{request=JSON.parse(options.body);return Response.json({suggestions:[{placePrediction:{placeId:'place_test',text:{text:'12 Main Street'},structuredFormat:{mainText:{text:'12 Main Street'},secondaryText:{text:'Los Angeles'}}}}]});});
 const results=await suggestPlaces('12 Main','US','session-1','checkout-1');
 assert.deepEqual(request.includedRegionCodes,['us']);assert.equal(request.sessionToken,'session-1');assert.equal(results.length,1);
 assert.equal(results[0].proof,placeProof('checkout-1','session-1','US','place_test'));
 assert.notEqual(results[0].proof,placeProof('checkout-2','session-1','US','place_test'));assert.notEqual(results[0].proof,placeProof('checkout-1','session-1','CA','place_test'));
});
test('provider failure exposes no API key and permits a manual-entry fallback',async t=>{
 process.env.GOOGLE_PLACES_API_KEY='test-key-not-real';t.mock.method(globalThis,'fetch',async()=>Response.json({error:'sensitive provider response'},{status:403}));
 await assert.rejects(()=>resolvePlace('place_test','US','session-1'),/Enter your address manually/);
});
test('payment preparation refuses stale totals and stale delivery details from another tab',()=>{
 const s={address:base,quote:{total:'43.95',currency:'USD',shippingHandle:'standard',discountCode:''}} as Session;
 const input={address:base,total:'43.95',currency:'USD',shippingHandle:'standard',discountCode:''};
 assertReviewedOrder(s,input);
 for(const altered of [{total:'39.00'},{currency:'EUR'},{shippingHandle:'express'},{address:{...base,address1:'Different street'}},{discountCode:'NEW'}])assert.throws(()=>assertReviewedOrder(s,{...input,...altered}),/changed/);
});
