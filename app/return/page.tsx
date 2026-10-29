import LocalizedPage from '@/components/LocalizedPage';
import ReturnStatus from '@/components/ReturnStatus';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{lang?:string}>}){const {lang}=await searchParams;return <LocalizedPage lang={lang}><ReturnStatus storefront={(process.env.STOREFRONT_URL||'').trim().replace(/\/+$/,'')} supportEmail={process.env.SUPPORT_EMAIL||''}/></LocalizedPage>;}
