'use client';
import {useState} from 'react';
import {loadWhop} from '@whop/elements';
import {WhopElements,Payments,PaymentElement,AddressElement,BrandingElement,usePayments,useWhop} from '@whop/elements-react';
import type {CheckoutSession} from './Checkout';
import {formatMoney,moneyMinor} from '@/lib/model';
type Props={token:string;session:CheckoutSession;onBusy?:(busy:boolean)=>void;onCommit?:()=>void};
const elements=loadWhop();
function PayForm({token,session,onBusy,onCommit}:Props){
 const payments=usePayments(),whop=useWhop();const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sameBilling,setSameBilling]=useState(true);
 const a=session.address!;const returnUrl=`${location.origin}/return?session=${token}`;
 async function pay(){if(!payments||!whop||busy)return;setBusy(true);onBusy?.(true);setError('');try{
  const billingDetails={email:a.email,...(sameBilling?{name:`${a.firstName} ${a.lastName}`,address:{country:a.countryCode,line1:a.address1,line2:a.address2,city:a.city,state:a.provinceCode,postal_code:a.zip}}:{})};
  const {confirmationToken}=await payments.createConfirmationToken({billingDetails});
  onCommit?.();
  const preparation=await fetch('/api/prepare',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({total:session.quote!.total,currency:session.quote!.currency,shippingHandle:session.quote!.shippingHandle,discountCode:session.quote!.discountCode||'',address:a})});
  if(!preparation.ok){const problem=await preparation.json();throw new Error(problem.error||'Unable to confirm your order total.');}
  const prepared=await preparation.json();
  if(prepared.quote.paymentMinor!==paymentAmount(session))throw new Error('The payment currency precision changed. Contact the store before paying.');
  const response=await fetch('/api/pay',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({confirmationToken})});const p=await response.json();
  if(!response.ok)throw new Error(p.error||'Unable to confirm payment');
  if(p.status==='paid'){location.assign(returnUrl);return;}
  if(!p.clientSecret){location.assign(returnUrl);return;}
  const result=await whop.payments.handleNextAction({clientSecret:p.clientSecret});
  if(result.redirected)return;
  if(result.status==='succeeded'||result.status==='processing'){location.assign(returnUrl);return;}
  setError(result.lastPaymentError?.message||'The payment step was not completed. Check your order status before trying again.');
 }catch(e){setError(e instanceof Error?e.message:'Payment could not be completed');}finally{setBusy(false);onBusy?.(false);}}
 return <><p className="muted">All transactions are encrypted. Choose your preferred payment method.</p><PaymentElement onChange={e=>setReady(e.complete)}/><label className="checkbox"><input type="checkbox" checked={sameBilling} onChange={e=>setSameBilling(e.target.checked)}/> Billing address matches shipping</label>{!sameBilling&&<AddressElement mode="billing" defaultValues={{name:`${a.firstName} ${a.lastName}`,address:{country:a.countryCode}}}/>}<BrandingElement/>{error&&<div className="error" role="alert">{error}<a className="quiet-link" href={returnUrl}>Check payment status →</a></div>}<button type="button" className="button full" disabled={!ready||busy} onClick={pay}>{busy?'Confirming payment…':`Pay ${formatMoney(session.quote!.total,session.quote!.currency)}`}<span>→</span></button><p className="fine-print">One-time purchase. You’ll review any bank verification before the order is completed.</p></>;
}
export default function Payment({token,session,onBusy,onCommit}:Props){
 const [loadError,setLoadError]=useState('');
 if(loadError)return <div className="error">{loadError}<button className="text-button" onClick={()=>location.reload()}>Reload payment</button></div>;
 return <WhopElements elements={elements} onLoadError={()=>setLoadError('Secure payment could not load. Please refresh or contact the store.')}><Payments accountId={session.accountId} currency={session.quote!.currency.toLowerCase()} amount={paymentAmount(session)} returnUrl={`${location.origin}/return?session=${token}`}><PayForm token={token} session={session} onBusy={onBusy} onCommit={onCommit}/></Payments></WhopElements>;
}
function paymentAmount(session:CheckoutSession){return session.quote!.paymentMinor??moneyMinor(session.quote!.total,new Intl.NumberFormat('en',{style:'currency',currency:session.quote!.currency}).resolvedOptions().maximumFractionDigits??2);}
