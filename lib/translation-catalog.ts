import catalog from './checkout-messages.json';
import {languageHost,type Locale,type Messages} from './locale';
import {refineCheckoutCopy} from './locale-copy';
export function decodePublicText(html:string){
 const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
 return html.replace(/<[^>]*>/g,'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(match,value:string)=>{
  if(value[0]!=='#')return entities[value.toLowerCase()]||match;
  const code=value[1].toLowerCase()==='x'?parseInt(value.slice(2),16):parseInt(value.slice(1),10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';
 }).trim();
}
export function parseMessages(html:string):Messages {
 const values=new Map<string,string>();for(const match of html.matchAll(/<p\b[^>]*data-nexool-i18n="([a-f0-9]{16})"[^>]*>([\s\S]*?)<\/p>/g))values.set(match[1],decodePublicText(match[2]));
 const messages:Messages={};for(const {id,source} of catalog){const value=values.get(id);if(!value||value.length>3000)continue;
  // Never lose or invent amount/currency placeholders during translation.
  const tokens=(s:string)=>[...s.matchAll(/\{\{\w+\}\}/g)].map(m=>m[0]).sort().join('|');
  if(tokens(source)===tokens(value))messages[source.trim()]=value;
 }return messages;
}
export async function fetchPublicTranslation(path:string,locale:Locale){
 const response=await fetch(`https://${languageHost(locale)}${path}`,{redirect:'error',signal:AbortSignal.timeout(6000),next:{revalidate:3600},headers:{Accept:'text/html'}});
 if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw new Error('Translation unavailable');
 const html=await response.text();if(html.length>500000)throw new Error('Translation too large');return html;
}
export async function loadMessages(locale:Locale):Promise<Messages>{
 if(locale==='en')return {};
 try{return refineCheckoutCopy(locale,parseMessages(await fetchPublicTranslation('/search?view=nexool-checkout-locale',locale)));}catch{return {};}
}
export function parseProductTranslation(html:string){
 const title=html.match(/<p\b[^>]*data-nexool-product="\d+"[^>]*>([\s\S]*?)<\/p>/)?.[1];
 const variants:Record<string,string>={};for(const m of html.matchAll(/<p\b[^>]*data-nexool-variant="(\d+)"[^>]*>([\s\S]*?)<\/p>/g))variants[m[1]]=decodePublicText(m[2]).slice(0,500);
 return {title:title?decodePublicText(title).slice(0,500):'',variants};
}
