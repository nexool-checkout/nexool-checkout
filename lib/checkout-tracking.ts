import type {Session} from './model';

export const NEXOOL_PIXEL_ID='2122225571733453';
export const parkourKeys=['Parkour_external_id','Parkour_fbp','Parkour_fbc'] as const;
export type Attribution=Partial<Record<typeof parkourKeys[number],string>>&{marketingAllowed?:boolean};
export function cleanAttribution(raw:unknown):Attribution {
 const result:Attribution={};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return result;
 const input=raw as Record<string,unknown>;
 if(typeof input.marketingAllowed==='boolean')result.marketingAllowed=input.marketingAllowed;
 if(result.marketingAllowed!==true)return result;
 for(const key of parkourKeys){
  const value=input[key];
  const pattern=key==='Parkour_external_id'?/^[A-Za-z0-9_-]{1,128}$/:/^fb\.\d+\.\d{10,16}\.[A-Za-z0-9_.-]{1,900}$/;
  if(typeof value==='string'&&value.length<=1000&&pattern.test(value))result[key]=value;
 }
 return result;
}
export function orderAttribution(sessionId:string,raw:unknown){
 const attribution=cleanAttribution(raw);
 return [{key:'nexool_session',value:sessionId},...parkourKeys.flatMap(key=>attribution[key]?[{key,value:attribution[key]!}]:[])];
}
export type PixelEvent={eventId:string;value:number;currency:string;content_type:'product';content_ids:string[];contents:{id:string;quantity:number;item_price:number}[];num_items:number;order_id?:string};
export type CheckoutTracking={pixelId:string;attribution:Attribution;checkout:PixelEvent|null;purchase:PixelEvent|null};
export function checkoutTracking(s:Session):CheckoutTracking {
 const attribution=cleanAttribution(s.attribution);
 const contents=s.cart.map(i=>({id:i.variantId,quantity:i.quantity,item_price:Number(i.price.amount)}));
 const subtotal=contents.reduce((sum,i)=>sum+i.quantity*i.item_price,0);
 const valid=contents.length>0&&contents.every(i=>Number.isFinite(i.item_price)&&i.item_price>=0)&&Number.isFinite(subtotal)&&/^[A-Z]{3}$/.test(s.currency);
 const checkout:PixelEvent|null=valid?{eventId:`nexool_checkout_${s.id}`,value:subtotal,currency:s.currency,content_type:'product',content_ids:contents.map(i=>i.id),contents,num_items:contents.reduce((sum,i)=>sum+i.quantity,0)}:null;
 const orderId=s.order_id?.match(/^gid:\/\/shopify\/Order\/(\d+)$/)?.[1];
 // Only the paid-payment reconciliation path can create this completed server record.
 const paid=checkout&&s.status==='complete'&&orderId&&s.payment_id&&s.quote&&s.quote.currency===s.currency&&Number.isFinite(Number(s.quote.total))&&Number(s.quote.total)>=0;
 const purchase:PixelEvent|null=paid?{...checkout!,eventId:`nexool_purchase_${orderId}`,order_id:orderId,value:Number(s.quote!.total),currency:s.quote!.currency}:null;
 return {pixelId:NEXOOL_PIXEL_ID,attribution,checkout,purchase};
}
