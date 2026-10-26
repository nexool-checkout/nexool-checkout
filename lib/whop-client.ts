import {WhopClient} from '@whop/sdk';
import {required} from './config';
export const WHOP_VERSION='2026-10-07-1';
export function whop(){return new WhopClient({token:required('WHOP_API_KEY'),apiVersionDate:WHOP_VERSION,maxRetries:0,timeoutInSeconds:18});}
