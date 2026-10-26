import { z } from 'zod';
import {addressRules} from './address-rules';
export const lineSchema = z.object({variantId:z.string().regex(/^\d{1,20}$/),quantity:z.number().int().min(1).max(20)}).strict();
export const cartSchema = z.object({items:z.array(lineSchema).min(1).max(25),country:z.string().regex(/^[A-Z]{2}$/),currency:z.string().regex(/^[A-Z]{3}$/).optional()}).strict();
export const addressSchema=z.object({email:z.email().max(254),firstName:z.string().trim().max(80).default(''),lastName:z.string().trim().min(1).max(80),address1:z.string().trim().min(3).max(150),address2:z.string().trim().max(150).default(''),city:z.string().trim().max(100).default(''),provinceCode:z.string().trim().max(50).default(''),zip:z.string().trim().max(20).default(''),countryCode:z.string().regex(/^[A-Z]{2}$/),phone:z.string().trim().max(30).default('')}).strict().superRefine((a,ctx)=>{
 const rules=addressRules(a.countryCode);
 for(const [key,needed,label] of [['city',rules.city,rules.cityLabel],['zip',rules.zip,rules.zipLabel],['provinceCode',rules.province&&rules.zones.length>0,rules.provinceLabel]] as const){if(needed&&!a[key])ctx.addIssue({code:'custom',path:[key],message:`Enter your ${label.toLowerCase()}.`});}
 if(rules.province&&rules.zones.length&&a.provinceCode&&!rules.zones.some(z=>z.code===a.provinceCode))ctx.addIssue({code:'custom',path:['provinceCode'],message:'Choose a region from the list.'});
});
export type CartInput=z.infer<typeof cartSchema>;
export type Address=z.infer<typeof addressSchema>;
export type Money={amount:string;currencyCode:string};
export type Item={variantId:string;productId?:string;quantity:number;title:string;variantTitle:string;image:string|null;price:Money;requiresShipping:boolean};
export type Rate={handle:string;title:string;price:Money};
export type Quote={currency:string;subtotal:string;shipping:string;tax:string;discount:string;total:string;taxesIncluded:boolean;rates:Rate[];shippingHandle:string;warnings:string[];discountCode?:string;paymentMinor?:number};
export type Session={id:string;token_hash:string;items:CartInput['items'];country:string;currency:string;cart:Item[];address:Address|null;quote:Quote|null;draft_id:string|null;whop_quote_id:string|null;whop_plan:unknown;payment_id:string|null;payment_attempt_key:string|null;order_id:string|null;order_url:string|null;status:string;last_error:string|null;expires_at:string;created_at:string;updated_at:string};
export const preparationSchema=z.object({total:z.string().regex(/^\d+(\.\d+)?$/),currency:z.string().regex(/^[A-Z]{3}$/),shippingHandle:z.string().max(2000),discountCode:z.string().max(80),address:addressSchema}).strict();
export function assertReviewedOrder(s:Session,input:z.infer<typeof preparationSchema>){
 if(!s.quote||!s.address||!sameMoney(s.quote.total,input.total)||s.quote.currency!==input.currency||s.quote.shippingHandle!==input.shippingHandle||(s.quote.discountCode||'')!==input.discountCode||Object.keys(input.address).some(k=>input.address[k as keyof Address]!==s.address![k as keyof Address]))throw new Error('Your order details changed. Refresh and review the total before paying.');
}
export function moneyMinor(amount:string, decimals:number):number {
  if(!/^\d+(\.\d+)?$/.test(amount)||!Number.isInteger(decimals)||decimals<0||decimals>8)throw new Error('Invalid money');
  const [whole,frac='']=amount.split('.');
  if(frac.slice(decimals).replace(/0/g,''))throw new Error('Unsupported currency precision');
  const value=BigInt(whole)*10n**BigInt(decimals)+BigInt(frac.slice(0,decimals).padEnd(decimals,'0')||'0');
  if(value>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Amount too large');
  return Number(value);
}
export function sameMoney(a:string,b:string):boolean { return moneyMinor(a,8)===moneyMinor(b,8); }
export function mergeItems(items:CartInput['items']):CartInput['items'] {
  const map=new Map<string,number>();for(const i of items)map.set(i.variantId,(map.get(i.variantId)||0)+i.quantity);
  return [...map].map(([variantId,quantity])=>lineSchema.parse({variantId,quantity}));
}
export function formatMoney(amount:string,currency:string){return new Intl.NumberFormat('en',{style:'currency',currency}).format(Number(amount));}
