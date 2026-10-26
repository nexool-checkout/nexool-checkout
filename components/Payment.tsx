'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {loadWhop} from '@whop/elements';
import type {PaymentElementHandle,PaymentRequestResource,WalletAvailability} from '@whop/elements/payments';
import {WhopElements,Payments,PaymentElement,AddressElement,BrandingElement,usePayments,useWhop} from '@whop/elements-react';
import type {CheckoutSession} from './Checkout';
import {addressSchema,formatMoney,type Address,type Item,type Quote} from '@/lib/model';
import {assertWalletQuote,quoteMinor,subtotalMinor,walletDelivery,walletLocation,walletLineItems,walletShippingOptions,sameWalletDelivery,walletCancelled,walletEmail,type ExpressLocation} from '@/lib/express';

type Market={cart:Item[];country:string;currency:string};
type Props={token:string;session:CheckoutSession;address:Address;quoteReady:boolean;updating:boolean;discountCode:string;shippingHandle:string;onBusy?:(busy:boolean)=>void;onCommit?:()=>void;onQuoted:(session:CheckoutSession)=>void;onMarket:(market:Market,location:ExpressLocation)=>void};
type WalletType='apple_pay'|'google_pay';
const elements=loadWhop(),cardFields={billingDetails:'never' as const,phone:'never' as const},cardOrder=['card'];
function explain(error:unknown){if(error instanceof Error){if(error.name==='AbortError'||error.name==='TimeoutError')return 'Delivery calculation took too long. Complete delivery on this page and try again.';return error.message;}return 'Secure payment could not be completed. Please try again.';}
async function request(path:string,payload:unknown,token:string,timeout=55000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{const response=await fetch(`/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(payload),signal:controller.signal});const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to confirm the order');return result;}finally{clearTimeout(timer);}
}
function PaymentForm(props:Props){
 const payments=usePayments(),whop=useWhop(),latest=useRef(props);latest.current=props;
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sameBilling,setSameBilling]=useState(true),[availability,setAvailability]=useState<WalletAvailability|null>(null),[portal,setPortal]=useState<HTMLElement|null>(null);
 const paymentElement=useRef<PaymentElementHandle|null>(null),selectedCard=useRef(false),operation=useRef(false),committed=useRef(false),wallet=useRef<PaymentRequestResource|null>(null),walletCurrency=useRef('');
 const approval=useRef<{session:CheckoutSession;amount:number;currency:string;type:WalletType}|null>(null);
 const initialCountry=useRef(props.session.country),billingDefaults=useMemo(()=>({name:`${props.address.firstName} ${props.address.lastName}`.trim(),address:{country:props.address.countryCode}}),[sameBilling]);
 const defaults=useMemo(()=>({billingDetails:{address:{country:initialCountry.current}}}),[]);
 const filters=useMemo(()=>({applePay:availability?.applePay?'never' as const:'auto' as const,googlePay:availability?.googlePay?'never' as const:'auto' as const}),[availability?.applePay,availability?.googlePay]);
 const returnUrl=`${location.origin}/return?session=${props.token}`;
 function amountFor(p:Props){return p.session.quote&&p.session.quote.currency===p.session.currency?quoteMinor(p.session.quote):subtotalMinor(p.session.cart,p.session.currency);}
 useEffect(()=>{setPortal(document.getElementById('express-checkout'));},[]);
 useEffect(()=>{
  if(!whop)return;let active=true;const currency=props.session.currency,off:(()=>void)[]=[];setAvailability(null);
  try{
   const current=latest.current,resource=whop.payments.paymentRequest.create({accountId:current.session.accountId,currency:currency.toLowerCase(),amount:amountFor(current),requestPayerEmail:true,requestShipping:true,...(current.quoteReady&&current.session.quote?{shippingOptions:walletShippingOptions(current.session.quote),lineItems:walletLineItems(current.session.quote)}:{})});
   wallet.current=resource;walletCurrency.current=currency;
   let locationForSheet:ExpressLocation|undefined,selected=current.quoteReady?current.session.quote?.shippingHandle||'':'';
   async function preview(location:ExpressLocation){
    const p=latest.current,result:Market&{quote:Quote}=await request('express/quote',{location,discountCode:p.discountCode,shippingHandle:selected},p.token,21000);
    if(result.currency!==currency){p.onMarket(result,location);throw new Error(`Your delivery country uses ${result.currency}. Close the wallet, review that currency and try again.`);}
    selected=result.quote.shippingHandle;return {amount:quoteMinor(result.quote),lineItems:walletLineItems(result.quote),shippingOptions:walletShippingOptions(result.quote)};
   }
   off.push(resource.onShippingAddressChange(async event=>{
    try{locationForSheet=walletLocation(event.address,latest.current.address);event.updateWith(await preview(locationForSheet));}
    catch(e){const message=explain(e);setError(message);event.updateWith({errors:[{code:'shipping_address_unserviceable',message}]});}
   }));
   off.push(resource.onShippingOptionChange(async event=>{
    try{selected=event.option.id;if(!locationForSheet)throw new Error('Choose your delivery address in the wallet.');event.updateWith(await preview(locationForSheet));}
    catch(e){const message=explain(e);setError(message);event.updateWith({errors:[{code:'shipping_option_invalid',message}]});}
   }));
   off.push(resource.onPaymentAuthorization(async event=>{
    approval.current=null;
    try{
     const p=latest.current,address=walletDelivery(event),result:CheckoutSession=await request('quote',{address,discountCode:p.discountCode,shippingHandle:event.shipping?.option?.id||selected,express:true},p.token,21000);
     p.onQuoted(result);if(!result.quote)throw new Error('Your delivery total could not be confirmed.');
     assertWalletQuote(result.quote,currency,event.amount,event.shipping?.option?.id);
     if(event.type!=='apple_pay'&&event.type!=='google_pay')throw new Error('This wallet is not available here.');
     approval.current={session:result,amount:event.amount,currency,type:event.type};event.respondWith({approved:true});
    }catch(e){const message=explain(e)+' Close the wallet to review your order.';setError(message);try{event.respondWith({approved:false,message});}catch{/* Expired sheets cannot authorize a token. */}}
   }));
   resource.canMakePayment({types:['apple_pay','google_pay']}).then(result=>{if(active)setAvailability(result);}).catch(()=>{if(active)setAvailability(null);});
  }catch{wallet.current=null;}
  return()=>{active=false;for(const unsubscribe of off)unsubscribe();};
 },[whop,props.session.accountId,props.session.currency,props.token]);
 useEffect(()=>{
  if(operation.current||!wallet.current)return;
  try{wallet.current.update({amount:amountFor(props),...(props.quoteReady&&props.session.quote?{lineItems:walletLineItems(props.session.quote),shippingOptions:walletShippingOptions(props.session.quote)}:{lineItems:[],shippingOptions:[]})});}catch{/* Open sheets own their updates. */}
 },[props.session,props.quoteReady,busy]);
 async function complete(token:string,session:CheckoutSession,approvedAmount:number,currency:string){
  if(!session.address||!session.quote)throw new Error('Complete delivery details before paying.');
  const preparation:CheckoutSession=await request('prepare',{total:session.quote.total,currency:session.quote.currency,shippingHandle:session.quote.shippingHandle,discountCode:session.quote.discountCode||'',address:session.address},latest.current.token);
  // Recheck the Shopify and Whop quote before submitting the confirmation token.
  assertWalletQuote(preparation.quote!,currency,approvedAmount);
  committed.current=true;latest.current.onCommit?.();
  const payment=await request('pay',{confirmationToken:token},latest.current.token);
  if(payment.status==='paid'||!payment.clientSecret){location.assign(returnUrl);return;}
  const result=await whop!.payments.handleNextAction({clientSecret:payment.clientSecret,returnUrl});
  if(result.redirected)return;
  if(['succeeded','processing','paid'].includes(result.status)){location.assign(returnUrl);return;}
  throw new Error(result.lastPaymentError?.message||'Check your payment status before trying again.');
 }
 async function startWallet(type:WalletType){
  if(operation.current||!wallet.current||!whop||props.updating)return;
  if(walletCurrency.current!==latest.current.session.currency){setError('Your payment currency is updating. Try again in a moment.');return;}
  operation.current=true;approval.current=null;setError('');
  try{
   // Keep show() synchronous with the click so browsers retain user activation.
   const email=walletEmail(props.address.email),showing=wallet.current.show(type,email?{email}:undefined);
   setBusy(true);latest.current.onBusy?.(true);
   const result=await showing,approved=approval.current as {session:CheckoutSession;amount:number;currency:string;type:WalletType}|null;
   if(!approved||result.type!==approved.type||!sameWalletDelivery(walletDelivery(result),approved.session.address!))throw new Error('Your wallet details changed. Review delivery and try again.');
   await complete(result.ctok,approved.session,approved.amount,approved.currency);
  }catch(e){if(committed.current||!walletCancelled(e))setError(explain(e));}
  finally{operation.current=false;approval.current=null;setBusy(false);latest.current.onBusy?.(false);}
 }
 async function pay(){
  const p=latest.current;if(!payments||!whop||operation.current||!p.quoteReady||!p.session.quote||!addressSchema.safeParse(p.address).success)return;
  operation.current=true;setBusy(true);p.onBusy?.(true);setError('');
  const snapshot={...p.session,address:{...p.address}},a=snapshot.address;
  try{
   const billingDetails={email:a.email,...(a.phone?{phone:a.phone}:{}),...(sameBilling?{name:`${a.firstName} ${a.lastName}`.trim(),address:{country:a.countryCode,line1:a.address1,line2:a.address2,city:a.city,state:a.provinceCode,postal_code:a.zip}}:{})};
   const {confirmationToken}=await payments.createConfirmationToken({billingDetails});await complete(confirmationToken,snapshot,quoteMinor(snapshot.quote!),snapshot.quote!.currency);
  }catch(e){if(committed.current||!walletCancelled(e))setError(explain(e));}
  finally{operation.current=false;setBusy(false);latest.current.onBusy?.(false);}
 }
 const ordered=(availability?.order||['apple_pay','google_pay']).filter((type):type is WalletType=>(type==='apple_pay'&&!!availability?.applePay)||(type==='google_pay'&&!!availability?.googlePay));
 return <>
  {portal&&ordered.length>0&&createPortal(<section className="express-checkout" aria-label="Express checkout"><p>Express checkout</p><div className="express-buttons">{ordered.map(type=>{
   const art=availability?.wallets?.[type]?.button?.light,label=type==='apple_pay'?'Apple Pay':'Google Pay';
   return <button key={type} type="button" className="express-wallet" aria-label={`Pay with ${label}`} style={art?{backgroundColor:art.color}:undefined} disabled={busy||props.updating||committed.current} onClick={()=>startWallet(type)}>{art?<img src={art.image} alt="" aria-hidden="true"/>:<span>{label}</span>}</button>;
  })}</div><div className="express-divider"><span>or pay below</span></div></section>,portal)}
  <p className="muted">All transactions are encrypted. Choose your preferred payment method.</p>
  <PaymentElement ref={paymentElement} order={cardOrder} fields={cardFields} defaultValues={defaults} wallets={filters} onReady={()=>{if(!selectedCard.current){selectedCard.current=true;void paymentElement.current?.select('card').catch(()=>{});}}} onChange={event=>setReady(event.complete)}/>
  <label className="checkbox"><input type="checkbox" checked={sameBilling} disabled={busy} onChange={event=>setSameBilling(event.target.checked)}/> Billing address matches shipping</label>
  {!sameBilling&&<AddressElement mode="billing" defaultValues={billingDefaults}/>}
  <BrandingElement/>
  {error&&<div className="error" role="alert">{error}{committed.current&&<a className="quiet-link" href={returnUrl}>Check payment status →</a>}</div>}
  <button type="button" className="button full" disabled={!ready||busy||!props.quoteReady||props.updating||committed.current} onClick={pay}>{busy?'Confirming payment…':props.quoteReady&&props.session.quote?`Pay ${formatMoney(props.session.quote.total,props.session.quote.currency)}`:props.updating?'Updating delivery total…':'Complete delivery details to pay'}<span>→</span></button>
  <p className="fine-print">One-time purchase. Your final delivery total is confirmed before payment.</p>
 </>;
}
export default function Payment(props:Props){
 const [loadError,setLoadError]=useState(''),amount=props.session.quote&&props.session.quote.currency===props.session.currency?quoteMinor(props.session.quote):subtotalMinor(props.session.cart,props.session.currency);
 if(loadError)return <div className="error">{loadError}<button className="text-button" onClick={()=>location.reload()}>Reload payment</button></div>;
 return <WhopElements elements={elements} onLoadError={()=>setLoadError('Secure payment could not load. Please refresh or contact the store.')}><Payments accountId={props.session.accountId} currency={props.session.currency.toLowerCase()} amount={amount} returnUrl={`${location.origin}/return?session=${props.token}`}><PaymentForm {...props}/></Payments></WhopElements>;
}
