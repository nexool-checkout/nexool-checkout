import {type Whop} from '@whop/sdk';
import {required,appUrl} from './config';
import {sameMoney,moneyMinor,type Address,type Session} from './model';
import {whop} from './whop-client';
import {mappedCheckoutProduct,cartDescription,truncateTitle} from './product-sync';
export {whop,WHOP_VERSION} from './whop-client';
export function shippingAddress(a:Address){return {name:`${a.firstName} ${a.lastName}`,line1:a.address1,line2:a.address2,city:a.city,state:a.provinceCode,postal_code:a.zip,country:a.countryCode};}
export async function paymentQuote(s:Session){
 if(!s.quote||!s.address)throw new Error('Missing checkout total');
 const mapped=await mappedCheckoutProduct(s.cart);
 const plan:Whop.PaymentInput.Plan={currency:s.quote.currency.toLowerCase() as Whop.PaymentInput.Plan.Currency,initial_price:Number(s.quote.total),plan_type:'one_time',product_id:mapped?.id||required('WHOP_PRODUCT_ID'),title:truncateTitle(mapped?s.cart[0].title:process.env.WHOP_RECEIPT_TITLE||'Store order',30),description:cartDescription(s.cart),override_tax_type:'inclusive',visibility:'hidden'};
 const quote=await whop().paymentQuotes.create({account_id:required('WHOP_BUSINESS_ID'),plan,shipping_address:shippingAddress(s.address)},{idempotencyKey:`quote-${s.id}`});
 if(quote.currency.toUpperCase()!==s.quote.currency||!sameMoney(quote.total.amount,s.quote.total))throw new Error('Payment currency or total does not match Shopify. No charge was made. Please contact the store.');
 if(quote.tax_status==='unavailable'||!sameMoney(quote.tax_amount.amount,s.quote.tax))throw new Error('Shopify and Whop tax calculations differ. No charge was made. Please contact the store.');
 if(!['shipping_address',null].includes(quote.located_by))throw new Error('Payment quote requires a shipping address');
 const minor=moneyMinor(quote.total.amount,quote.total.decimals);if(minor<=0)throw new Error('Free orders must use the store checkout');
 return {quote,plan,minor};
}
export async function createPayment(s:Session,confirmationToken:string,token:string){
 if(!s.address||!s.payment_attempt_key||!s.whop_quote_id)throw new Error('Payment session is not ready');
 return whop().payments.create({account_id:required('WHOP_BUSINESS_ID'),plan:s.whop_plan as Whop.PaymentInput.Plan,quote_id:s.whop_quote_id,confirmation_token:confirmationToken,email:s.address.email,shipping_address:shippingAddress(s.address),return_url:`${appUrl()}/return?session=${token}`,metadata:{nexool_session:s.id,shopify_draft:s.draft_id||'',shopify_shop:required('SHOPIFY_SHOP_DOMAIN')}},{idempotencyKey:s.payment_attempt_key});
}
export function validatePayment(p:Whop.Payment,s:Session){
 if(p.account_id!==required('WHOP_BUSINESS_ID')||p.metadata?.nexool_session!==s.id||p.quote_id!==s.whop_quote_id)throw new Error('Payment does not belong to this checkout');
 const total=p.presentment_total||p.total;
 if(!s.quote||!total||total.currency.toUpperCase()!==s.quote.currency||!sameMoney(total.amount,s.quote.total))throw new Error('Payment amount does not match the reserved order');
 if(s.payment_id&&p.id!==s.payment_id)throw new Error('Unexpected second payment; manual review required');
 if(p.auto_refunded||p.refunded_at||(p.refunded_amount&&Number(p.refunded_amount.amount)>0))throw new Error('Payment has been refunded; automatic fulfillment stopped');
}
