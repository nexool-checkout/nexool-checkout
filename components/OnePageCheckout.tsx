'use client';
import {storefrontForLocale} from '@/lib/locale';
import {useProductTranslations} from './useProductTranslations';
import {useLocale,LocalizedText,LocalizedConsent} from './LocaleProvider';
import {useCallback,useEffect,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import type {Address,Item} from '@/lib/model';
import type {ExpressLocation} from '@/lib/express';
import {addressSchema} from '@/lib/model';
import {addressRows,addressRules} from '@/lib/address-rules';
import countries from '@/lib/countries.json';
import {Bag,Lock,type CheckoutSession} from './Checkout';
import AddressAutocomplete from './AddressAutocomplete';
import {checkoutToken,rememberCheckoutToken} from '@/lib/browser-session';
import {trackCheckoutEvent} from '@/lib/meta-pixel';
const Payment=dynamic(()=>import('./Payment'),{ssr:false,loading:()=> <p className="muted"><LocalizedText>Loading secure payment…</LocalizedText></p>});
const initialAddress:Address={email:'',firstName:'',lastName:'',address1:'',address2:'',city:'',provinceCode:'',zip:'',countryCode:'US',phone:''};
const demo:CheckoutSession={id:'preview',cart:[{variantId:'1',quantity:1,title:'Your selected product',variantTitle:'Your selected option',image:null,price:{amount:'39.00',currencyCode:'USD'},requiresShipping:true}],country:'US',currency:'USD',address:null,quote:null,status:'cart',orderUrl:null,expiresAt:'2099-01-01T00:00:00Z',accountId:''};
const fingerprint=(a:Address,d:string,h:string)=>JSON.stringify([a,d,h]);
function Truck(){return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M2 5h12v12H2zM14 9h4l4 5v3h-8" stroke="currentColor" strokeWidth="1.4"/><circle cx="6" cy="18" r="2" fill="white" stroke="currentColor"/><circle cx="18" cy="18" r="2" fill="white" stroke="currentColor"/></svg>;}

export default function OnePageCheckout({storefront,supportEmail,enabled,preview=false,autocompleteEnabled=false}:{storefront:string;supportEmail:string;enabled:boolean;preview?:boolean;autocompleteEnabled?:boolean}){
 const {t,money,country,url,locale}=useLocale();
 const storeUrl=storefrontForLocale(storefront,locale);
 const [session,setSession]=useState<CheckoutSession|null>(preview?demo:null),[token,setToken]=useState('');
 const productCopy=useProductTranslations(session?.cart,locale);
 const [address,setAddress]=useState<Address>(initialAddress),[discount,setDiscount]=useState(''),[appliedDiscount,setAppliedDiscount]=useState(''),[shippingHandle,setShippingHandle]=useState('');
 const [quoteKey,setQuoteKey]=useState(''),[failedKey,setFailedKey]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[paying,setPaying]=useState(false),[committed,setCommitted]=useState(false),[loading,setLoading]=useState(!preview);
 const [showApartment,setShowApartment]=useState(false),[summaryOpen,setSummaryOpen]=useState(false);
 const [marketBusy,setMarketBusy]=useState(false);const marketRequest=useRef(0),selectedCountry=useRef(address.countryCode);selectedCountry.current=address.countryCode;
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
   const stored=checkoutToken();
   if(stored){
    const result:CheckoutSession=await api('session',undefined,stored);if(!active)return;
    setToken(stored);setSession(result);rememberCheckoutToken(stored,url('/'));
    if(!['complete','paying','payment_pending','payment_unknown','syncing','needs_review'].includes(result.status))void trackCheckoutEvent(result.tracking,'InitiateCheckout');
    if(result.address){setAddress(result.address);setShowApartment(!!result.address.address2);}
    if(result.quote&&result.address){const d=result.quote.discountCode||'',h=result.quote.shippingHandle;setDiscount(d);setAppliedDiscount(d);setShippingHandle(h);setQuoteKey(fingerprint(result.address,d,h));}
    if(['paying','payment_pending','payment_unknown','complete','syncing','needs_review'].includes(result.status))location.replace(url(`/return?session=${stored}`));
   }else if(location.hash.startsWith('#cart=')){
    const raw=location.hash.slice(6);if(raw.length>16000)throw new Error('Cart is too large');
    const result=await api('session',JSON.parse(decodeURIComponent(raw)));if(!active)return;
    setToken(result.token);setSession(result);setAddress(a=>({...a,countryCode:result.country}));
    if(!rememberCheckoutToken(result.token,url('/')))history.replaceState({},'',url(`/?session=${result.token}`));
    void trackCheckoutEvent(result.tracking,'InitiateCheckout');
   }
  }catch(e){if(active)setError(e instanceof Error?e.message:'Unable to open checkout');}finally{if(active)setLoading(false);}})();
  return()=>{active=false;mounted.current=false;};
 },[preview]);
 const calculate=useCallback(async()=>{
  if(requestActive.current||locked||paying||marketBusy||!session||!addressSchema.safeParse(address).success)return;
  const requestedKey=key;requestActive.current=true;setBusy(true);setError('');
  try{
   const result:CheckoutSession=preview?{...demo,address,quote:{currency:'USD',subtotal:'39.00',shipping:shippingHandle==='demo-express'?'9.95':'4.95',tax:'0.00',discount:'0.00',total:shippingHandle==='demo-express'?'48.95':'43.95',taxesIncluded:false,rates:[{handle:'demo-standard',title:'Standard delivery · example',price:{amount:'4.95',currencyCode:'USD'}},{handle:'demo-express',title:'Express delivery · example',price:{amount:'9.95',currencyCode:'USD'}}],shippingHandle:shippingHandle||'demo-standard',warnings:[],discountCode:appliedDiscount},status:'quoted'}:await api('quote',{address,discountCode:appliedDiscount,shippingHandle});
   if(!mounted.current||keyRef.current!==requestedKey)return;
   const handle=result.quote!.shippingHandle;setSession(result);setShippingHandle(handle);setQuoteKey(fingerprint(address,appliedDiscount,handle));setFailedKey('');
  }catch(e){if(mounted.current&&keyRef.current===requestedKey){setError(e instanceof Error?e.message:'Unable to calculate your order');setFailedKey(requestedKey);}}
  finally{requestActive.current=false;if(mounted.current)setBusy(false);}
 },[address,appliedDiscount,shippingHandle,key,locked,paying,marketBusy,session,preview,api]);
 useEffect(()=>{
  if(loading||busy||marketBusy||locked||paying||currentQuote||failedKey===key||!session||!addressSchema.safeParse(address).success)return;
  const timer=setTimeout(()=>calculate(),700);return()=>clearTimeout(timer);
 },[address,key,failedKey,session,loading,busy,marketBusy,locked,paying,currentQuote,calculate]);
 function change(field:keyof Address,value:string){if(locked||paying)return;setError('');setAddress(a=>({...a,[field]:value}));}
 function countryChange(value:string){
  if(locked||paying)return;setError('');setQuoteKey('');setFailedKey('');setShippingHandle('');selectedCountry.current=value;setAddress(a=>({...a,countryCode:value,provinceCode:'',zip:'',city:''}));
  if(preview)return;const sequence=++marketRequest.current;setMarketBusy(true);
  api('market',{country:value}).then(result=>{if(mounted.current&&sequence===marketRequest.current&&selectedCountry.current===value)setSession(s=>s?{...s,...result,quote:null}:s);}).catch(e=>{if(mounted.current&&sequence===marketRequest.current)setError(e instanceof Error?e.message:'Unable to load this market.');}).finally(()=>{if(mounted.current&&sequence===marketRequest.current)setMarketBusy(false);});
 }
 function chooseAddress(values:Partial<Address>){if(locked||paying)return;setError('');setShippingHandle('');setShowApartment(Boolean(values.address2));setAddress(a=>({...a,...values,address2:values.address2||a.address2}));}
 function acceptWalletQuote(result:CheckoutSession){
  if(!result.address||!result.quote)return;const code=result.quote.discountCode||'',handle=result.quote.shippingHandle;
  marketRequest.current++;selectedCountry.current=result.country;setMarketBusy(false);setSession(result);setAddress(result.address);setShowApartment(!!result.address.address2);setAppliedDiscount(code);setDiscount(code);setShippingHandle(handle);setQuoteKey(fingerprint(result.address,code,handle));setFailedKey('');setError('');
 }
 function acceptWalletMarket(market:{cart:Item[];country:string;currency:string},location:ExpressLocation){
  marketRequest.current++;selectedCountry.current=market.country;setMarketBusy(false);setSession(s=>s?{...s,...market,quote:null}:s);setQuoteKey('');setShippingHandle('');setAddress(a=>({...a,countryCode:market.country,city:location.city,provinceCode:location.provinceCode,zip:location.zip,address1:location.address1||'',address2:location.address2||''}));
 }
 const q=currentQuote?session?.quote:null,currency=q?.currency||session?.currency||'USD',total=q?.total||String(session?.cart.reduce((sum,i)=>sum+Number(i.price.amount)*i.quantity,0)||0);
 const disabled=locked||paying;
 const itemCount=session?.cart.reduce((n,i)=>n+i.quantity,0)||0;
 function field(name:string){
  if(name==='address1')return <AddressAutocomplete key={name} value={address.address1} country={address.countryCode} token={token} enabled={autocompleteEnabled&&!preview} disabled={disabled} onChange={v=>change('address1',v)} onSelect={chooseAddress}/>;
  if(name==='address2'&&!showApartment&&!address.address2)return <button key={name} type="button" className="add-apartment" onClick={()=>setShowApartment(true)} disabled={disabled}>{t("＋ Add apartment, suite or district ")}<span>{t("(optional)")}</span></button>;
  if(name==='province')return rules.zones.length?<label key={name}>{t(rules.provinceLabel)}<select name="province" autoComplete="shipping address-level1" value={address.provinceCode} onChange={e=>change('provinceCode',e.target.value)} required><option value="">{t('Select {{region}}',{region:t(rules.provinceLabel)})}</option>{rules.zones.map(z=><option key={z.code} value={z.code}>{z.name}</option>)}</select></label>:<label key={name}>{t(rules.provinceLabel)} <span className="optional">{t("(optional)")}</span><input name="province" autoComplete="shipping address-level1" maxLength={50} value={address.provinceCode} onChange={e=>change('provinceCode',e.target.value)}/></label>;
  const props:Record<string,{label:string;auto:string;required?:boolean;max:number;placeholder?:string}>={firstName:{label:'First name',auto:'given-name',max:80},lastName:{label:'Last name',auto:'family-name',required:true,max:80},address2:{label:'Apartment, suite, building or district',auto:'address-line2',max:150},city:{label:rules.cityLabel,auto:'address-level2',required:rules.city,max:100},zip:{label:rules.zipLabel,auto:'postal-code',required:rules.zip,max:20,placeholder:rules.zipExample}};
  const p=props[name];if(!p)return null;const k=name as keyof Address;
  return <label key={name}>{t(p.label)}{!p.required&&<span className="optional"> {t(" (optional)")}</span>}<input name={name} autoComplete={`shipping ${p.auto}`} required={p.required} maxLength={p.max} placeholder={p.placeholder} value={address[k]} onChange={e=>change(k,e.target.value)}/></label>;
 }
 return <>
  <div className="top-note"><Lock/> {t(" Secure checkout ")}<span>·</span> {t(" One-time purchase")}</div>
  <header className="header"><span className="checkout-label">{t("Secure checkout")}</span><a className="return-shop" href={`${storeUrl}/cart`}><Bag/> {t(" Back to your bag")}</a></header>
  {preview&&<div className="preview-banner">{t("DESIGN PREVIEW · Example product and prices · No payments")}</div>}
  <main className="checkout-grid"><section className="checkout-main">
   <div className="checkout-title"><h1>{t("Checkout")}</h1><span><Lock/> {t(" Safe & secure")}</span></div>
   {error&&<div className="error" role="alert">{t(error)}{!session&&<a className="quiet-link" href={`${storeUrl}/checkout`}>{t("Use the store checkout →")}</a>}</div>}
   {loading?<div className="empty"><span className="spinner"/> {t(" Getting your bag ready…")}</div>:!session?<div className="empty"><h2>{enabled?t("Your bag is waiting."):t("Checkout is being prepared.")}</h2><p>{t("Add products to your bag in the store, then continue here to checkout.")}</p><a className="button" href={storeUrl}>{t("Return to store →")}</a><a className="quiet-link" href="/preview">{t("Preview checkout design")}</a></div>:<>
    <div id="express-checkout"/>
    <form onSubmit={e=>{e.preventDefault();setFailedKey('');calculate();}} aria-label={t("Delivery details")}><fieldset disabled={disabled}>
     <section className="form-section"><div className="section-title"><h2>{t("Contact")}</h2><span>{t("For your receipt and order updates")}</span></div><label>{t("Email address")}<input name="email" type="email" autoComplete="email" required maxLength={254} value={address.email} onChange={e=>change('email',e.target.value)} placeholder="you@example.com"/></label></section>
     <section className="form-section"><div className="section-title"><h2>{t("Delivery")}</h2></div><label>{t("Country / region")}<select name="country" autoComplete="shipping country" value={address.countryCode} onChange={e=>countryChange(e.target.value)}>{countries.map(c=><option key={c.code} value={c.code}>{country(c.code)}</option>)}</select></label>
      {addressRows(address.countryCode).map((row,i)=><div className={`field-row fields-${row.length}`} key={i}>{row.map(field)}</div>)}
      <label>{t("Phone number ")}<span className="optional">{t("(optional)")}</span><input name="phone" type="tel" autoComplete="tel" maxLength={30} value={address.phone} onChange={e=>change('phone',e.target.value)} placeholder={rules.phonePrefix?`+${rules.phonePrefix} ${t('Phone number')}`:t("Include country code")}/></label><p className="field-help">{t("Used only if we need to contact you about delivery.")}</p>
     </section></fieldset>{locked&&<p className="locked-note"><Lock/> {t(" Your details are reserved for this payment.")}</p>}
     <section className="form-section shipping-section" aria-labelledby="shipping-heading"><div className="section-title"><h2 id="shipping-heading">{t("Shipping method")}</h2>{busy&&<span role="status"><span className="spinner"/> {t(" Updating")}</span>}</div>
      {q?q.rates.length?q.rates.map(rate=><label key={rate.handle} className={`shipping-option ${q.shippingHandle===rate.handle?'selected':''}`}><input type="radio" name="shipping" checked={q.shippingHandle===rate.handle} disabled={disabled||busy} onChange={()=>{setShippingHandle(rate.handle);setError('');}}/><span>{t(rate.title)}</span><strong>{Number(rate.price.amount)===0?t("Free"):money(rate.price.amount,rate.price.currencyCode)}</strong></label>):<div className="inline-placeholder">{t("No shipping required for this order.")}</div>:<div className="inline-placeholder" role="status"><Truck/><span>{busy?t("Finding shipping options and confirming your total…"):t("Enter your delivery address to see available shipping options.")}</span></div>}
      {failedKey===key&&!locked&&<button type="submit" className="text-button" disabled={busy}>{t("Try calculating delivery again")}</button>}
     </section>
    </form>
    <section className="form-section payment-section" aria-labelledby="payment-heading"><div className="section-title"><h2 id="payment-heading">{t("Payment")}</h2><Lock/></div>
     {!preview?<Payment token={token} session={session} address={address} quoteReady={enabled&&currentQuote} updating={busy||marketBusy||!enabled} discountCode={appliedDiscount} shippingHandle={shippingHandle} onBusy={setPaying} onCommit={()=>setCommitted(true)} onQuoted={acceptWalletQuote} onMarket={acceptWalletMarket}/>:<div className="payment-waiting"><div className="payment-waiting-title"><span className="card-outline" aria-hidden="true">▰</span><strong>{preview?t("Secure payment · preview"):t("Secure payment")}</strong><Lock/></div><p>{preview?t("Your available cards and wallets will appear here after Whop is connected."):t("Your available cards and wallets will appear here once your delivery total is confirmed.")}</p><div className="payment-placeholder" aria-hidden="true"><span>{t("Card details")}</span><Lock/></div><div className="payment-placeholder-row" aria-hidden="true"><span>{t("Expiration date")}</span><span>{t("Security code")}</span></div><button type="button" className="button full" disabled>{preview?t("Preview only — no payment"):t("Complete delivery details above")}<Lock/></button></div>}
     <p className="order-consent"><LocalizedConsent storeUrl={storeUrl}/></p>
    </section>
   </>}
   <footer className="checkout-footer"><a href={`${storeUrl}/policies/refund-policy`}>{t("Refund policy")}</a><a href={`${storeUrl}/policies/shipping-policy`}>{t("Shipping policy")}</a><a href={`${storeUrl}/policies/privacy-policy`}>{t("Privacy")}</a><a href={supportEmail?`mailto:${supportEmail}`:`${storeUrl}/pages/contact`}>{t("Contact us")}</a></footer>
  </section>
  <aside className={`summary-panel ${summaryOpen?'summary-open':''}`} aria-label={t("Order summary")}><div className="summary-sticky">
   <button type="button" className="mobile-summary-toggle" aria-expanded={summaryOpen} aria-controls="order-summary-content" onClick={()=>setSummaryOpen(v=>!v)}><span><Bag/>{summaryOpen?t("Hide order summary"):t("Show order summary")} <span aria-hidden="true">{summaryOpen?'⌃':'⌄'}</span></span><strong>{money(total,currency)}</strong></button>
   <div id="order-summary-content" className="summary-content"><div className="summary-top"><h2>{t("Order summary")}</h2><span>{t('Items: {{count}}',{count:itemCount})}</span></div>
    {session?.cart.map(item=><div className="order-item" key={item.variantId}><div className="item-image">{item.image?<img src={item.image} alt={t(productCopy(item).title)}/>:<div className="product-placeholder generic-product"><Bag/></div>}<span className="item-count">{item.quantity}</span></div><div className="item-copy"><h3>{t(productCopy(item).title)}</h3><p>{t(productCopy(item).variantTitle)}</p></div><strong>{money(String(Number(item.price.amount)*item.quantity),item.price.currencyCode)}</strong></div>)}
    {!session&&<p className="muted">{t("Your selected products will appear here.")}</p>}
    <div className="discount-row"><label className="sr-only" htmlFor="discount-code">{t("Discount code")}</label><input id="discount-code" value={discount} disabled={disabled||!session} maxLength={80} placeholder={t("Discount code")} onChange={e=>setDiscount(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setAppliedDiscount(discount.trim());setFailedKey('');}}}/><button type="button" className="button secondary" disabled={disabled||busy||!session||discount.trim()===appliedDiscount} onClick={()=>{setAppliedDiscount(discount.trim());setFailedKey('');}}>{t("Apply")}</button></div>
    {appliedDiscount&&!q&&<p className="field-help">{t("The code will be checked with your delivery total.")}</p>}{preview&&appliedDiscount&&<p className="field-help">{t("Preview only. Discounts are checked in the connected checkout.")}</p>}
    <div className="totals" aria-live="polite"><div><span>{t("Subtotal")}{q?'':t(" · estimated")}</span><span>{money(q?.subtotal||total,currency)}</span></div>{q&&Number(q.discount)>0&&<div className="saving"><span>{t("Discounts included")}</span><span>{money(q.discount,currency)}</span></div>}<div><span>{t("Shipping")}</span><span>{q?Number(q.shipping)===0?t("Free"):money(q.shipping,currency):busy?t("Updating…"):t("Enter delivery address")}</span></div><div><span>{q?.taxesIncluded?t("Included tax"):t("Tax")}</span><span>{q?money(q.tax,currency):t("Calculated at checkout")}</span></div></div>
    <div className="grand-total"><span>{q?t("Total"):t("Estimated total")}</span><div><small>{currency}</small><strong>{money(total,currency)}</strong></div></div><p className="currency-note">{q?t('You’ll be charged in {{currency}}.',{currency}):t("Shipping, tax and currency are confirmed for your delivery country.")}</p>
    <div className="trust-list"><div><span className="trust-icon"><Lock/></span><div><strong>{t("Secure payment")}</strong><p>{t("Your payment details are encrypted and handled by Whop.")}</p></div></div><div><span className="trust-icon"><Truck/></span><div><strong>{t("Delivery, kept simple")}</strong><p>{t("Choose from the shipping options available for your address.")}</p></div></div><div><span className="trust-icon"><Bag/></span><div><strong>{t("Here to help")}</strong><p>{t("Questions about your order? ")}<a href={supportEmail?`mailto:${supportEmail}`:`${storeUrl}/pages/contact`}>{t("Contact the store.")}</a></p></div></div></div>
   </div></div></aside>
  </main><div className="bottom-brand"><Lock/> {t(" Secure checkout")}</div>
 </>;
}
