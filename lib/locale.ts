export const locales = ['en','af','sq','am','ar','hy','az','eu','be','bn','bs','bg','ca','ceb','ny','zh-CN','zh-TW','co','hr','cs','da','nl','eo','et','tl','fi','fr','fy','gl','ka','de','el','ht','ha','he','hi','hmn','hu','is','ig','id','ga','it','ja','jv','kn','kk','km','ko','ku','ky','lo','la','lv','lt','lb','mk','mg','ms','ml','mt','mr','mn','my','ne','no','ps','fa','pl','pt','pa','ro','ru','sm','gd','sr','st','sn','sd','si','sk','sl','so','es','su','sw','sv','tg','ta','te','th','tr','uk','ur','uz','vi','cy','yi','yo','zu'] as const;
export type Locale=typeof locales[number];
export type Messages=Record<string,string>;
export function normalizeLocale(value?:string|null):Locale|undefined {
 if(typeof value!=='string')return;
 const tag=value?.trim().replace(/_/g,'-').toLowerCase();if(!tag)return;
 if(tag.startsWith('zh'))return /(?:tw|hk|mo|hant)/.test(tag)?'zh-TW':'zh-CN';
 const base=tag.split('-')[0],alias:Record<string,string>={nb:'no',nn:'no',iw:'he',fil:'tl',jw:'jv'};
 return locales.find(l=>l===(alias[base]||base));
}
export function resolveLocale(explicit:string|undefined,acceptLanguage:string|null):Locale {
 const chosen=normalizeLocale(explicit);if(chosen)return chosen;
 const preferences=(acceptLanguage||'').split(',').map((entry,index)=>{const [tag,...params]=entry.trim().split(';');const quality=params.find(p=>p.trim().startsWith('q='));return {tag,index,q:quality?Number(quality.trim().slice(2)):1};}).filter(p=>Number.isFinite(p.q)&&p.q>0&&p.q<=1).sort((a,b)=>b.q-a.q||a.index-b.index);
 for(const {tag} of preferences){const locale=normalizeLocale(tag);if(locale)return locale;}return 'en';
}
export function translate(messages:Messages,source:string,values:Record<string,string|number>={}) {
 if(!source.trim())return source;
 const key=source.trim(),text=messages[key]||key;
 return source.slice(0,source.indexOf(key))+text.replace(/\{\{(\w+)\}\}/g,(match,k)=>Object.hasOwn(values,k)?String(values[k]):match)+source.slice(source.indexOf(key)+key.length);
}
export function languageHost(locale:Locale){return locale==='en'?'nexool.shop':`${locale==='he'?'iw':locale==='jv'?'jw':locale.toLowerCase()}.nexool.shop`;}
export function storefrontForLocale(storefront:string,locale:Locale){
 try{const url=new URL(storefront);if(['nexool.shop','www.nexool.shop'].includes(url.hostname))url.hostname=languageHost(locale);return url.href.replace(/\/+$/,'');}catch{return storefront;}
}
export function whopLocale(locale:Locale):'en'|'es'|'zh'|'nl'|'pt'|'de'|'hu'|'it'|'fr'|'ja'|'pl'|'tr' {
 if(locale.startsWith('zh'))return 'zh';
 return (['en','es','nl','pt','de','hu','it','fr','ja','pl','tr'] as const).find(l=>l===locale)||'en';
}
export function localeUrl(path:string,locale:Locale){const url=new URL(path,'https://checkout.nexool.shop');url.searchParams.set('lang',locale);return url.pathname+url.search+url.hash;}
