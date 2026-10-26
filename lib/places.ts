import {createHmac} from 'node:crypto';
import {required} from './config';
import {addressFromPlace} from './address-rules';
export function placeProof(sessionId:string,sessionToken:string,country:string,placeId:string){return createHmac('sha256',required('GOOGLE_PLACES_API_KEY')).update(JSON.stringify([sessionId,sessionToken,country,placeId])).digest('hex');}
async function google(url:string,init:RequestInit){
 const response=await fetch(url,{...init,cache:'no-store',signal:AbortSignal.timeout(7000)});
 if(!response.ok)throw new Error('Address suggestions are unavailable. Enter your address manually.');return response.json();
}
export async function suggestPlaces(input:string,country:string,sessionToken:string,sessionId:string){
 const result=await google('https://places.googleapis.com/v1/places:autocomplete',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':required('GOOGLE_PLACES_API_KEY'),'X-Goog-FieldMask':'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat'},body:JSON.stringify({input,includedRegionCodes:[country.toLowerCase()],sessionToken,languageCode:'en',includeQueryPredictions:false})});
 return (result.suggestions||[]).flatMap((s:any)=>s.placePrediction?.placeId?[{id:s.placePrediction.placeId,text:s.placePrediction.text?.text||'',title:s.placePrediction.structuredFormat?.mainText?.text||s.placePrediction.text?.text||'',description:s.placePrediction.structuredFormat?.secondaryText?.text||'',proof:placeProof(sessionId,sessionToken,country,s.placePrediction.placeId)}]:[]).slice(0,5);
}
export async function resolvePlace(id:string,country:string,sessionToken:string){
 const result=await google(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en`,{headers:{'X-Goog-Api-Key':required('GOOGLE_PLACES_API_KEY'),'X-Goog-FieldMask':'addressComponents,attributions'}});
 return {address:addressFromPlace(result.addressComponents||[],country),attributions:(result.attributions||[]).map((a:any)=>({name:String(a.provider||''),url:typeof a.providerUri==='string'&&a.providerUri.startsWith('https://')?a.providerUri:''}))};
}
