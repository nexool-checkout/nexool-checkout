import LocalizedPage from '@/components/LocalizedPage';
import Checkout from '@/components/OnePageCheckout';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{lang?:string}>}){const {lang}=await searchParams;return <LocalizedPage lang={lang}><Checkout preview storefront={(process.env.STOREFRONT_URL||'').trim().replace(/\/+$/,'')} supportEmail={process.env.SUPPORT_EMAIL||''} enabled={false}/></LocalizedPage>;}
