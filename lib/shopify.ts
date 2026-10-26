import {required,shopDomain,enabledCurrencies,appUrl} from './config';
import {mergeItems,sameMoney,type Address,type CartInput,type Item,type Quote,type Rate,type Session} from './model';
let cached:{value:string;until:number}|undefined;
export const API_VERSION='2026-07';
export async function accessToken(signal?:AbortSignal){
 if(cached&&cached.until>Date.now())return cached.value;
 const response=await fetch(`https://${shopDomain()}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:required('SHOPIFY_CLIENT_ID'),client_secret:required('SHOPIFY_CLIENT_SECRET')}),cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Shopify connection failed. Check app installation and credentials in setup.');
 const data=await response.json();if(!data.access_token)throw new Error('Shopify did not return an access token');
 cached={value:data.access_token,until:Date.now()+(data.expires_in||86400)*1000-60000};return cached.value;
}
export async function gql<T=any>(query:string,variables:Record<string,unknown>={},signal?:AbortSignal):Promise<T>{
 const response=await fetch(`https://${shopDomain()}/admin/api/${API_VERSION}/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':await accessToken(signal)},body:JSON.stringify({query,variables}),cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`Shopify request failed (${response.status}). Please try again later.`);
 const data=await response.json();if(data.errors?.length)throw new Error('Shopify API: '+data.errors.map((e:any)=>e.message).join('; '));return data.data;
}
function errors(payload:any){if(payload.userErrors?.length)throw new Error(payload.userErrors.map((e:any)=>e.message).join('; '));}
export async function getCart(input:CartInput,signal?:AbortSignal):Promise<Item[]>{
 const items=mergeItems(input.items);
 const data=await gql(`query Cart($ids:[ID!]!,$country:CountryCode!){marketByGeography(countryCode:$country){id status} nodes(ids:$ids){... on ProductVariant{id title availableForSale inventoryQuantity inventoryPolicy image{url} inventoryItem{requiresShipping tracked} product{id title status requiresSellingPlan featuredImage{url}} contextualPricing(context:{country:$country}){price{amount currencyCode}}}}}`,{ids:items.map(i=>`gid://shopify/ProductVariant/${i.variantId}`),country:input.country},signal);
 if(data.marketByGeography?.status!=='ACTIVE')throw new Error('This destination is not enabled in our store. Please choose another country.');
 const lines=items.map((line,index)=>{
  const v=data.nodes[index];if(!v||v.product.status!=='ACTIVE')throw new Error('An item is no longer available. Please update your cart.');
  if(v.product.requiresSellingPlan)throw new Error('Subscription items are not supported in this checkout yet.');
  if(!v.availableForSale||(v.inventoryItem.tracked&&v.inventoryPolicy==='DENY'&&v.inventoryQuantity<line.quantity))throw new Error(`${v.product.title} is unavailable in the requested quantity.`);
  const price=v.contextualPricing?.price;if(!price)throw new Error('A product is not available in this market.');
  if(!enabledCurrencies().includes(price.currencyCode))throw new Error(`Payment in ${price.currencyCode} is not enabled yet. Please use the store's regular checkout.`);
  return {...line,productId:v.product.id,title:v.product.title,variantTitle:v.title==='Default Title'?'':v.title,image:v.image?.url||v.product.featuredImage?.url||null,price,requiresShipping:v.inventoryItem.requiresShipping} as Item;
 });
 if(new Set(lines.map(l=>l.price.currencyCode)).size!==1)throw new Error('Cart currencies do not match');
 return lines;
}
const totals=`presentmentCurrencyCode subtotalPriceSet{presentmentMoney{amount currencyCode}} totalPriceSet{presentmentMoney{amount currencyCode}} totalTaxSet{presentmentMoney{amount currencyCode}} totalShippingPriceSet{presentmentMoney{amount currencyCode}} totalDiscountsSet{presentmentMoney{amount currencyCode}} taxesIncluded`;
type ShippingLocation=Pick<Address,'countryCode'|'city'|'provinceCode'|'zip'>&Partial<Omit<Address,'countryCode'|'city'|'provinceCode'|'zip'>>;
export function draftInput(cart:Item[],address:ShippingLocation,discountCode='',shippingHandle=''){
 const {email,...shippingAddress}=address;
 return {email,shippingAddress,billingAddress:shippingAddress,presentmentCurrencyCode:cart[0].price.currencyCode,
  // These overrides come exclusively from Shopify contextual pricing, never from browser amounts.
  lineItems:cart.map(i=>({variantId:`gid://shopify/ProductVariant/${i.variantId}`,quantity:i.quantity,priceOverride:i.price})),
  acceptAutomaticDiscounts:true,discountCodes:discountCode?[discountCode]:[],tags:['nexool-checkout'],
  ...(shippingHandle?{shippingLine:{shippingRateHandle:shippingHandle}}:{})};
}
function quoteOf(d:any,handle:string,rates:Rate[]):Quote {
 return {currency:d.presentmentCurrencyCode,subtotal:d.subtotalPriceSet.presentmentMoney.amount,total:d.totalPriceSet.presentmentMoney.amount,tax:d.totalTaxSet.presentmentMoney.amount,shipping:d.totalShippingPriceSet.presentmentMoney.amount,discount:d.totalDiscountsSet.presentmentMoney.amount,taxesIncluded:d.taxesIncluded,rates,shippingHandle:handle,warnings:(d.warnings||[]).map((w:any)=>w.message)};
}
export async function calculate(cart:Item[],address:ShippingLocation,discountCode:string,shippingHandle:string,signal?:AbortSignal){
 const calculateOne=async(handle:string)=>{const d=await gql(`mutation Calculate($input:DraftOrderInput!){draftOrderCalculate(input:$input){calculatedDraftOrder{${totals} availableShippingRates{handle title price{amount currencyCode}} warnings{message}} userErrors{message field}}}`,{input:draftInput(cart,address,discountCode,handle)},signal);errors(d.draftOrderCalculate);if(!d.draftOrderCalculate.calculatedDraftOrder)throw new Error('Unable to calculate your order');return d.draftOrderCalculate.calculatedDraftOrder;};
 const first=await calculateOne('');const rates:Rate[]=first.availableShippingRates;
 const shipping=cart.some(i=>i.requiresShipping);
 if(shipping&&!rates.length)throw new Error('No shipping option is available for this address. Please check it or contact the store.');
 const selected=shipping?(rates.find(r=>r.handle===shippingHandle)||rates[0]).handle:'';
 const result=selected?await calculateOne(selected):first;
 if(result.presentmentCurrencyCode!==cart[0].price.currencyCode)throw new Error('Shopify returned a different currency. Please review your destination.');
 // Inventory/tax/cart-transform warnings require review; do not silently accept altered orders.
 if(result.warnings?.length)throw new Error(result.warnings.map((w:any)=>w.message).join('; '));
 return quoteOf(result,selected,rates);
}
export async function createDraft(s:Session,discountCode:string){
 if(!s.address||!s.quote)throw new Error('Calculate your delivery and total first');
 const input={...draftInput(s.cart,s.address,discountCode,s.quote.shippingHandle),reserveInventoryUntil:s.expires_at,note:`Whop checkout session ${s.id}`,customAttributes:[{key:'nexool_session',value:s.id}]};
 const data=await gql(`mutation CreateDraft($input:DraftOrderInput!){draftOrderCreate(input:$input){draftOrder{id ready ${totals}} userErrors{message}}}`,{input});errors(data.draftOrderCreate);
 const draft=data.draftOrderCreate.draftOrder;if(!draft)throw new Error('Unable to reserve your order');
 return {id:draft.id,total:draft.totalPriceSet.presentmentMoney.amount,currency:draft.presentmentCurrencyCode};
}
export async function completeDraft(s:Session){
 const existing=await gql(`query Draft($id:ID!){draftOrder(id:$id){id ready ${totals} order{id name statusPageUrl}}}`,{id:s.draft_id});
 const draft=existing.draftOrder;if(!draft)throw new Error('Reserved order was not found');
 if(draft.order)return draft.order;
 if(!s.quote||!sameMoney(draft.totalPriceSet.presentmentMoney.amount,s.quote.total)||draft.presentmentCurrencyCode!==s.quote.currency)throw new Error('The reserved order changed after payment. Manual review required.');
 if(!draft.ready)throw new Error('Shopify is still preparing this order. Retry synchronization.');
 const data=await gql(`mutation Complete($id:ID!){draftOrderComplete(id:$id){draftOrder{order{id name statusPageUrl}} userErrors{message}}}`,{id:s.draft_id});errors(data.draftOrderComplete);
 const order=data.draftOrderComplete.draftOrder?.order;if(!order)throw new Error('Order completion is still pending');return order;
}
export async function healthShopify(){cached=undefined;return gql(`query Setup{shop{name myshopifyDomain} currentAppInstallation{accessScopes{handle}}}`);}
export function hasTrackingWebhookScope(scopes:readonly string[]){return scopes.some(scope=>['read_fulfillments','write_fulfillments','read_marketplace_orders','write_marketplace_orders'].includes(scope));}
export async function fulfillments(orderId:string){const data=await gql(`query Tracking($id:ID!){order(id:$id){fulfillments{status trackingInfo{number url company}}}}`,{id:orderId});return data.order?.fulfillments||[];}
export async function registerTrackingWebhooks(){
 const installation=await healthShopify();
 if(!hasTrackingWebhookScope(installation.currentAppInstallation?.accessScopes?.map((scope:{handle:string})=>scope.handle)||[]))throw new Error('Add read_fulfillments to your Shopify app, release the version and approve the new permission on the store. Then register tracking webhooks again.');
 return registerWebhooks(['FULFILLMENTS_CREATE','FULFILLMENTS_UPDATE']);
}
export async function registerProductWebhooks(){return registerWebhooks(['PRODUCTS_CREATE','PRODUCTS_UPDATE','PRODUCTS_DELETE']);}
async function registerWebhooks(topics:string[]){
 const uri=appUrl()+'/api/webhooks/shopify';
 if(!uri.startsWith('https://'))throw new Error('Configure your public HTTPS APP_URL first');
 const existing=await gql(`query Hooks($uri:String!,$topics:[WebhookSubscriptionTopic!]!){webhookSubscriptions(first:100,uri:$uri,topics:$topics){nodes{id topic uri}}}`,{uri,topics});
 const results=[];
 for(const topic of topics){
  const found=existing.webhookSubscriptions.nodes.find((h:any)=>h.topic===topic&&h.uri===uri);
  if(found){results.push(found);continue;}
  const data=await gql(`mutation Hook($topic:WebhookSubscriptionTopic!,$input:WebhookSubscriptionInput!){webhookSubscriptionCreate(topic:$topic,webhookSubscription:$input){webhookSubscription{id topic uri} userErrors{message field}}}`,{topic,input:{uri,format:'JSON'}});
  errors(data.webhookSubscriptionCreate);results.push(data.webhookSubscriptionCreate.webhookSubscription);
 }
 return {subscriptions:results};
}
