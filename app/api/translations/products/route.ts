import {NextRequest,NextResponse} from 'next/server';
import {normalizeLocale} from '@/lib/locale';
import {fetchPublicTranslation,parseProductTranslation} from '@/lib/translation-catalog';
export async function GET(request:NextRequest){
 const locale=normalizeLocale(request.nextUrl.searchParams.get('lang'));
 const lines=[...new Set((request.nextUrl.searchParams.get('lines')||'').split(','))];
 if(!locale||lines.length>25||lines.some(h=>!/^[a-z0-9][a-z0-9-]{0,254}:\d{1,20}$/.test(h)))return NextResponse.json({error:'Invalid translation request'},{status:400});
 if(locale==='en')return NextResponse.json({});
 const entries=await Promise.all(lines.map(async line=>{const [handle,variant]=line.split(':');try{return [line,parseProductTranslation(await fetchPublicTranslation(`/products/${handle}?variant=${variant}&view=nexool-checkout-locale`,locale))] as const;}catch{return [line,null] as const;}}));
 const complete=entries.every(([,value])=>value?.title);
 return NextResponse.json(Object.fromEntries(entries),{headers:{'Cache-Control':complete?'public, max-age=300, s-maxage=3600':'no-store'}});
}
