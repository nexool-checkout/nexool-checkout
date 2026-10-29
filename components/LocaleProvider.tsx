'use client';
import {createContext,useContext,useEffect,useMemo,type ReactNode} from 'react';
import {localeUrl,translate,type Locale,type Messages} from '@/lib/locale';
const Context=createContext<{locale:Locale;messages:Messages}>({locale:'en',messages:{}});
export default function LocaleProvider({locale,messages,children}:{locale:Locale;messages:Messages;children:ReactNode}){
 useEffect(()=>{document.documentElement.lang=locale;document.documentElement.dir=['ar','he','fa','ur','ps','sd','yi'].includes(locale)?'rtl':'ltr';document.title=translate(messages,'Secure checkout');},[locale,messages]);
 const value=useMemo(()=>({locale,messages}),[locale,messages]);
 return <Context.Provider value={value}><div lang={locale} dir={['ar','he','fa','ur','ps','sd','yi'].includes(locale)?'rtl':'ltr'}>{children}</div></Context.Provider>;
}
export function useLocale(){
 const {locale,messages}=useContext(Context);
 return useMemo(()=>{const countries=new Intl.DisplayNames([locale],{type:'region'});return {locale,t:(source:string,values?:Record<string,string|number>)=>translate(messages,source,values),money:(amount:string,currency:string)=>new Intl.NumberFormat(locale,{style:'currency',currency}).format(Number(amount)),country:(code:string)=>countries.of(code)||code,url:(path:string)=>localeUrl(path,locale)};},[locale,messages]);
}
export function LocalizedText({children}:{children:string}){const {t}=useLocale();return <>{t(children)}</>;}
export function LocalizedConsent({storeUrl}:{storeUrl:string}){
 const {t}=useLocale();
 return <>{t('By placing your order, you agree to our {{terms}} and {{privacy}}.').split(/(\{\{terms\}\}|\{\{privacy\}\})/).map((part,index)=>part==='{{terms}}'?<a key={index} href={`${storeUrl}/policies/terms-of-service`}>{t('terms')}</a>:part==='{{privacy}}'?<a key={index} href={`${storeUrl}/policies/privacy-policy`}>{t('privacy policy')}</a>:part)}</>;
}
