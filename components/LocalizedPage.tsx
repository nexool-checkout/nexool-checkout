import {headers} from 'next/headers';
import {resolveLocale} from '@/lib/locale';
import {loadMessages} from '@/lib/translation-catalog';
import LocaleProvider from './LocaleProvider';
export default async function LocalizedPage({children,lang}:{children:React.ReactNode;lang?:string}){
 const locale=resolveLocale(lang,(await headers()).get('accept-language'));
 const messages=await loadMessages(locale),availableLocale=locale!=='en'&&!Object.keys(messages).length?'en':locale;
 return <LocaleProvider locale={availableLocale} messages={messages}>{children}</LocaleProvider>;
}
