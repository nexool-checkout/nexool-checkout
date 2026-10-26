import Checkout from '@/components/OnePageCheckout';
export const dynamic='force-dynamic';
export default function Page(){return <Checkout storefront={(process.env.STOREFRONT_URL||'').trim().replace(/\/+$/,'')} supportEmail={process.env.SUPPORT_EMAIL||''} enabled={process.env.CHECKOUT_ENABLED==='true'} autocompleteEnabled={!!process.env.GOOGLE_PLACES_API_KEY}/>;}
