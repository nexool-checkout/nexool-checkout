'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import type {Address} from '@/lib/model';
import {addressSchema,formatMoney} from '@/lib/model';
import {addressRows,addressRules} from '@/lib/address-rules';
import countries from '@/lib/countries.json';
import {Bag,Lock,type CheckoutSession} from './Checkout';
import AddressAutocomplete from './AddressAutocomplete';
const Payment=dynamic(()=>import('./Payment'),{ssr:false,loading:()=> <p className="muted">Loading secure payment…</p>});
const initialAddress:Address={email:'',firstName:'',lastName:'',address1:'',address2:'',city:'',provinceCode:'',zip:'',countryCode:'US',phone:''};
const demo:CheckoutSession={id:'preview',cart:[{variantId:'1',quantity:1,title:'Your selected product',variantTitle:'Your selected option',image:null,price:{amount:'39.00',currencyCode:'USD'},requiresShipping:true}],country:'US',currency:'USD',address:null,quote:null,status:'cart',orderUrl:null,expiresAt:'2099-01-01T00:00:00Z',accountId:''};
const fingerprint=(a:Address,d:string,h:string)=>JSON.stringify([a,d,h]);
function Truck(){return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M2 5h12v12H2zM14 9h4l4 5v3h-8" stroke="currentColor" strokeWidth="1.4"/><circle cx="6" cy="18" r="2" fill="white" stroke="currentColor"/><circle cx="18" cy="18" r="2" fill="white" stroke="currentColor"/></svg>;}

export default function OnePageCheckout({storefront,supportEmail,enabled,preview=false,autocompleteEnabled=false}:{storefront:string;supportEmail:string;enabled:boolean;preview?:boolean;autocompleteEnabled?:boolean}){
 const [session,setSession]=useState<CheckoutSession|null>(preview?demo:null),[token,setToken]=useState('');
 const [address,setAddress]=useState<Address>(initialAddress),[discount,setDiscount]=useState(''),[appliedDiscount,setAppliedDiscount]=useState(''),[shippingHandle,setShippingHandle]=useState('');
 const [quoteKey,setQuoteKey]=useState(''),[failedKey,setFailedKey]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[paying,setPaying]=useState(false),[committed,setCommitted]=useState(false),[loading,setLoading]=useState(!preview);
 const [showApartment,setShowApartment]=useState(false),[summaryOpen,setSummaryOpen]=useState(false);
 const mounted=useRef(false),requestActive=useRef(false),keyRef=useRef('');
 const key=fingerprint(address,appliedDiscount,shippingHandle);keyRef.current=key;
 const locked=committed||!!session&&['ready','preparing','paying','payment_pending','payment_unknown','complete','syncing','needs_review','needs_configuration'].includes(session.status);
 const rules=addressRules(address.countryCode),currentQuote=!!session?.quote&&quoteKey===key;
 const api=useCallback(async(path:string,data?:unknown,t=token)=>{
  const res=await fetch(`/api/${path}`,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});
  const result=await res.json();if(!res.ok)throw new Error(result.error||'Please try again');return result;
 },[token]);
 useEffect(()=>{
  mounted.current=true;if(preview)return()=>{mounted.current=false;};let active=true;
  (async()=>{try{
   const stored=new URLSearchParams(location.search).get('session');
   if(stored){
    const result:CheckoutSession=await api('session',undefined,stored);if(!active)return;
    setToken(stored);setSession(result);
    if(result.address){setAddress(result.address);setShowApartment(!!result.address.address2);}
    if(result.quote&&result.address){const d=result.quote.discountCode||'',h=result.quote.shippingHandle;setDiscount(d);setAppliedDiscount(d);setShippingHandle(h);setQuoteKey(fingerprint(result.address,d,h));}
    if(['paying','payment_pending','payment_unknown','complete','syncing','needs_review'].includes(result.status))location.replace(`/return?session=${stored}`);
   }else if(location.hash.startsWith('#cart=')){
    const raw=location.hash.slice(6);if(raw.length>16000)throw new Error('Cart is too large');
    const result=await api('session',JSON.parse(decodeURIComponent(raw)));if(!active)return;
    setToken(result.token);setSession(result);setAddress(a=>({...a,countryCode:result.country}));history.replaceState({},'',`/?session=${result.token}`);
   }
  }catch(e){if(active)setError(e instanceof Error?e.message:'Unable to open checkout');}finally{if(active)setLoading(false);}})();
  return()=>{active=false;mounted.current=false;};
 },[preview]);
 const calculate=useCallback(async()=>{
  if(requestActive.current||locked||paying||!session||!addressSchema.safeParse(address).success)return;
  const requestedKey=key;requestActive.current=true;setBusy(true);setError('');
  try{
   const result:CheckoutSession=preview?{...demo,address,quote:{currency:'USD',subtotal:'39.00',shipping:shippingHandle==='demo-express'?'9.95':'4.95',tax:'0.00',discount:'0.00',total:shippingHandle==='demo-express'?'48.95':'43.95',taxesIncluded:false,rates:[{handle:'demo-standard',title:'Standard delivery · example',price:{amount:'4.95',currencyCode:'USD'}},{handle:'demo-express',title:'Express delivery · example',price:{amount:'9.95',currencyCode:'USD'}}],shippingHandle:shippingHandle||'demo-standard',warnings:[],discountCode:appliedDiscount},status:'quoted'}:await api('quote',{address,discountCode:appliedDiscount,shippingHandle});
   if(!mounted.current||keyRef.current!==requestedKey)return;
   const handle=result.quote!.shippingHandle;setSession(result);setShippingHandle(handle);setQuoteKey(fingerprint(address,appliedDiscount,handle));setFailedKey('');
  }catch(e){if(mounted.current&&keyRef.current===requestedKey){setError(e instanceof Error?e.message:'Unable to calculate your order');setFailedKey(requestedKey);}}
  finally{requestActive.current=false;if(mounted.current)setBusy(false);}
 },[address,appliedDiscount,shippingHandle,key,locked,paying,session,preview,api]);
 useEffect(()=>{
  if(loading||busy||locked||paying||currentQuote||failedKey===key||!session||!addressSchema.safeParse(address).success)return;
  const timer=setTimeout(()=>calculate(),700);return()=>clearTimeout(timer);
 },[address,key,failedKey,session,loading,busy,locked,paying,currentQuote,calculate]);
 function change(field:keyof Address,value:string){if(locked||paying)return;setError('');setAddress(a=>({...a,[field]:value}));}
 function countryChange(value:string){if(locked||paying)return;setError('');setShippingHandle('');setAddress(a=>({...a,countryCode:value,provinceCode:'',zip:'',city:''}));}
 function chooseAddress(values:Partial<Address>){if(locked||paying)return;setError('');setShippingHandle('');setShowApartment(Boolean(values.address2));setAddress(a=>({...a,...values,address2:values.address2||a.address2}));}
 const q=currentQuote?session?.quote:null,currency=q?.currency||session?.currency||'USD',total=q?.total||String(session?.cart.reduce((sum,i)=>sum+Number(i.price.amount)*i.quantity,0)||0);
 const disabled=locked||paying;
 const itemCount=session?.cart.reduce((n,i)=>n+i.quantity,0)||0;
 function field(name:string){
  if(name==='address1')return <AddressAutocomplete key={name} value={address.address1} country={address.countryCode} token={token} enabled={autocompleteEnabled&&!preview} disabled={disabled} onChange={v=>change('address1',v)} onSelect={chooseAddress}/>;
  if(name==='address2'&&!showApartment&&!address.address2)return <button key={name} type="button" className="add-apartment" onClick={()=>setShowApartment(true)} disabled={disabled}>＋ Add apartment, suite or district <span>(optional)</span></button>;
  if(name==='province')return rules.zones.length?<label key={name}>{rules.provinceLabel}<select name="province" autoComplete="shipping address-level1" value={address.provinceCode} onChange={e=>change('provinceCode',e.target.value)} required><option value="">Select {rules.provinceLabel.toLowerCase()}</option>{rules.zones.map(z=><option key={z.code} value={z.code}>{z.name}</option>)}</select></label>:<label key={name}>{rules.provinceLabel} <span className="optional">(optional)</span><input name="province" autoComplete="shipping address-level1" maxLength={50} value={address.provinceCode} onChange={e=>change('provinceCode',e.target.value)}/></label>;
  const props:Record<string,{label:string;auto:string;required?:boolean;max:number;placeholder?:string}>={firstName:{label:'First name',auto:'given-name',max:80},lastName:{label:'Last name',auto:'family-name',required:true,max:80},address2:{label:'Apartment, suite, building or district',auto:'address-line2',max:150},city:{label:rules.cityLabel,auto:'address-level2',required:rules.city,max:100},zip:{label:rules.zipLabel,auto:'postal-code',required:rules.zip,max:20,placeholder:rules.zipExample}};
  const p=props[name];if(!p)return null;const k=name as keyof Address;
  return <label key={name}>{p.label}{!p.required&&<span className="optional"> (optional)</span>}<input name={name} autoComplete={`shipping ${p.auto}`} required={p.required} maxLength={p.max} placeholder={p.placeholder} value={address[k]} onChange={e=>change(k,e.target.value)}/></label>;
 }
 return <>
  <div className="top-note"><Lock/> Secure checkout <span>·</span> One-time purchase</div>
  <header className="header"><span className="checkout-label">Secure checkout</span><a className="return-shop" href={`${storefront}/cart`}><Bag/> Back to your bag</a></header>
  {preview&&<div className="preview-banner">DESIGN PREVIEW · Example product and prices · No payments</div>}
  <main className="checkout-grid"><section className="checkout-main">
   <div className="checkout-title"><h1>Checkout</h1><span><Lock/> Safe & secure</span></div>
   {error&&<div className="error" role="alert">{error}{!session&&<a className="quiet-link" href={`${storefront}/checkout`}>Use the store checkout →</a>}</div>}
   {loading?<div className="empty"><span className="spinner"/> Getting your bag ready…</div>:!session?<div className="empty"><h2>{enabled?'Your bag is waiting.':'Checkout is being prepared.'}</h2><p>Add products to your bag in the store, then continue here to checkout.</p><a className="button" href={storefront}>Return to store →</a><a className="quiet-link" href="/preview">Preview checkout design</a></div>:<>
    <form onSubmit={e=>{e.preventDefault();setFailedKey('');calculate();}} aria-label="Delivery details"><fieldset disabled={disabled}>
     <section className="form-section"><div className="section-title"><h2>Contact</h2><span>For your receipt and order updates</span></div><label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} value={address.email} onChange={e=>change('email',e.target.value)} placeholder="you@example.com"/></label></section>
     <section className="form-section"><div className="section-title"><h2>Delivery</h2></div><label>Country / region<select name="country" autoComplete="shipping country" value={address.countryCode} onChange={e=>countryChange(e.target.value)}>{countries.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
      {addressRows(address.countryCode).map((row,i)=><div className={`field-row fields-${row.length}`} key={i}>{row.map(field)}</div>)}
      <label>Phone number <span className="optional">(optional)</span><input name="phone" type="tel" autoComplete="tel" maxLength={30} value={address.phone} onChange={e=>change('phone',e.target.value)} placeholder={rules.phonePrefix?`+${rules.phonePrefix} Phone number`:'Include country code'}/></label><p className="field-help">Used only if we need to contact you about delivery.</p>
     </section></fieldset>{locked&&<p className="locked-note"><Lock/> Your details are reserved for this payment.</p>}
     <section className="form-section shipping-section" aria-labelledby="shipping-heading"><div className="section-title"><h2 id="shipping-heading">Shipping method</h2>{busy&&<span role="status"><span className="spinner"/> Updating</span>}</div>
      {q?q.rates.length?q.rates.map(rate=><label key={rate.handle} className={`shipping-option ${q.shippingHandle===rate.handle?'selected':''}`}><input type="radio" name="shipping" checked={q.shippingHandle===rate.handle} disabled={disabled||busy} onChange={()=>{setShippingHandle(rate.handle);setError('');}}/><span>{rate.title}</span><strong>{Number(rate.price.amount)===0?'Free':formatMoney(rate.price.amount,rate.price.currencyCode)}</strong></label>):<div className="inline-placeholder">No shipping required for this order.</div>:<div className="inline-placeholder" role="status"><Truck/><span>{busy?'Finding shipping options and confirming your total…':'Enter your delivery address to see available shipping options.'}</span></div>}
      {failedKey===key&&!locked&&<button type="submit" className="text-button" disabled={busy}>Try calculating delivery again</button>}
     </section>
    </form>
    <section className="form-section payment-section" aria-labelledby="payment-heading"><div className="section-title"><h2 id="payment-heading">Payment</h2><Lock/></div>
     {q&&!preview&&!busy?<Payment key={quoteKey} token={token} session={session} onBusy={setPaying} onCommit={()=>setCommitted(true)}/>:<div className="payment-waiting"><div className="payment-waiting-title"><span className="card-outline" aria-hidden="true">▰</span><strong>{preview?'Secure payment · preview':'Secure payment'}</strong><Lock/></div><p>{preview?'Your available cards and wallets will appear here after Whop is connected.':'Your available cards and wallets will appear here once your delivery total is confirmed.'}</p><div className="payment-placeholder" aria-hidden="true"><span>Card details</span><Lock/></div><div className="payment-placeholder-row" aria-hidden="true"><span>Expiration date</span><span>Security code</span></div><button type="button" className="button full" disabled>{preview?'Preview only — no payment':'Complete delivery details above'}<Lock/></button></div>}
     <p className="order-consent">By placing your order, you agree to our <a href={`${storefront}/policies/terms-of-service`}>terms</a> and <a href={`${storefront}/policies/privacy-policy`}>privacy policy</a>.</p>
    </section>
   </>}
   <footer className="checkout-footer"><a href={`${storefront}/policies/refund-policy`}>Refund policy</a><a href={`${storefront}/policies/shipping-policy`}>Shipping policy</a><a href={`${storefront}/policies/privacy-policy`}>Privacy</a><a href={supportEmail?`mailto:${supportEmail}`:`${storefront}/pages/contact`}>Contact us</a></footer>
  </section>
  <aside className={`summary-panel ${summaryOpen?'summary-open':''}`} aria-label="Order summary"><div className="summary-sticky">
   <button type="button" className="mobile-summary-toggle" aria-expanded={summaryOpen} aria-controls="order-summary-content" onClick={()=>setSummaryOpen(v=>!v)}><span><Bag/>{summaryOpen?'Hide':'Show'} order summary <span aria-hidden="true">{summaryOpen?'⌃':'⌄'}</span></span><strong>{formatMoney(total,currency)}</strong></button>
   <div id="order-summary-content" className="summary-content"><div className="summary-top"><h2>Order summary</h2><span>{itemCount} {itemCount===1?'item':'items'}</span></div>
    {session?.cart.map(item=><div className="order-item" key={item.variantId}><div className="item-image">{item.image?<img src={item.image} alt={item.title}/>:<div className="product-placeholder generic-product"><Bag/></div>}<span className="item-count">{item.quantity}</span></div><div className="item-copy"><h3>{item.title}</h3><p>{item.variantTitle}</p></div><strong>{formatMoney(String(Number(item.price.amount)*item.quantity),item.price.currencyCode)}</strong></div>)}
    {!session&&<p className="muted">Your selected products will appear here.</p>}
    <div className="discount-row"><label className="sr-only" htmlFor="discount-code">Discount code</label><input id="discount-code" value={discount} disabled={disabled||!session} maxLength={80} placeholder="Discount code" onChange={e=>setDiscount(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setAppliedDiscount(discount.trim());setFailedKey('');}}}/><button type="button" className="button secondary" disabled={disabled||busy||!session||discount.trim()===appliedDiscount} onClick={()=>{setAppliedDiscount(discount.trim());setFailedKey('');}}>Apply</button></div>
    {appliedDiscount&&!q&&<p className="field-help">The code will be checked with your delivery total.</p>}{preview&&appliedDiscount&&<p className="field-help">Preview only. Discounts are checked in the connected checkout.</p>}
    <div className="totals" aria-live="polite"><div><span>Subtotal{q?'':' · estimated'}</span><span>{formatMoney(q?.subtotal||total,currency)}</span></div>{q&&Number(q.discount)>0&&<div className="saving"><span>Discounts included</span><span>{formatMoney(q.discount,currency)}</span></div>}<div><span>Shipping</span><span>{q?Number(q.shipping)===0?'Free':formatMoney(q.shipping,currency):busy?'Updating…':'Enter delivery address'}</span></div><div><span>{q?.taxesIncluded?'Included tax':'Tax'}</span><span>{q?formatMoney(q.tax,currency):'Calculated at checkout'}</span></div></div>
    <div className="grand-total"><span>{q?'Total':'Estimated total'}</span><div><small>{currency}</small><strong>{formatMoney(total,currency)}</strong></div></div><p className="currency-note">{q?`You’ll be charged in ${currency}.`:'Shipping, tax and currency are confirmed for your delivery country.'}</p>
    <div className="trust-list"><div><span className="trust-icon"><Lock/></span><div><strong>Secure payment</strong><p>Your payment details are encrypted and handled by Whop.</p></div></div><div><span className="trust-icon"><Truck/></span><div><strong>Delivery, kept simple</strong><p>Choose from the shipping options available for your address.</p></div></div><div><span className="trust-icon"><Bag/></span><div><strong>Here to help</strong><p>Questions about your order? <a href={supportEmail?`mailto:${supportEmail}`:`${storefront}/pages/contact`}>Contact the store.</a></p></div></div></div>
   </div></div></aside>
  </main><div className="bottom-brand"><Lock/> Secure checkout</div>
 </>;
}
