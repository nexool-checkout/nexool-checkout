'use client';
import {useEffect,useRef,useState} from 'react';
import type {ProductSyncState} from '@/lib/product-sync';
const empty:ProductSyncState={available:false,enabled:false,importing:false,pending:0,ready:0,synced:0,failed:0,imported:0,errors:[]};
export default function ProductSyncControls({initial}:{initial:ProductSyncState|null}){
 const [state,setState]=useState(initial||empty),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const stopped=useRef(false),running=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stopped.current=true;};},[]);
 useEffect(()=>{if(initial&&!running.current)setState(initial);},[initial]);
 async function request(action:string,payload:unknown={}){
  const response=await fetch(`/api/admin/product-sync/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Product sync could not be updated.');return result as ProductSyncState;
 }
 async function run(){
  if(running.current)return;running.current=true;stopped.current=false;setBusy(true);setError('');
  try{
   while(mounted.current&&!stopped.current){
    const next=await request('run');if(stopped.current||!mounted.current)break;setState(next);
    if(!next.enabled||(!next.importing&&next.ready===0))break;
    await new Promise(resolve=>setTimeout(resolve,750));
   }
  }catch(e){if(mounted.current&&!stopped.current)setError(e instanceof Error?e.message:'Product sync failed.');}
  finally{running.current=false;if(mounted.current)setBusy(false);}
 }
 async function toggle(){
  const enabled=!state.enabled;if(!enabled)stopped.current=true;setSaving(true);setError('');
  try{setState(await request('settings',{enabled}));}
  catch(e){setError(e instanceof Error?e.message:'Unable to save product sync.');}
  finally{setSaving(false);}
 }
 async function start(action:'import'|'retry'){
  setError('');setSaving(true);
  try{setState(await request(action));void run();}
  catch(e){setError(e instanceof Error?e.message:'Unable to start product sync.');}
  finally{setSaving(false);}
 }
 return <section className="product-sync-panel" aria-labelledby="product-sync-title">
  <div className="section-title"><h2 id="product-sync-title">4. Shopify → Whop product sync</h2><button type="button" role="switch" aria-checked={state.enabled} aria-label="Automatic Shopify to Whop product sync" className={`sync-switch ${state.enabled?'is-on':''}`} disabled={saving} onClick={toggle}><span aria-hidden="true"/>{saving?'Saving…':state.enabled?'On':'Off'}</button></div>
  <p>When on, new and renamed Shopify products sync to Whop. Import your existing catalog once. When off, checkout uses your configured Whop product and receipt title.</p>
  <p className="fine-print">Turning this off pauses future syncing. Products already created in Whop remain, and an in-progress request may finish. Products are linked by ID, so matching names do not cause duplicates.</p>
  <div className="sync-counts" aria-live="polite"><span><strong>{state.synced}</strong> synced</span><span><strong>{state.pending}</strong> pending</span><span><strong>{state.failed}</strong> need attention</span></div>
  <div className="button-row"><button type="button" className="button" disabled={!state.enabled||busy||saving} onClick={()=>start('import')}>Import / refresh all products</button><button type="button" className="button secondary" disabled={!state.enabled||busy||saving||(!state.importing&&!state.pending)} onClick={()=>run()}>Continue sync</button><button type="button" className="button secondary" disabled={!state.enabled||busy||saving||!state.failed} onClick={()=>start('retry')}>Retry failed products</button></div>
  {busy&&<p role="status">Syncing products… You can turn the switch off to pause. If you close this page, use Continue sync when you return.</p>}
  {!busy&&(state.importing||state.pending>0)&&<p className="fine-print">{state.imported} catalog products queued so far. Progress is saved in Neon.</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  {state.errors.length>0&&<ul className="sync-errors">{state.errors.map(item=><li key={item.productId}><code>{item.productId}</code><p>{item.message}</p></li>)}</ul>}
  <p className="fine-print">A cart containing one Shopify product uses its synced Whop product once ready. Mixed-product carts keep one payment with item names in its description. New Whop products start hidden and inherit the tax category of your configured checkout product when it has one. Whop names are limited to 80 characters.</p>
 </section>;
}
