'use client';
import {useEffect,useState} from 'react';
import type {Item} from '@/lib/model';
import type {Locale} from '@/lib/locale';
type ProductCopy={title:string;variants:Record<string,string>};
export function useProductTranslations(items:Item[]|undefined,locale:Locale){
 const lines=[...new Set(items?.filter(i=>i.productHandle).map(i=>`${i.productHandle}:${i.variantId}`)||[])].sort().join(',');
 const [copy,setCopy]=useState<Record<string,ProductCopy|null>>({});
 useEffect(()=>{
  setCopy({});if(!lines||locale==='en')return;const controller=new AbortController();
  fetch(`/api/translations/products?${new URLSearchParams({lang:locale,lines})}`,{signal:controller.signal}).then(r=>r.ok?r.json():{}).then(data=>{if(!controller.signal.aborted)setCopy(data);}).catch(()=>{});
  return()=>controller.abort();
 },[lines,locale]);
 return (item:Item)=>{const translation=item.productHandle?copy[`${item.productHandle}:${item.variantId}`]:null;return {title:translation?.title||item.title,variantTitle:translation?.variants[item.variantId]??item.variantTitle};};
}
