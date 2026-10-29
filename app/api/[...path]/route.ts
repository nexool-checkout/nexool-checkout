import {randomBytes,randomUUID} from 'node:crypto';
import {after} from 'next/server';
import {z} from 'zod';
import {createHmac} from 'node:crypto';
import {db,initialize,limit,ensureAttributionSchema} from '@/lib/db';
import {checkoutTracking} from '@/lib/checkout-tracking';
import {required,requiredNames,paymentReady,appUrl,enabledCurrencies} from '@/lib/config';
import {adminCookie,body,equal,fail,hash,isAdmin,requireAdmin,requireFresh,sameOrigin,sessionFor,tokenFrom} from '@/lib/security';
import {addressSchema,cartSchema,mergeItems,sameMoney,preparationSchema,assertReviewedOrder,type Session} from '@/lib/model';
import {getCart,calculate,createDraft,healthShopify,registerTrackingWebhooks,hasTrackingWebhookScope} from '@/lib/shopify';
import {createPayment,paymentQuote,whop} from '@/lib/whop';
import {reconcile,syncPayment,syncTracking} from '@/lib/sync';
import {placeProof,resolvePlace,suggestPlaces} from '@/lib/places';
import {verifyWhopWebhook,WhopWebhookError} from '@/lib/whop-webhook';
import {productSyncState,setProductSync,startProductImport,runProductSync,retryProductSync,enqueueProduct,productSyncEnabled} from '@/lib/product-sync';
import {expressLocationSchema} from '@/lib/express';
export const runtime='nodejs';
export const maxDuration=60;
type Context={params:Promise<{path:string[]}>};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function publicSession(s:Session){return {id:s.id,cart:s.cart,country:s.country,currency:s.currency,address:s.address,quote:s.quote,status:s.status,orderUrl:s.order_url,expiresAt:s.expires_at,accountId:process.env.WHOP_BUSINESS_ID,tracking:checkoutTracking(s)};}
function assertEnabled(){if(!paymentReady())throw new Error('Checkout is not taking payments yet. Please use the store checkout.');}
function rateKey(req:Request,prefix:string){return `${prefix}:${hash(req.headers.get('x-vercel-forwarded-for')||req.headers.get('x-forwarded-for')||'local').slice(0,24)}`;}
async function safeSync(id:string){try{await syncPayment(id);await db()`UPDATE nexool_events SET processed_at=NOW() WHERE payment_id=${id}`;}catch{console.error('Payment synchronization needs review');}}
export async function GET(req:Request,context:Context){
 try{
  const route=(await context.params).path.join('/');
  if(route==='session'){
   const s=await sessionFor(req);await limit(`status:${s.id}`,45);
   if(s.payment_id&&!s.order_id)after(()=>safeSync(s.payment_id!));
   return json(publicSession(s));
  }
  if(route==='admin'){
   if(!isAdmin(req))return json({authenticated:false},401);
   const settings=requiredNames.map(name=>({name,configured:!!process.env[name]?.trim()}));
   let sessions:any[]=[],tracking:any[]=[],database=false;
   try{sessions=await db()`SELECT id,status,currency,payment_id,order_id,last_error,created_at FROM nexool_sessions ORDER BY created_at DESC LIMIT 30`;tracking=await db()`SELECT * FROM nexool_tracking WHERE error IS NOT NULL LIMIT 20`;database=true;}catch{}
   let productSync=null;try{productSync=await productSyncState();}catch{}
   return json({authenticated:true,settings,database,autocomplete:!!process.env.GOOGLE_PLACES_API_KEY,enabled:paymentReady(),currencies:enabledCurrencies(),sessions,tracking,trackingEnabled:process.env.TRACKING_SYNC_ENABLED==='true',productSync,release:'0.4.0'});
  }
  if(route==='reconcile'){
   if(!equal(req.headers.get('authorization')||'',`Bearer ${required('CRON_SECRET')}`))return json({error:'Unauthorized'},401);
   const [payments,products]=await Promise.all([reconcile(),runProductSync().catch(()=>({error:'Product sync will retry'}))]);return json({payments,products});
  }
  return json({error:'Not found'},404);
 }catch(e){return fail(e);}
}
export async function POST(req:Request,context:Context){
 const route=(await context.params).path.join('/');
 try{
  if(route==='webhooks/whop'){
   const raw=await req.text();if(raw.length>1000000)return json({error:'Payload too large'},413);
   let event;
   try{event=verifyWhopWebhook(raw,Object.fromEntries(req.headers),required('WHOP_WEBHOOK_SECRET'),required('WHOP_BUSINESS_ID'));}
   catch(e){if(e instanceof WhopWebhookError)return json({error:e.message},e.status);throw e;}
   if(event.kind==='ignored')return json({received:true});
   const paymentId=event.paymentId,id=event.deliveryId;
   await db()`INSERT INTO nexool_events(id,payment_id) VALUES(${id},${paymentId}) ON CONFLICT(id) DO NOTHING`;
   // Persist the verified mapping before acknowledging. The API is re-read before fulfillment.
   after(()=>safeSync(paymentId));return json({received:true});
  }
  if(route==='webhooks/shopify'){
   const raw=await req.text();if(raw.length>1000000)return json({error:'Payload too large'},413);
   const expected=createHmac('sha256',required('SHOPIFY_CLIENT_SECRET')).update(raw).digest('base64');
   if(!equal(req.headers.get('x-shopify-hmac-sha256')||'',expected)||req.headers.get('x-shopify-shop-domain')!==required('SHOPIFY_SHOP_DOMAIN'))return json({error:'Invalid signature'},401);
   const payload=JSON.parse(raw);const topic=req.headers.get('x-shopify-topic')||'';
   if(['products/create','products/update','products/delete'].includes(topic)){
    if(!await productSyncEnabled())return json({received:true});
    const productId=typeof payload.admin_graphql_api_id==='string'?payload.admin_graphql_api_id:`gid://shopify/Product/${payload.id}`;
    await enqueueProduct(productId);
    after(async()=>{try{await runProductSync(productId);}catch{console.error('Product sync queued for retry');}});
    return json({received:true});
   }
   if(!['fulfillments/create','fulfillments/update'].includes(topic))return json({received:true});
   const orderId=`gid://shopify/Order/${payload.order_id}`;
   after(async()=>{const [s]=await db()`SELECT * FROM nexool_sessions WHERE order_id=${orderId}`;if(s)try{await syncTracking(s as Session);}catch{console.error('Tracking synchronization failed; reconciliation will retry');}});
   return json({received:true});
  }
  sameOrigin(req);
  if(route==='admin/login'){
   const data=await body(req);const secret=required('ADMIN_SECRET');if(secret.length<32)throw new Error('ADMIN_SECRET must have at least 32 characters');
   if(typeof data.secret!=='string'||!equal(data.secret,secret))return json({error:'Incorrect setup password'},401);
   return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':`nexool_admin=${adminCookie()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600${process.env.NODE_ENV==='production'?'; Secure':''}`}});
  }
  if(route.startsWith('admin/')){
   requireAdmin(req);
   if(route==='admin/logout')return new Response('{}',{headers:{'Set-Cookie':'nexool_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'}});
   if(route==='admin/initialize'){await initialize();return json({ok:true});}
   if(route==='admin/register-tracking'){return json(await registerTrackingWebhooks());}
   if(route==='admin/product-sync/settings'){const data=z.object({enabled:z.boolean()}).strict().parse(await body(req));return json(await setProductSync(data.enabled));}
   if(route==='admin/product-sync/import')return json(await startProductImport());
   if(route==='admin/product-sync/run')return json(await runProductSync());
   if(route==='admin/product-sync/retry')return json(await retryProductSync());
   if(route==='admin/check'){
    const checks:Record<string,unknown>={};
    try{const shopify=await healthShopify();checks.shopify=shopify;checks.tracking={enabled:process.env.TRACKING_SYNC_ENABLED==='true',shopifyWebhookScope:hasTrackingWebhookScope(shopify.currentAppInstallation?.accessScopes?.map((scope:{handle:string})=>scope.handle)||[])?'ready':'missing read_fulfillments',whopShipmentPermissions:'Not tested by the account connection check; verify shipment create/update access on the Whop API key'};}catch(e){checks.shopify={error:e instanceof Error?e.message:'Connection failed'};}
    try{const account=await whop().accounts.retrieve({id:required('WHOP_BUSINESS_ID')});checks.whop={ok:true,id:account.id};}catch{checks.whop={error:'Check Whop key, account ID and account read permission'};}
    try{await db()`SELECT 1`;checks.database={ok:true};}catch{checks.database={error:'Check DATABASE_URL'};}
    return json(checks);
   }
   if(route==='admin/reconcile'){return json(await reconcile());}
   return json({error:'Not found'},404);
  }
  assertEnabled();
  if(route==='session'){
   await limit(rateKey(req,'sessions'),10);
   const input=cartSchema.parse(await body(req));const items=mergeItems(input.items);const cart=await getCart({...input,items});
   await ensureAttributionSchema();
   const id=randomUUID(),token=randomBytes(32).toString('hex'),expires=new Date(Date.now()+30*60_000).toISOString();
   const [s]=await db()`INSERT INTO nexool_sessions(id,token_hash,items,country,currency,cart,expires_at,attribution) VALUES(${id},${hash(token)},${db().json(items)},${input.country},${cart[0].price.currencyCode},${db().json(cart)},${expires},${db().json(input.attribution||{})}) RETURNING *`;
   return json({token,...publicSession(s as Session)});
  }
  const s=await sessionFor(req);requireFresh(s);
  if(route==='address/suggest'||route==='address/resolve'){
   if(!process.env.GOOGLE_PLACES_API_KEY)return json({error:'Address suggestions are unavailable. Enter your address manually.'},503);
   await limit(`address:${s.id}`,35);await limit(rateKey(req,'address'),70);await limit(`address-budget:${s.id}`,150,1800);
   const common={country:z.string().regex(/^[A-Z]{2}$/),sessionToken:z.uuid()};
   if(route==='address/suggest'){
    const data=z.object({...common,input:z.string().trim().min(3).max(150)}).strict().parse(await body(req));
    return json({suggestions:await suggestPlaces(data.input,data.country,data.sessionToken,s.id)});
   }
   const data=z.object({...common,id:z.string().regex(/^[A-Za-z0-9_-]+$/).max(300),proof:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(await body(req));
   if(!equal(data.proof,placeProof(s.id,data.sessionToken,data.country,data.id)))return json({error:'Please select a fresh address suggestion.'},400);
   return json(await resolvePlace(data.id,data.country,data.sessionToken));
  }
  await limit(`mutate:${s.id}`,15);
  if(route==='market'||route==='express/quote'){
   if(s.draft_id||s.payment_attempt_key)throw new Error('This order is already reserved. Start a new checkout to change delivery.');
   const signal=AbortSignal.any([req.signal,AbortSignal.timeout(18000)]);
   if(route==='market'){
    const data=z.object({country:z.string().regex(/^[A-Z]{2}$/)}).strict().parse(await body(req));
    const cart=await getCart({items:s.items,country:data.country},signal);return json({cart,country:data.country,currency:cart[0].price.currencyCode});
   }
   const data=z.object({location:expressLocationSchema,discountCode:z.string().trim().max(80).default(''),shippingHandle:z.string().max(2000).default('')}).strict().parse(await body(req));
   const cart=await getCart({items:s.items,country:data.location.countryCode},signal);const quote=await calculate(cart,data.location,data.discountCode,data.shippingHandle,signal);quote.discountCode=data.discountCode;
   // Wallet change events provide a redacted address. This estimate creates no draft
   // or payment and cannot authorize a charge; a full /quote is required at approval.
   return json({cart,country:data.location.countryCode,currency:quote.currency,quote});
  }
  if(route==='quote'){
   if(s.draft_id||s.payment_attempt_key)throw new Error('This order is already reserved. Return to the store to start a different order.');
   const data=z.object({address:addressSchema,discountCode:z.string().trim().max(80).default(''),shippingHandle:z.string().max(2000).default(''),express:z.boolean().default(false)}).strict().parse(await body(req));
   const [claimed]=await db()`UPDATE nexool_sessions SET status='quoting',updated_at=NOW() WHERE id=${s.id} AND status IN ('cart','quoted') RETURNING id`;if(!claimed)throw new Error('An update is already in progress. Please wait.');
   try{
    const signal=data.express?AbortSignal.any([req.signal,AbortSignal.timeout(18000)]):req.signal;
    const cart=await getCart({items:s.items,country:data.address.countryCode},signal);const quote=await calculate(cart,data.address,data.discountCode,data.shippingHandle,signal);quote.discountCode=data.discountCode;
    const [updated]=await db()`UPDATE nexool_sessions SET cart=${db().json(cart)},address=${db().json(data.address)},quote=${db().json(quote)},country=${data.address.countryCode},currency=${quote.currency},status='quoted',updated_at=NOW() WHERE id=${s.id} RETURNING *`;
    return json(publicSession(updated as Session));
   }catch(e){await db()`UPDATE nexool_sessions SET status='cart',updated_at=NOW() WHERE id=${s.id}`;throw e;}
  }
  if(route==='prepare'){
   assertReviewedOrder(s,preparationSchema.parse(await body(req)));
   if(s.status==='ready')return json(publicSession(s));
   if(!s.quote||!s.address)throw new Error('Confirm your delivery details first');
   const [claimed]=await db()`UPDATE nexool_sessions SET status='preparing',updated_at=NOW() WHERE id=${s.id} AND status='quoted' AND quote=${db().json(s.quote)}::jsonb AND address=${db().json(s.address)}::jsonb RETURNING id`;if(!claimed)throw new Error('Your order changed or payment preparation is already in progress. Refresh to check the latest order.');
   try{
    const freshCart=await getCart({items:s.items,country:s.country});const freshQuote=await calculate(freshCart,s.address,s.quote.discountCode||'',s.quote.shippingHandle);
    if(!sameMoney(freshQuote.total,s.quote.total)||freshQuote.currency!==s.quote.currency||!sameMoney(freshQuote.tax,s.quote.tax))throw new Error('The total changed. Please return to the store and review a new checkout.');
    const draft=await createDraft({...s,cart:freshCart},s.quote.discountCode||'');
    await db()`UPDATE nexool_sessions SET draft_id=${draft.id},updated_at=NOW() WHERE id=${s.id}`;
    if(!sameMoney(draft.total,s.quote.total)||draft.currency!==s.quote.currency)throw new Error('The reserved total changed. No payment was taken. Please start a new checkout.');
    const result=await paymentQuote({...s,cart:freshCart,draft_id:draft.id});
    const expires=new Date(Math.min(new Date(s.expires_at).getTime(),new Date(result.quote.expires_at).getTime())).toISOString();
    const quote={...s.quote,paymentMinor:result.minor};
    const [updated]=await db()`UPDATE nexool_sessions SET cart=${db().json(freshCart)},quote=${db().json(quote)},whop_quote_id=${result.quote.id},whop_plan=${db().json(result.plan)},status='ready',expires_at=${expires},updated_at=NOW() WHERE id=${s.id} RETURNING *`;
    return json(publicSession(updated as Session));
   }catch(e){await db()`UPDATE nexool_sessions SET status='needs_configuration',last_error='Payment preparation failed; check Shopify and Whop configuration',updated_at=NOW() WHERE id=${s.id}`;throw e;}
  }
  if(route==='pay'){
   const data=z.object({confirmationToken:z.string().regex(/^ctok_[A-Za-z0-9]+$/).max(300)}).strict().parse(await body(req));
   if(s.payment_id){const p=await whop().payments.retrieve({id:s.payment_id});return json({id:p.id,status:p.status,clientSecret:p.client_secret});}
   const key=`payment-${s.id}`;
   const [claimed]=await db()`UPDATE nexool_sessions SET status='paying',payment_attempt_key=${key},updated_at=NOW() WHERE id=${s.id} AND status='ready' AND payment_attempt_key IS NULL RETURNING *`;
   if(!claimed)throw new Error('Your payment is already being checked. Please wait and do not submit another order.');
   try{
    const p=await createPayment(claimed as Session,data.confirmationToken,tokenFrom(req));
    await db()`UPDATE nexool_sessions SET payment_id=${p.id},status=CASE WHEN status IN ('complete','syncing') THEN status ELSE 'payment_pending' END,updated_at=NOW() WHERE id=${s.id}`;
    if(p.status==='paid')after(()=>safeSync(p.id));
    return json({id:p.id,status:p.status,clientSecret:p.client_secret});
   }catch(e){await db()`UPDATE nexool_sessions SET status=CASE WHEN status IN ('complete','syncing') THEN status ELSE 'payment_unknown' END,last_error='Check Whop before retrying: payment request did not return a definitive result',updated_at=NOW() WHERE id=${s.id}`;throw new Error('We could not confirm the payment result. Please check your order status before trying again.');}
  }
  return json({error:'Not found'},404);
 }catch(e){return fail(e);}
}
