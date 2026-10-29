'use client';
import {cleanAttribution,NEXOOL_PIXEL_ID,type CheckoutTracking} from './checkout-tracking';
type Fbq=((...args:unknown[])=>void)&{callMethod?:(...args:unknown[])=>void;queue:unknown[][];push?:Fbq;loaded:boolean;version:string};
type PixelWindow=Window&{fbq?:Fbq;_fbq?:Fbq};
let ready:Promise<boolean>|undefined;
const sent=new Set<string>();
function safePage(){const params=new URLSearchParams(location.search);return location.hostname==='checkout.nexool.shop'&&!location.hash&&[...params.keys()].every(k=>k==='lang');}
function status(value:string){document.documentElement.dataset.nexoolPixelStatus=value;}
function restoreCookie(name:string,value:string|undefined){
 if(!value)return;
 const remaining=90*86400-Math.floor((Date.now()-Number(value.split('.')[2]))/1000);
 if(remaining>0&&remaining<=90*86400)document.cookie=`${name}=${value}; Path=/; Max-Age=${remaining}; SameSite=Lax; Secure`;
}
function initialize(data:CheckoutTracking){
 if(ready)return ready;
 ready=new Promise<boolean>(resolve=>{
  const w=window as PixelWindow,attribution=cleanAttribution(data.attribution);
  restoreCookie('_fbp',attribution.Parkour_fbp);restoreCookie('_fbc',attribution.Parkour_fbc);
  if(!w.fbq){
   const fbq: Fbq=Object.assign(function(...args:unknown[]){if(fbq.callMethod)fbq.callMethod(...args);else fbq.queue.push(args);},{queue:[] as unknown[][],loaded:true,version:'2.0'});
   fbq.push=fbq;w.fbq=fbq;w._fbq??=fbq;
  }
  // Do not allow automatic form/button collection on a payment page.
  w.fbq('set','autoConfig',false,NEXOOL_PIXEL_ID);
  w.fbq('init',NEXOOL_PIXEL_ID,attribution.Parkour_external_id?{external_id:attribution.Parkour_external_id}:{});
  status('loading');
  const script=document.createElement('script');script.async=true;script.src='https://connect.facebook.net/en_US/fbevents.js';script.referrerPolicy='no-referrer';
  let finished=false;
  const finish=(ok:boolean)=>{if(finished)return;finished=true;clearTimeout(timeout);status(ok?'ready':'unavailable');resolve(ok);};
  const timeout=setTimeout(()=>finish(false),12000);
  script.onload=()=>finish(true);script.onerror=()=>finish(false);
  document.head.appendChild(script);
 });
 return ready;
}
export async function trackCheckoutEvent(data:CheckoutTracking|undefined,name:'InitiateCheckout'|'Purchase'){
 try{
  if(!data||data.pixelId!==NEXOOL_PIXEL_ID||data.attribution.marketingAllowed!==true){status('consent-required');return false;}
  // Meta records the page URL. Never load it while a bearer token/cart is in that URL.
  if(!safePage()){status('private-url');return false;}
  const event=name==='Purchase'?data.purchase:data.checkout;if(!event)return false;
  const marker=`nexool.meta.v1.${event.eventId}`;
  if(sent.has(marker))return false;
  try{if(localStorage.getItem(marker))return false;}catch{/* In-memory and eventID deduplication remain available. */}
  if(!await initialize(data)||!safePage()||sent.has(marker))return false;
  const {eventId,...params}=event;
  (window as PixelWindow).fbq!('trackSingle',NEXOOL_PIXEL_ID,name,params,{eventID:eventId});
  sent.add(marker);try{localStorage.setItem(marker,'sent');}catch{/* Storage denial must never interrupt checkout. */}
  document.documentElement.dataset.nexoolPixelEvent=name;
  return true;
 }catch{status('unavailable');return false;}
}
