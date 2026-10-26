import {createHash,randomUUID} from 'node:crypto';
import type {Whop} from '@whop/sdk';
import {db} from './db';
import {required,shopDomain} from './config';
import {gql,registerProductWebhooks} from './shopify';
import {whop} from './whop-client';
import type {Item} from './model';

export type CatalogProduct={id:string;title:string;description:string;status:string};
export type ProductSyncState={available:boolean;enabled:boolean;importing:boolean;pending:number;ready:number;synced:number;failed:number;imported:number;errors:{productId:string;message:string}[]};
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
export function productScope(shop=shopDomain(),account=required('WHOP_BUSINESS_ID')){return `${shop}|${account}`;}
export function truncateTitle(title:string,max=80){return Array.from(title.trim()).slice(0,max).join('')||'Shopify product';}
export function productFingerprint(p:CatalogProduct){return digest(JSON.stringify([p.title,p.description,p.status]));}
export function productCreatePayload(p:CatalogProduct,shop:string,account:string,taxCode?:string){
 return {account_id:account,title:truncateTitle(p.title),description:Array.from(p.description).slice(0,1500).join(''),visibility:'hidden',collect_shipping_address:true,send_welcome_message:false,labels:['shopify-sync'],metadata:{shopify_shop:shop,shopify_product_id:p.id},...(taxCode?{product_tax_code_id:taxCode}:{})} satisfies Whop.CreateProductsRequest;
}
export function assertProductOwnership(product:Pick<Whop.Product,'id'|'metadata'|'account'>,sourceId:string,shop:string,account:string){
 if(!/^prod_\w+$/.test(product.id)||product.metadata?.shopify_shop!==shop||product.metadata?.shopify_product_id!==sourceId)throw new Error('Whop product mapping does not match this Shopify product. Review the mapping before retrying.');
 if(product.account&&typeof product.account.id==='string'&&product.account.id!==account)throw new Error('Whop product belongs to another account.');
}
export function syncError(error:unknown){
 const status=error&&typeof error==='object'&&'statusCode' in error?Number(error.statusCode):0;
 if(status)return `Whop product sync failed (${status}). Check product read, create and update permissions and the product's availability.`;
 if(error instanceof Error&&/mapping|another account|uncertain|no longer exists/.test(error.message))return error.message;
 return 'Product sync failed. Check Shopify and Whop connections, then retry.';
}
export async function initializeProducts(){
 const sql=db();
 await sql`CREATE TABLE IF NOT EXISTS nexool_catalog_settings(scope TEXT PRIMARY KEY,enabled BOOLEAN NOT NULL DEFAULT FALSE,importing BOOLEAN NOT NULL DEFAULT FALSE,cursor TEXT,imported INTEGER NOT NULL DEFAULT 0,import_lease TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
 await sql`CREATE TABLE IF NOT EXISTS nexool_product_links(scope TEXT NOT NULL,shopify_id TEXT NOT NULL,whop_id TEXT,title TEXT,synced_hash TEXT,create_payload JSONB,create_started_at TIMESTAMPTZ,pending BOOLEAN NOT NULL DEFAULT TRUE,revision INTEGER NOT NULL DEFAULT 1,attempts INTEGER NOT NULL DEFAULT 0,next_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),lease_until TIMESTAMPTZ,lease_owner TEXT,last_error TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(scope,shopify_id))`;
}
function missingTable(error:unknown){return !!error&&typeof error==='object'&&'code' in error&&error.code==='42P01';}
export async function productSyncEnabled(){
 try{const [row]=await db()`SELECT enabled FROM nexool_catalog_settings WHERE scope=${productScope()}`;return row?.enabled===true;}catch(e){if(missingTable(e))return false;throw e;}
}
export async function productSyncState():Promise<ProductSyncState>{
 const empty:ProductSyncState={available:false,enabled:false,importing:false,pending:0,ready:0,synced:0,failed:0,imported:0,errors:[]};
 try{
  const [setting]=await db()`SELECT enabled,importing,imported FROM nexool_catalog_settings WHERE scope=${productScope()}`;
  const [counts]=await db()`SELECT COUNT(*) FILTER(WHERE pending) AS pending,COUNT(*) FILTER(WHERE pending AND next_at<=NOW() AND (lease_until IS NULL OR lease_until<NOW())) AS ready,COUNT(*) FILTER(WHERE whop_id IS NOT NULL AND NOT pending) AS synced,COUNT(*) FILTER(WHERE last_error IS NOT NULL) AS failed FROM nexool_product_links WHERE scope=${productScope()}`;
  const errors=await db()`SELECT shopify_id AS "productId",last_error AS message FROM nexool_product_links WHERE scope=${productScope()} AND last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 10`;
  return {...empty,available:true,enabled:setting?.enabled===true,importing:setting?.importing===true,imported:Number(setting?.imported||0),pending:Number(counts.pending),ready:Number(counts.ready),synced:Number(counts.synced),failed:Number(counts.failed),errors:errors.map(row=>({productId:String(row.productId),message:String(row.message)}))};
 }catch(e){if(missingTable(e))return empty;throw e;}
}
export async function setProductSync(enabled:boolean){
 await initializeProducts();
 // Register before enabling: a permission failure must not leave a half-enabled switch.
 if(enabled)await registerProductWebhooks();
 await db()`INSERT INTO nexool_catalog_settings(scope,enabled) VALUES(${productScope()},${enabled}) ON CONFLICT(scope) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=NOW()`;
 return productSyncState();
}
export async function enqueueProduct(id:string){
 if(!/^gid:\/\/shopify\/Product\/\d{1,20}$/.test(id))throw new Error('Invalid Shopify product ID');
 if(!await productSyncEnabled())return;
 await db()`INSERT INTO nexool_product_links(scope,shopify_id) VALUES(${productScope()},${id}) ON CONFLICT(scope,shopify_id) DO UPDATE SET pending=TRUE,revision=nexool_product_links.revision+1,attempts=0,next_at=NOW(),last_error=NULL,updated_at=NOW()`;
}
export async function startProductImport(){
 if(!await productSyncEnabled())throw new Error('Enable automatic product sync first.');
 await db()`UPDATE nexool_catalog_settings SET importing=TRUE,cursor=NULL,imported=0,updated_at=NOW() WHERE scope=${productScope()} AND (import_lease IS NULL OR import_lease<NOW())`;
 return productSyncState();
}
async function importPage(){
 const [setting]=await db()`UPDATE nexool_catalog_settings SET import_lease=NOW()+INTERVAL '90 seconds' WHERE scope=${productScope()} AND enabled AND importing AND (import_lease IS NULL OR import_lease<NOW()) RETURNING cursor`;
 if(!setting)return false;
 try{
  const data=await gql(`query SyncProducts($after:String){products(first:10,after:$after,query:"status:active"){nodes{id} pageInfo{hasNextPage endCursor}}}`,{after:setting.cursor});
  for(const p of data.products.nodes)await enqueueProduct(p.id);
  await db()`UPDATE nexool_catalog_settings SET cursor=${data.products.pageInfo.endCursor},importing=${data.products.pageInfo.hasNextPage},imported=imported+${data.products.nodes.length},import_lease=NULL,updated_at=NOW() WHERE scope=${productScope()}`;
  return true;
 }catch(e){await db()`UPDATE nexool_catalog_settings SET import_lease=NULL WHERE scope=${productScope()}`;throw e;}
}
let templateTax:{key:string;until:number;code:string|undefined}|undefined;
async function templateTaxCode(){
 const key=`${productScope()}|${required('WHOP_PRODUCT_ID')}`;
 if(templateTax?.key===key&&templateTax.until>Date.now())return templateTax.code;
 const template=await whop().products.retrieve({id:required('WHOP_PRODUCT_ID')});
 if(template.account&&typeof template.account.id==='string'&&template.account.id!==required('WHOP_BUSINESS_ID'))throw new Error('Whop product belongs to another account.');
 const code=typeof template.product_tax_code?.id==='string'?template.product_tax_code.id:undefined;
 templateTax={key,until:Date.now()+300000,code};return code;
}
async function processOne(id?:string){
 if(!await productSyncEnabled())return;
 const owner=randomUUID();
 const rows=id
  ?await db()`UPDATE nexool_product_links SET lease_owner=${owner},lease_until=NOW()+INTERVAL '2 minutes' WHERE scope=${productScope()} AND shopify_id=${id} AND pending AND next_at<=NOW() AND (lease_until IS NULL OR lease_until<NOW()) RETURNING *`
  :await db()`UPDATE nexool_product_links SET lease_owner=${owner},lease_until=NOW()+INTERVAL '2 minutes' WHERE (scope,shopify_id)=(SELECT scope,shopify_id FROM nexool_product_links WHERE scope=${productScope()} AND pending AND next_at<=NOW() AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY updated_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`;
 const row=rows[0];if(!row)return;
 try{
  // Read current Shopify data, so delayed/replayed webhooks cannot restore an old name.
  const data=await gql(`query SyncProduct($id:ID!){product(id:$id){id title description status}}`,{id:row.shopify_id});
  const product=data.product as CatalogProduct|null;
  if(!product||product.status!=='ACTIVE'){
   // Keep existing Whop products and historical purchases; only stop their future sync.
   await db()`UPDATE nexool_product_links SET pending=(revision!=${row.revision}),lease_until=NULL,lease_owner=NULL,last_error=NULL WHERE scope=${productScope()} AND shopify_id=${row.shopify_id} AND lease_owner=${owner}`;return;
  }
  const fingerprint=productFingerprint(product);let whopId=row.whop_id as string|null;
  if(!whopId){
   let payload=row.create_payload as ReturnType<typeof productCreatePayload>|null;
   if(!payload){
    payload=productCreatePayload(product,shopDomain(),required('WHOP_BUSINESS_ID'),await templateTaxCode());
    await db()`UPDATE nexool_product_links SET create_payload=${db().json(payload)},create_started_at=NOW() WHERE scope=${productScope()} AND shopify_id=${row.shopify_id} AND lease_owner=${owner}`;
   }else if(row.create_started_at&&Date.now()-new Date(row.create_started_at).getTime()>23*3600000){throw new Error('Previous Whop product creation is uncertain. Review it in Whop before retrying to avoid duplicates.');}
   if(!await productSyncEnabled())return;
   const created=await whop().products.create(payload,{idempotencyKey:`shopify-product-${digest(productScope()+'|'+product.id).slice(0,40)}`});
   assertProductOwnership(created,product.id,shopDomain(),required('WHOP_BUSINESS_ID'));whopId=created.id;
   await db()`UPDATE nexool_product_links SET whop_id=${whopId} WHERE scope=${productScope()} AND shopify_id=${row.shopify_id} AND lease_owner=${owner}`;
   // A changed title after an ambiguous create is updated in a later pass with a full time budget.
   if(payload.title!==truncateTitle(product.title)||payload.description!==Array.from(product.description).slice(0,1500).join('')){
    await db()`UPDATE nexool_product_links SET lease_until=NULL,lease_owner=NULL,next_at=NOW() WHERE scope=${productScope()} AND shopify_id=${row.shopify_id} AND lease_owner=${owner}`;return;
   }
  }else if(row.synced_hash!==fingerprint){
   const existing=await whop().products.retrieve({id:whopId});assertProductOwnership(existing,product.id,shopDomain(),required('WHOP_BUSINESS_ID'));
   if(!await productSyncEnabled())return;
   await whop().products.update({id:whopId,title:truncateTitle(product.title),description:Array.from(product.description).slice(0,1500).join('')},{idempotencyKey:`shopify-update-${digest(productScope()+'|'+product.id+'|'+fingerprint).slice(0,40)}`});
  }
  await db()`UPDATE nexool_product_links SET title=${product.title},synced_hash=${fingerprint},pending=(revision!=${row.revision}),attempts=0,next_at=NOW(),lease_until=NULL,lease_owner=NULL,last_error=NULL,updated_at=NOW() WHERE scope=${productScope()} AND shopify_id=${row.shopify_id} AND lease_owner=${owner}`;
 }catch(e){
  const attempts=Number(row.attempts)+1,delay=Math.min(3600,30*2**Math.min(attempts,7));
  await db()`UPDATE nexool_product_links SET attempts=${attempts},next_at=NOW()+${delay}*INTERVAL '1 second',lease_until=NULL,lease_owner=NULL,last_error=${syncError(e)},updated_at=NOW() WHERE scope=${productScope()} AND shopify_id=${row.shopify_id} AND lease_owner=${owner}`;
 }finally{
  await db()`UPDATE nexool_product_links SET lease_until=NULL,lease_owner=NULL WHERE scope=${productScope()} AND shopify_id=${row.shopify_id} AND lease_owner=${owner}`;
 }
}
export async function runProductSync(id?:string){
 if(!await productSyncEnabled())return productSyncState();
 if(id){await processOne(id);return productSyncState();}
 const [count]=await db()`SELECT COUNT(*) AS n FROM nexool_product_links WHERE scope=${productScope()} AND pending AND last_error IS NULL`;
 // Import and provider calls use separate invocations to stay within Vercel's time limit.
 if(Number(count.n)<5&&await importPage())return productSyncState();
 await processOne();return productSyncState();
}
export async function retryProductSync(){
 if(!await productSyncEnabled())throw new Error('Enable automatic product sync first.');
 await db()`UPDATE nexool_product_links SET next_at=NOW(),attempts=0 WHERE scope=${productScope()} AND pending AND last_error IS NOT NULL`;
 return productSyncState();
}
export function singleShopifyProduct(cart:Item[]){const ids=[...new Set(cart.map(i=>i.productId))];return ids.length===1&&typeof ids[0]==='string'?ids[0]:undefined;}
export async function mappedCheckoutProduct(cart:Item[]){
 const id=singleShopifyProduct(cart);if(!id||!await productSyncEnabled())return undefined;
 const [row]=await db()`SELECT whop_id,title FROM nexool_product_links WHERE scope=${productScope()} AND shopify_id=${id} AND whop_id IS NOT NULL AND synced_hash IS NOT NULL`;
 return row?{id:row.whop_id as string,title:row.title as string}:undefined;
}
export function cartDescription(cart:Item[]){return Array.from(cart.map(i=>`${i.title}${i.variantTitle?' / '+i.variantTitle:''} × ${i.quantity}`).join('; ')).slice(0,1000).join('');}
