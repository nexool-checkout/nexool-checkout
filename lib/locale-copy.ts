import type {Locale,Messages} from './locale';

// Short payment actions need explicit context; automatic translation can omit
// isolated verbs or interpret "checkout" as a shopping cart.
const payment:Partial<Record<Locale,string>>={de:'{{amount}} bezahlen',pl:'Zapłać {{amount}}',tr:'{{amount}} öde',mt:'Ħallas {{amount}}',ga:'Íoc {{amount}}'};
const checkout:Partial<Record<Locale,string>>={tr:'Ödeme',mt:'Ħlas',sr:'Плаћање'};
export function refineCheckoutCopy(locale:Locale,messages:Messages):Messages{
 if(!Object.keys(messages).length)return messages;
 return {...messages,...(payment[locale]?{'Pay {{amount}}':payment[locale]}:{}),...(checkout[locale]?{Checkout:checkout[locale]}:{})};
}
