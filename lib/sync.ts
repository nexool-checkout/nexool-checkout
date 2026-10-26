import {db} from './db';
import {whop,validatePayment} from './whop';
import {completeDraft,fulfillments} from './shopify';
import type {Session} from './model';
import {required} from './config';
export async function syncPayment(id:string){
 const p=await whop().payments.retrieve({id});
 const sessionId=p.metadata?.nexool_session;if(typeof sessionId!=='string'||!/^[a-f0-9-]{36}$/.test(sessionId))return;
 const [found]=await db()`SELECT * FROM nexool_sessions WHERE id=${sessionId}`;if(!found)return;
 const s=found as Session;validatePayment(p,s);
 await db()`UPDATE nexool_sessions SET payment_id=${p.id},updated_at=NOW() WHERE id=${s.id} AND (payment_id IS NULL OR payment_id=${p.id})`;
 if(p.status!=='paid')return;
 if(s.order_id){await syncTracking(s);await db()`UPDATE nexool_sessions SET updated_at=NOW() WHERE id=${s.id}`;return;}
 const [claimed]=await db()`UPDATE nexool_sessions SET status='syncing',updated_at=NOW() WHERE id=${s.id} AND order_id IS NULL AND (status!='syncing' OR updated_at<NOW()-INTERVAL '2 minutes') RETURNING id`;
 if(!claimed)return;
 try {
  const order=await completeDraft({...s,payment_id:p.id});
  await db()`UPDATE nexool_sessions SET order_id=${order.id},order_url=${order.statusPageUrl},status='complete',last_error=NULL,updated_at=NOW() WHERE id=${s.id}`;
 }catch(e){await db()`UPDATE nexool_sessions SET status='needs_review',last_error=${e instanceof Error?e.message.slice(0,300):'Order synchronization failed'},updated_at=NOW() WHERE id=${s.id}`;throw e;}
}
export async function syncTracking(s:Session){
 if(process.env.TRACKING_SYNC_ENABLED!=='true'||!s.order_id||!s.payment_id)return;
 const shipments=await fulfillments(s.order_id);const numbers=[...new Set<string>(shipments.filter((f:any)=>f.status!=='CANCELLED'&&f.status!=='FAILURE').flatMap((f:any)=>f.trackingInfo.map((t:any)=>t.number).filter(Boolean)))];
 if(!numbers.length)return;
 if(numbers.length>1){await db()`INSERT INTO nexool_tracking(order_id,error) VALUES(${s.order_id},'Multiple tracking numbers: review in Whop manually') ON CONFLICT(order_id) DO UPDATE SET error=EXCLUDED.error`;return;}
 const [old]=await db()`SELECT * FROM nexool_tracking WHERE order_id=${s.order_id}`;if(old?.tracking_number===numbers[0]&&old.synced_at)return;
 const p=await whop().payments.retrieve({id:s.payment_id});
 if(p.shipment_id)await whop().shipments.update({id:p.shipment_id,tracking_number:numbers[0]},{idempotencyKey:`track-${s.id}-${numbers[0]}`});
 else await whop().shipments.create({account_id:required('WHOP_BUSINESS_ID'),payment_id:s.payment_id,tracking_number:numbers[0]},{idempotencyKey:`track-${s.id}-${numbers[0]}`});
 await db()`INSERT INTO nexool_tracking(order_id,tracking_number,synced_at,error) VALUES(${s.order_id},${numbers[0]},NOW(),NULL) ON CONFLICT(order_id) DO UPDATE SET tracking_number=EXCLUDED.tracking_number,synced_at=NOW(),error=NULL`;
}
export async function reconcile(){
 const events=await db()`SELECT id,payment_id FROM nexool_events WHERE processed_at IS NULL ORDER BY received_at ASC LIMIT 25`;
 for(const event of events){try{await syncPayment(event.payment_id);await db()`UPDATE nexool_events SET processed_at=NOW() WHERE id=${event.id}`;}catch{/* Retain the durable event for the next attempt. */}}
 const rows=await db()`SELECT * FROM nexool_sessions WHERE payment_id IS NOT NULL AND (order_id IS NULL OR created_at>NOW()-INTERVAL '55 days') ORDER BY updated_at ASC LIMIT 25`;
 const results=[];for(const row of rows){try{await syncPayment(row.payment_id);results.push({id:row.id,ok:true});}catch{results.push({id:row.id,ok:false});}}
 // Daily privacy cleanup excludes ambiguous payment attempts, which need reconciliation.
 await db()`DELETE FROM nexool_sessions WHERE payment_id IS NULL AND status IN ('cart','quoted','preparing','ready','quoting') AND expires_at<NOW()-INTERVAL '7 days'`;
 await db()`DELETE FROM nexool_limits WHERE resets_at<NOW()-INTERVAL '1 day'`;
 await db()`DELETE FROM nexool_events WHERE processed_at IS NOT NULL AND received_at<NOW()-INTERVAL '90 days'`;
 return results;
}
