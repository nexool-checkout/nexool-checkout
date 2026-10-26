import Checkout from '@/components/OnePageCheckout';
export const dynamic='force-dynamic';
export default function Page(){return <Checkout preview storefront={(process.env.STOREFRONT_URL||'').trim().replace(/\/+$/,'')} supportEmail={process.env.SUPPORT_EMAIL||''} enabled={false}/>;}
