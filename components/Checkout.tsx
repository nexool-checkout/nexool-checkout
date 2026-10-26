import type {Address,Item,Quote} from '@/lib/model';
export type CheckoutSession={id:string;cart:Item[];country:string;currency:string;address:Address|null;quote:Quote|null;status:string;orderUrl:string|null;expiresAt:string;accountId:string};
export function Bag(){return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="M5 7h14l1 14H4L5 7Z" stroke="currentColor" strokeWidth="1.5"/><path d="M8 8V6a4 4 0 0 1 8 0v2" stroke="currentColor" strokeWidth="1.5"/></svg>;}
export function Lock(){return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.5"/></svg>;}
