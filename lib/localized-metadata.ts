import type {Metadata} from 'next';
import {headers} from 'next/headers';
import {resolveLocale,translate} from './locale';
import {loadMessages} from './translation-catalog';

export async function generateMetadata({searchParams}:{searchParams:Promise<{lang?:string}>}):Promise<Metadata>{
 const {lang}=await searchParams;
 const locale=resolveLocale(lang,(await headers()).get('accept-language'));
 return {title:translate(await loadMessages(locale),'Secure checkout')};
}
