import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {appUrl,required} from './config';
import {db} from './db';
import type {Session} from './model';
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function equal(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);}
export function sameOrigin(req:Request){if(req.headers.get('origin')!==appUrl())throw new Error('Invalid request origin');}
export async function body(req:Request){if(Number(req.headers.get('content-length')||0)>24000)throw new Error('Request too large');const raw=await req.text();if(raw.length>24000)throw new Error('Request too large');return JSON.parse(raw);}
export function tokenFrom(req:Request){const token=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid checkout link');return token;}
export async function sessionFor(req:Request){const token=tokenFrom(req);const [row]=await db()`SELECT * FROM nexool_sessions WHERE token_hash=${hash(token)}`;if(!row)throw new Error('Checkout not found');return row as Session;}
export function requireFresh(s:Session){if(new Date(s.expires_at).getTime()<Date.now())throw new Error('This checkout expired. Return to the store and try again.');}
export function adminCookie(){const exp=Date.now()+3600_000;const sig=createHmac('sha256',required('ADMIN_SECRET')).update(String(exp)).digest('hex');return `${exp}.${sig}`;}
export function isAdmin(req:Request){const cookie=req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('nexool_admin='))?.slice(13)||'';const [exp,sig]=cookie.split('.');if(!exp||!sig||Number(exp)<Date.now()||Number(exp)>Date.now()+3600_000)return false;return equal(sig,createHmac('sha256',required('ADMIN_SECRET')).update(exp).digest('hex'));}
export function requireAdmin(req:Request){if(!isAdmin(req))throw new Error('Sign in to setup first');}
export function publicError(e:unknown){
 const message=e instanceof Error?e.message:'Unable to complete this request';
 // External SDK errors may contain account details; never return their bodies.
 if(e&&typeof e==='object'&&('statusCode' in e||'body' in e))return 'The payment provider could not complete this request. Please contact the store.';
 if(/postgres|connect|relation|password|ECONN|ENOTFOUND|SQL|database|Missing server setting/i.test(message))return 'Checkout setup is incomplete or temporarily unavailable. Please contact the store.';
 return message.slice(0,350);
}
export function fail(e:unknown,status=400){return Response.json({error:publicError(e)},{status});}
