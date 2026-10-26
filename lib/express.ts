import {z} from 'zod';
import {addressSchema,moneyMinor,type Address,type Item,type Quote} from './model';
import {normalizeProvince} from './address-rules';
export const expressLocationSchema=z.object({countryCode:z.string().regex(/^[A-Z]{2}$/),city:z.string().trim().max(100).default(''),provinceCode:z.string().trim().max(50).default(''),zip:z.string().trim().max(20).default(''),address1:z.string().trim().max(150).optional(),address2:z.string().trim().max(150).optional()}).strict();
export type ExpressLocation=z.infer<typeof expressLocationSchema>;
type WalletAddress={name?:string;recipient?:string;line1?:string;line2?:string;city?:string;state?:string;postal_code?:string;country?:string;phone?:string};
type WalletContact={payer:{email?:string;name?:string;phone?:string};shipping:{address?:WalletAddress;option?:{id:string}}|null};
export function currencyDecimals(currency:string){return new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits??2;}
export function quoteMinor(quote:Quote){return quote.paymentMinor??moneyMinor(quote.total,currencyDecimals(quote.currency));}
export function subtotalMinor(cart:Item[],currency:string){const amount=cart.reduce((sum,item)=>sum+moneyMinor(item.price.amount,currencyDecimals(currency))*item.quantity,0);if(!Number.isSafeInteger(amount))throw new Error('Order amount is too large');return amount;}
export function walletShippingOptions(quote:Quote){return quote.rates.map(rate=>({id:rate.handle,label:rate.title,amount:moneyMinor(rate.price.amount,currencyDecimals(quote.currency))})).sort((a,b)=>Number(b.id===quote.shippingHandle)-Number(a.id===quote.shippingHandle));}
export function walletLineItems(quote:Quote){
 const decimals=currencyDecimals(quote.currency),lines=[{label:'Items',amount:moneyMinor(quote.subtotal,decimals)},{label:'Shipping',amount:moneyMinor(quote.shipping,decimals)}];
 if(!quote.taxesIncluded)lines.push({label:'Tax',amount:moneyMinor(quote.tax,decimals)});
 return lines.reduce((n,line)=>n+line.amount,0)===quoteMinor(quote)?lines:[{label:'Order total',amount:quoteMinor(quote)}];
}
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function walletLocation(value:WalletAddress,known?:Address):ExpressLocation{
 const countryCode=(value.country||'').toUpperCase();if(!/^[A-Z]{2}$/.test(countryCode))throw new Error('Choose a valid delivery country in your wallet.');
 const provinceCode=normalizeProvince(countryCode,value.state||'',(value.state||'').replace(new RegExp('^'+countryCode+'-'),'').trim());
 const location=expressLocationSchema.parse({countryCode,provinceCode,city:value.city||'',zip:value.postal_code||'',...(value.line1?{address1:value.line1,address2:value.line2||''}:{})});
 if(known&&addressSchema.safeParse(known).success&&known.countryCode===countryCode&&normalize(known.city)===normalize(location.city)&&known.provinceCode===provinceCode&&normalize(known.zip).startsWith(normalize(location.zip))){return {...location,zip:known.zip,address1:known.address1,address2:known.address2};}
 return location;
}
export function walletDelivery(contact:WalletContact):Address{
 const shipping=contact.shipping?.address;if(!shipping?.line1||!shipping.country)throw new Error('Your wallet did not provide a complete delivery address. Complete delivery on this page and try again.');
 const name=(shipping.name||shipping.recipient||contact.payer.name||'').trim().split(/\s+/),lastName=name.length>1?name.slice(1).join(' '):name[0]||'',firstName=name.length>1?name[0]:'';
 const country=shipping.country.toUpperCase();if(!/^[A-Z]{2}$/.test(country))throw new Error('Choose a valid delivery country in your wallet.');
 const candidate={email:(contact.payer.email||'').trim(),firstName,lastName,address1:shipping.line1,address2:shipping.line2||'',city:shipping.city||'',provinceCode:normalizeProvince(country,shipping.state||'',(shipping.state||'').replace(new RegExp('^'+country+'-'),'')),zip:shipping.postal_code||'',countryCode:country,phone:contact.payer.phone||shipping.phone||''};
 const result=addressSchema.safeParse(candidate);if(!result.success)throw new Error('Your wallet did not provide complete contact and delivery details. Complete the form on this page and try again.');return result.data;
}
export function assertWalletQuote(quote:Quote,currency:string,amount:number,shippingId?:string){
 if(quote.currency.toUpperCase()!==currency.toUpperCase())throw new Error(`Your delivery country uses ${quote.currency}. Review the updated currency and try again.`);
 if(!Number.isSafeInteger(amount)||amount<=0||quoteMinor(quote)!==amount)throw new Error('Your final delivery total changed. Review the updated total before paying again.');
 if(shippingId&&quote.shippingHandle!==shippingId)throw new Error('Your shipping options changed. Review delivery and try again.');
}
export function sameWalletDelivery(a:Address,b:Address){return Object.keys(a).every(key=>a[key as keyof Address]===b[key as keyof Address]);}
export function walletCancelled(error:unknown){return !!error&&typeof error==='object'&&'code' in error&&['payment_request_cancelled','PAYMENT_REQUEST_CANCELLED'].includes(String(error.code));}
export function walletEmail(email:string){const result=z.email().safeParse(email.trim());return result.success?result.data:undefined;}
