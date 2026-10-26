import data from './address-countries.json';
export type CountryRules={name:string;format:string;streetFormat:string;zip:boolean;city:boolean;province:boolean;zipLabel:string;provinceLabel:string;cityLabel:string;zipExample:string;phonePrefix:string;zones:{code:string;name:string;aliases:string[]}[]};
export function addressRules(country:string):CountryRules{return (data as Record<string,CountryRules>)[country]||{name:country,format:'{country}_{firstName}{lastName}_{address1}_{address2}_{city}_{province}{zip}_{phone}',streetFormat:'{building_num} {street}',zip:false,city:true,province:true,zipLabel:'Postal code',provinceLabel:'State / province',cityLabel:'City',zipExample:'',phonePrefix:'',zones:[]};}
export function addressRows(country:string){
 const allowed=new Set(['firstName','lastName','address1','address2','city','province','zip']);const rules=addressRules(country);
 return rules.format.split('_').map(row=>[...row.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).filter(f=>allowed.has(f)&&(f!=='province'||rules.province)&&(f!=='zip'||rules.zip))).filter(row=>row.length);
}
export function normalizeProvince(country:string,...values:string[]){
 const rules=addressRules(country);if(!rules.province)return '';
 const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 for(const value of values){if(!value)continue;const found=rules.zones.find(z=>[z.code,z.name,...z.aliases].some(v=>norm(v)===norm(value)));if(found)return found.code;}
 return rules.zones.length?'':values.find(Boolean)||'';
}
export type AddressComponent={longText:string;shortText?:string;types:string[]};
export function addressFromPlace(components:AddressComponent[],expectedCountry:string){
 const get=(type:string,short=false)=>{const c=components.find(c=>c.types.includes(type));return c?(short?c.shortText||c.longText:c.longText):'';};
 const country=get('country',true).toUpperCase();if(country!==expectedCountry)throw new Error('Choose an address in the selected country.');
 const rules=addressRules(country),street=get('route'),number=get('street_number');
 const address1=street?rules.streetFormat.replace('{street}',street).replace('{building_num}',number).trim():get('premise')||[get('sublocality_level_2'),get('sublocality_level_3'),get('sublocality_level_4'),number].filter(Boolean).join(' ');
 const city=get('postal_town')||get('locality')||get('sublocality_level_1')||get('administrative_area_level_3')||get('administrative_area_level_2');
 return {countryCode:country,address1,address2:get('subpremise'),city,provinceCode:normalizeProvince(country,get('administrative_area_level_1',true),get('administrative_area_level_1'),get('administrative_area_level_2',true),get('administrative_area_level_2')),zip:rules.zip?[get('postal_code'),get('postal_code_suffix')].filter(Boolean).join('-'):''};
}
