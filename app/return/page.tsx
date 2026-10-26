import ReturnStatus from '@/components/ReturnStatus';
export const dynamic='force-dynamic';
export default function Page(){return <ReturnStatus storefront={(process.env.STOREFRONT_URL||'').trim().replace(/\/+$/,'')} supportEmail={process.env.SUPPORT_EMAIL||''}/>;}
