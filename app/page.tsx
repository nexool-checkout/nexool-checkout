import LocalizedPage from '@/components/LocalizedPage';
import Checkout from '@/components/OnePageCheckout';
export {generateMetadata} from '@/lib/localized-metadata';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{lang?:string}>}){const {lang}=await searchParams;return <LocalizedPage lang={lang}><Checkout storefront={(process.env.STOREFRONT_URL||'').trim().replace(/\/+$/,'')} supportEmail={process.env.SUPPORT_EMAIL||''} enabled={process.env.CHECKOUT_ENABLED==='true'} autocompleteEnabled={!!process.env.GOOGLE_PLACES_API_KEY}/></LocalizedPage>;}
