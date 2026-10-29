import type {Locale,Messages} from './locale';

// Short payment actions need explicit context; automatic translation can omit
// isolated verbs or interpret "checkout" as a shopping cart.
const payment:Partial<Record<Locale,string>>={de:'{{amount}} bezahlen',pl:'Zapłać {{amount}}',tr:'{{amount}} öde',mt:'Ħallas {{amount}}',ga:'Íoc {{amount}}'};
const checkout:Partial<Record<Locale,string>>={tr:'Ödeme',mt:'Ħlas',sr:'Плаћање'};
const contextual:Partial<Record<Locale,Messages>>={
 fr:{'One-time purchase':'Achat unique','Back to your bag':'Retour au panier','Safe & secure':'Paiement protégé','Subtotal':'Sous-total','Tax':'Taxes','Included tax':'Taxes incluses','Calculated at checkout':'Calculées avant le paiement','Email address':'Adresse e-mail','For your receipt and order updates':'Pour votre reçu et le suivi de votre commande','terms':'conditions générales','privacy policy':'politique de confidentialité'},
 de:{'One-time purchase':'Einmaliger Kauf','Back to your bag':'Zurück zum Warenkorb','Safe & secure':'Sicher bezahlen','Delivery details':'Lieferdetails','Tax':'Steuern','Included tax':'Enthaltene Steuern','Apply':'Anwenden','State':'Bundesstaat','Select {{region}}':'{{region}} auswählen','Refund policy':'Rückerstattungsrichtlinie','privacy policy':'Datenschutzerklärung','Here to help':'Wir helfen Ihnen gerne','Contact the store.':'Kontaktieren Sie uns.'},
 pl:{'Back to your bag':'Powrót do koszyka','Payment':'Płatność','Order summary':'Podsumowanie zamówienia','Subtotal':'Suma częściowa','Apply':'Zastosuj','State':'Stan','State / province':'Stan / prowincja','＋ Add apartment, suite or district':'＋ Dodaj numer mieszkania lub dzielnicę'},
 ro:{Checkout:'Finalizarea comenzii','Back to your bag':'Înapoi la coș','Safe & secure':'Plată în siguranță','Order summary':'Rezumatul comenzii','Subtotal':'Subtotal','Tax':'Taxe','Privacy policy':'Politica de confidențialitate'}
};
export function refineCheckoutCopy(locale:Locale,messages:Messages):Messages{
 if(!Object.keys(messages).length)return messages;
 return {...messages,...contextual[locale],...(payment[locale]?{'Pay {{amount}}':payment[locale]}:{}),...(checkout[locale]?{Checkout:checkout[locale]}:{})};
}
