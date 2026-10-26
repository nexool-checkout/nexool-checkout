import test from 'node:test';
import assert from 'node:assert/strict';
import {productScope,productCreatePayload,productFingerprint,assertProductOwnership,truncateTitle,singleShopifyProduct,cartDescription,syncError,type CatalogProduct} from '../lib/product-sync';
import type {Item} from '../lib/model';
const cream:CatalogProduct={id:'gid://shopify/Product/123',title:'Cooling Relief Cream',description:'A moisturizing cream.',status:'ACTIVE'};
const item=(productId:string,variantId='1')=>({productId,variantId,title:cream.title,variantTitle:'50 ml',quantity:2,price:{amount:'10.00',currencyCode:'USD'},image:null,requiresShipping:true}) as Item;
test('mapping identity separates stores and Whop accounts even when titles match',()=>{
 assert.notEqual(productScope('a.myshopify.com','biz_1'),productScope('b.myshopify.com','biz_1'));
 assert.notEqual(productScope('a.myshopify.com','biz_1'),productScope('a.myshopify.com','biz_2'));
 const payload=productCreatePayload(cream,'a.myshopify.com','biz_1','ptc_example');
 assert.equal(payload.metadata.shopify_product_id,cream.id);assert.equal(payload.account_id,'biz_1');assert.equal(payload.product_tax_code_id,'ptc_example');assert.equal(payload.visibility,'hidden');assert.equal(payload.send_welcome_message,false);
});
test('renaming preserves the external product identity while changing the sync fingerprint',()=>{
 const renamed={...cream,title:'New cream name'};
 assert.equal(productCreatePayload(renamed,'shop','biz').metadata.shopify_product_id,cream.id);
 assert.notEqual(productFingerprint(cream),productFingerprint(renamed));assert.equal(productFingerprint(cream),productFingerprint({...cream}));
});
test('provider title limits preserve emoji and the full Shopify name remains outside the provider title',()=>{
 const p={...cream,title:'🧴'.repeat(100),description:'a'.repeat(1700)};const body=productCreatePayload(p,'shop','biz');
 assert.equal(Array.from(body.title).length,80);assert.equal(body.description.length,1500);assert.equal(p.title.length,200);assert.equal(truncateTitle('🧴'.repeat(40),30),'🧴'.repeat(30));
});
test('wrong product, store or account mappings cannot be used for an update',()=>{
 const product={id:'prod_test',account:{id:'biz_1'},metadata:{shopify_shop:'a.myshopify.com',shopify_product_id:cream.id}};
 assert.doesNotThrow(()=>assertProductOwnership(product,cream.id,'a.myshopify.com','biz_1'));
 assert.throws(()=>assertProductOwnership(product,'gid://shopify/Product/999','a.myshopify.com','biz_1'));
 assert.throws(()=>assertProductOwnership(product,cream.id,'b.myshopify.com','biz_1'));
 assert.throws(()=>assertProductOwnership(product,cream.id,'a.myshopify.com','biz_2'));
});
test('multiple variants of one product share a mapping while mixed and legacy carts keep the fallback',()=>{
 assert.equal(singleShopifyProduct([item(cream.id,'1'),item(cream.id,'2')]),cream.id);
 assert.equal(singleShopifyProduct([item(cream.id),item('gid://shopify/Product/456')]),undefined);
 const legacy={...item(cream.id)};delete legacy.productId;assert.equal(singleShopifyProduct([legacy]),undefined);assert.equal(singleShopifyProduct([]),undefined);
});
test('cart descriptions preserve product, variant and quantity without inventing separate charges',()=>{
 assert.equal(cartDescription([item(cream.id)]),'Cooling Relief Cream / 50 ml × 2');assert.equal(Array.from(cartDescription([{...item(cream.id),title:'a'.repeat(1200)}])).length,1000);
});
test('provider failures do not expose API bodies or credentials in the setup page',()=>{
 const message=syncError({statusCode:403,body:{secret:'do_not_expose'}});assert.match(message,/403/);assert(!message.includes('do_not_expose'));
});
