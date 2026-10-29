import test from 'node:test';
import assert from 'node:assert/strict';
import {trackCheckoutEvent} from '../lib/meta-pixel';
import {checkoutToken,rememberCheckoutToken} from '../lib/browser-session';
import {NEXOOL_PIXEL_ID,type CheckoutTracking} from '../lib/checkout-tracking';
test('browser events respect consent, hide bearer URLs and deduplicate paid orders',async t=>{
 const calls:unknown[][]=[],cookies:string[]=[],scripts:any[]=[],values=new Map<string,string>();
 const loc={hostname:'checkout.nexool.shop',search:'?session=secret',hash:''};
 const fbq=Object.assign((...args:unknown[])=>{calls.push(args);},{queue:[],loaded:true,version:'2.0'});
 const doc={documentElement:{dataset:{} as Record<string,string>},createElement:()=>({}),head:{appendChild:(script:any)=>{scripts.push(script);queueMicrotask(()=>script.onload());}},set cookie(value:string){cookies.push(value);}};
 const storage={getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 for(const [name,value] of Object.entries({window:{fbq},location:loc,document:doc,localStorage:storage,sessionStorage:storage,history:{replaceState:(_a:any,_b:any,url:string)=>{loc.search=new URL(url,'https://checkout.nexool.shop').search;loc.hash='';}}})){
  const old=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{value,configurable:true});t.after(()=>{if(old)Object.defineProperty(globalThis,name,old);else delete (globalThis as any)[name];});
 }
 const event={eventId:'nexool_purchase_test',order_id:'test',value:82.95,currency:'EUR',content_type:'product' as const,content_ids:['123'],contents:[{id:'123',quantity:1,item_price:82.95}],num_items:1};
 const data:CheckoutTracking={pixelId:NEXOOL_PIXEL_ID,attribution:{marketingAllowed:true,Parkour_fbp:`fb.1.${Date.now()}.123`},checkout:{...event,eventId:'nexool_checkout_test'},purchase:event};
 assert.equal(await trackCheckoutEvent(data,'Purchase'),false);assert.equal(scripts.length,0);assert.equal(doc.documentElement.dataset.nexoolPixelStatus,'private-url');
 assert.equal(rememberCheckoutToken('secret','/return?lang=fr'),true);assert.equal(checkoutToken(),'secret');
 assert.equal(await trackCheckoutEvent({...data,attribution:{marketingAllowed:false}},'Purchase'),false);assert.equal(scripts.length,0);
 assert.equal(await trackCheckoutEvent({...data,purchase:null},'Purchase'),false);assert.equal(calls.length,0);
 const sent=await Promise.all([trackCheckoutEvent(data,'Purchase'),trackCheckoutEvent(data,'Purchase')]);assert.deepEqual(sent.sort(),[false,true]);
 assert.equal(scripts.length,1);assert.equal(scripts[0].referrerPolicy,'no-referrer');assert.equal(cookies.length,1);
 const purchases=calls.filter(c=>c[0]==='trackSingle'&&c[2]==='Purchase');assert.equal(purchases.length,1);assert.deepEqual(purchases[0].slice(0,3),['trackSingle',NEXOOL_PIXEL_ID,'Purchase']);assert.deepEqual(purchases[0][4],{eventID:'nexool_purchase_test'});
 assert.equal(JSON.stringify(calls).includes('secret'),false);assert.equal(await trackCheckoutEvent(data,'Purchase'),false);
 assert.equal(await trackCheckoutEvent(data,'InitiateCheckout'),true);
 assert.equal(await trackCheckoutEvent(data,'InitiateCheckout'),false);
 loc.hash='#cart=new';assert.equal(checkoutToken(),null);
});
