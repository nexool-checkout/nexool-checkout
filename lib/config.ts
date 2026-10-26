export function required(name:string){const value=process.env[name]?.trim();if(!value)throw new Error(`Missing server setting: ${name}`);return value;}
export function appUrl(){const url=required('APP_URL');const u=new URL(url);if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))throw new Error('APP_URL must use HTTPS');return u.origin;}
export function shopDomain(){const v=required('SHOPIFY_SHOP_DOMAIN');if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(v))throw new Error('Invalid Shopify shop domain');return v;}
export function enabledCurrencies(){return (process.env.WHOP_ENABLED_CURRENCIES||'USD').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);}
export function paymentReady(){return process.env.CHECKOUT_ENABLED==='true'&&process.env.PAYMENT_SETTINGS_VERIFIED==='true';}
export const requiredNames=['APP_URL','STOREFRONT_URL','SHOPIFY_SHOP_DOMAIN','SHOPIFY_CLIENT_ID','SHOPIFY_CLIENT_SECRET','WHOP_BUSINESS_ID','WHOP_API_KEY','WHOP_WEBHOOK_SECRET','WHOP_PRODUCT_ID','DATABASE_URL','ADMIN_SECRET','CRON_SECRET'];
