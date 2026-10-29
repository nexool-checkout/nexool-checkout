import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLocale,normalizeLocale,translate,localeUrl,whopLocale,languageHost} from '../lib/locale';
import {parseMessages,parseProductTranslation} from '../lib/translation-catalog';
import catalog from '../lib/checkout-messages.json';
test('browser preferences respect quality, regional variants and supported fallbacks',()=>{
 assert.equal(resolveLocale(undefined,'xx-ZZ, de-AT;q=0.9, en;q=0.8'),'de');
 assert.equal(resolveLocale(undefined,'fr;q=0, en;q=0.2, pl;q=0.8'),'pl');
 assert.equal(resolveLocale(undefined,'nb-NO'),'no');
 assert.equal(resolveLocale(undefined,'zh-Hant-HK'),'zh-TW');
 assert.equal(resolveLocale('pt-PT','fr'),'pt');
 assert.equal(resolveLocale('//evil.example','fr-CH'),'fr');
 assert.equal(normalizeLocale('fr.evil.example'),undefined);
 assert.equal(languageHost('fr'),'fr.nexool.shop');
 assert.equal(whopLocale('fr'),'fr');assert.equal(whopLocale('ro'),'en');
});
test('session and cart fragment survive locale propagation',()=>{
 assert.equal(localeUrl('/?session=abc#cart=xyz','fr'),'/?session=abc&lang=fr#cart=xyz');
 assert.equal(localeUrl('/return?session=abc&lang=en','de'),'/return?session=abc&lang=de');
});
test('translated templates retain price placeholders and never execute markup',()=>{
 const id=catalog.find(x=>x.source==='Pay {{amount}}')!.id;
 const messages=parseMessages(`<p data-nexool-i18n="${id}">Payer <span translate="no">{{amount}}</span></p>`);
 assert.equal(translate(messages,'Pay {{amount}}',{amount:'39,00 €'}),'Payer 39,00 €');
 assert.deepEqual(parseMessages(`<p data-nexool-i18n="${id}">Payer 0 €</p>`),{});
 assert.equal(translate({},''),'');assert.equal(translate({'Checkout':'Paiement'},' Checkout '),' Paiement ');
 assert.equal(translate({},'Unknown provider error'),'Unknown provider error');
});
test('localized product copies contain text only, never price or payment data',()=>{
 assert.deepEqual(parseProductTranslation('<p data-nexool-product="12">Oreiller &amp; housse</p><p data-nexool-variant="123"><b>Bleu</b></p>'),{title:'Oreiller & housse',variants:{123:'Bleu'}});
});
