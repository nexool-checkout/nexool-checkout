'use client';
import {useEffect,useId,useRef,useState} from 'react';
import type {Address} from '@/lib/model';
type Suggestion={id:string;title:string;description:string;text:string;proof:string};
export default function AddressAutocomplete({value,country,token,enabled,disabled,onChange,onSelect}:{value:string;country:string;token:string;enabled:boolean;disabled:boolean;onChange:(value:string)=>void;onSelect:(address:Partial<Address>)=>void}){
 const id=useId(),session=useRef(''),generation=useRef(0),[items,setItems]=useState<Suggestion[]>([]),[active,setActive]=useState(-1),[focused,setFocused]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[chosen,setChosen]=useState(''),[manual,setManual]=useState(false),[attributions,setAttributions]=useState<{name:string;url:string}[]>([]);
 useEffect(()=>{generation.current++;session.current='';setItems([]);setChosen('');setNotice('');setAttributions([]);setManual(false);},[country]);
 useEffect(()=>{
  const revision=++generation.current;setItems([]);setActive(-1);setBusy(false);
  if(!enabled||disabled||!token||!focused||manual||value.trim().length<3||value===chosen)return;
  const controller=new AbortController();
  const timer=setTimeout(async()=>{setBusy(true);setNotice('');session.current||=crypto.randomUUID();try{
   const response=await fetch('/api/address/suggest',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({input:value,country,sessionToken:session.current}),signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error('Suggestions unavailable. You can enter your address manually.');
   if(generation.current===revision){setItems(data.suggestions||[]);if(!data.suggestions?.length)setNotice('No matches. You can enter your address manually.');}
  }catch(e){if(generation.current===revision&&!controller.signal.aborted)setNotice(e instanceof Error?e.message:'Enter your address manually.');}finally{if(generation.current===revision)setBusy(false);}},350);
  return()=>{clearTimeout(timer);controller.abort();};
 },[value,country,enabled,disabled,token,focused,manual,chosen]);
 async function select(item:Suggestion){
  const revision=++generation.current;setBusy(true);setItems([]);setNotice('');
  try{const response=await fetch('/api/address/resolve',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({id:item.id,proof:item.proof,country,sessionToken:session.current})});const data=await response.json();if(!response.ok)throw new Error('We could not fill that address. Please enter it manually.');
   if(generation.current!==revision)return;const address=data.address;setChosen(address.address1||value);setAttributions(data.attributions||[]);onSelect({...address,address1:address.address1||value});setNotice('Address filled. Check the building number and add any apartment or district.');setFocused(false);
  }catch(e){if(generation.current===revision)setNotice(e instanceof Error?e.message:'Enter your address manually.');}finally{if(generation.current===revision){setBusy(false);session.current='';}}
 }
 const open=focused&&items.length>0&&!disabled;
 return <div className="address-search"><label htmlFor={id}>Address</label><div className="search-input"><input id={id} name="address1" value={value} onChange={e=>{setFocused(true);setManual(false);setChosen('');onChange(e.target.value);}} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} disabled={disabled} required minLength={3} maxLength={150} autoComplete="shipping address-line1" placeholder={enabled?'Start typing your street address':'Street address and house number'} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open&&active>=0?`${id}-option-${active}`:undefined} aria-describedby={`${id}-help`} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();setItems([]);setManual(true);}
  if(!open)return;
  if(e.key==='ArrowDown'){e.preventDefault();setActive(n=>(n+1)%items.length);}else if(e.key==='ArrowUp'){e.preventDefault();setActive(n=>(n<=0?items.length:n)-1);}else if(e.key==='Enter'&&active>=0){e.preventDefault();select(items[active]);}
 }}/><span className="search-icon" aria-hidden="true">{busy?<span className="spinner"/>:<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.5"/><path d="m15 15 5 5" stroke="currentColor" strokeWidth="1.5"/></svg>}</span></div>
 {open&&<div className="suggestion-panel"><ul id={`${id}-list`} role="listbox" aria-label="Suggested addresses">{items.map((item,i)=><li key={item.id} id={`${id}-option-${i}`} role="option" aria-selected={active===i}><button type="button" tabIndex={-1} className={active===i?'highlighted':''} onMouseDown={e=>e.preventDefault()} onClick={()=>select(item)}><span className="pin-icon" aria-hidden="true">⌖</span><span><strong>{item.title}</strong><small>{item.description}</small></span></button></li>)}</ul><div className="suggestion-footer"><button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>{setManual(true);setItems([]);setNotice('Enter the rest of your address below.');}}>Enter address manually</button><span className="google-attribution">Google Maps</span></div></div>}
 <div id={`${id}-help`} className="field-help" aria-live="polite">{notice||''}{chosen&&enabled&&<span className="google-attribution"> · Google Maps</span>}{attributions.map((a,i)=><span key={i}>{a.url?<a href={a.url} target="_blank" rel="noreferrer">{a.name}</a>:a.name}</span>)}</div></div>;
}
