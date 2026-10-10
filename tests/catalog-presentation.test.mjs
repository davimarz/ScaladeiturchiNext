import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as presentation from '../src/lib/catalog-presentation.ts';
import {validInterest} from '../src/lib/interest-events.ts';
const product={id:'a',asin:'B012345678',title:'Sony cuffie Bluetooth con microfono',description:'Cuffie senza fili con microfono integrato.',image_url:'https://m.media-amazon.com/images/I/headphones.jpg',affiliate_url:'https://www.amazon.it/dp/B012345678',current_price:30,list_price:60,discount_percent:50,currency:'EUR',price_verified_at:'2026-01-01T12:00:00Z',bestseller_rank:2};
function load(path,dependencies={}) {const exports={};const source=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(source,{exports,URL,console,Date,require(name){if(name==='server-only')return {};if(dependencies[name])return dependencies[name];throw new Error('Unexpected import '+name);}});return exports;}
test('public quality rejects missing descriptions, generic images, titles and unverified or future prices',()=>{
 assert.equal(presentation.presentable(product),true);
 for(const change of [{description:null},{image_url:null},{image_url:'https://images.test/transparent-pixel.gif'},{title:'Scegli il paese per la consegna'},{current_price:0},{price_verified_at:null},{price_verified_at:'2999-01-01T00:00:00Z'}])assert.equal(presentation.presentable({...product,...change}),false);
});
test('search understands brands, ASINs, everyday aliases and one typo without unrelated results',()=>{
 for(const query of ['sony','auricolari','cuffie bluetooh','B012345678'])assert.equal(presentation.matchesSearch(product,query),true,query);
 assert.equal(presentation.matchesSearch(product,'friggitrice cucina'),false);
 assert.equal(presentation.matchesSearch(product,'sony shampoo'),false);
});
test('category inference stays conservative and does not classify coffee cream as beauty',()=>{
 assert.equal(presentation.inferredCategory(product.title),'tecnologia');
 assert.equal(presentation.inferredCategory('Crema per il viso Nivea'),'bellezza');
 assert.equal(presentation.inferredCategory('Crema di caffè con macchina da caffè'),'casa');
 assert.equal(presentation.inferredCategory('Prodotto non identificabile'),'altro');
});
test('sorting preserves actual bestseller ranks and distinct ASIN variants and places unknown prices last',()=>{
 const products=[product,{...product,id:'b',asin:'B087654321',bestseller_rank:1,current_price:10},{...product,id:'c',bestseller_rank:null,current_price:null}];
 assert.deepEqual(presentation.sortProducts(products,'default',true).map(p=>p.id),['b','a','c']);
 assert.deepEqual(presentation.sortProducts(products,'price-asc',false).map(p=>p.id),['b','a','c']);
 assert.equal(presentation.discountValue({...product,list_price:15,discount_percent:99}),0);
});
test('short titles retain full source values and dates respect Rome rather than browser timezone',()=>{
 const title='Cuffie Sony '+('con microfono e custodia '.repeat(10));assert.ok(presentation.shortTitle(title).length<=106);assert.ok(presentation.shortTitle(title).endsWith('…'));assert.ok(title.length>106);
 assert.equal(presentation.observedDate('2026-01-01T23:30:00Z',Date.parse('2026-01-02T10:00:00Z')),'Prezzo rilevato oggi');
 assert.match(presentation.observedDate('2026-01-01T12:00:00Z',Date.parse('2026-01-02T10:00:00Z')),/01\/01\/2026/);
});
test('rich catalogue counts and paginates the filtered set across database pages',async()=>{
 const rows=Array.from({length:1001},(_,i)=>({...product,id:String(i).padStart(4,'0'),current_price:i+1}));
 const calls=[];const api=load('src/lib/presented-catalog.ts',{'./supabase/admin':{async supabaseAdminFetch(path){calls.push(path);return path.endsWith('offset=0')?rows.slice(0,1000):rows.slice(1000);}},'./catalog-presentation':presentation,'./product-validation':{catalogLimit:()=>2}});
 const data=await api.getPresentedCatalog(new URLSearchParams({category:'bestseller',min:'998',max:'1001',sort:'price-desc',limit:'2'}));
 assert.equal(data.total,4);assert.equal(data.products[0].current_price,1001);assert.equal(data.has_more,true);assert.equal(data.next_offset,2);assert.equal(calls.length,2);assert.match(calls[0],/in_bestseller=eq.true/);
 const next=await api.getPresentedCatalog(new URLSearchParams({category:'bestseller',min:'998',max:'1001',sort:'price-desc',offset:'2'}));assert.equal(next.products[0].current_price,999);assert.equal(next.has_more,false);
});
test('empty saved lists and injected ASINs never broaden into the full catalogue',async()=>{
 const api=load('src/lib/presented-catalog.ts',{'./supabase/admin':{supabaseAdminFetch:()=>assert.fail('must not read all rows')},'./catalog-presentation':presentation,'./product-validation':{catalogLimit:()=>2}});
 assert.equal((await api.getPresentedCatalog(new URLSearchParams({asins:''}))).total,0);
 assert.equal((await api.getPresentedCatalog(new URLSearchParams({asins:'invalid),active.eq.false'}))).total,0);
});
test('aggregate analytics only accept known events and catalogues, never raw queries',()=>{
 assert.equal(validInterest('search','bestseller'),true);assert.equal(validInterest('private search text','bestseller'),false);assert.equal(validInterest('filter','external-site'),false);
});
test('retry resets only failed observations, keeping successful products and all their data',async()=>{
 let mutation;const api=load('src/lib/catalog-sync.ts',{'./amazon-page-offer':{},'./haul-browser':{},'./supabase/admin':{async supabaseAdminFetch(path,init){mutation={path,body:JSON.parse(init.body)};}},'./catalog-config':{catalogConfig:{haul:{membership:'in_haul',prefix:'haul'}}},'./catalog-product':{}});
 await api.retryIncompleteCatalog('haul');assert.match(mutation.path,/haul_verification_status=eq.failed/);assert.match(mutation.path,/in_haul=eq.true/);assert.deepEqual(Object.keys(mutation.body).sort(),['haul_last_verification_error','haul_verification_attempts','haul_verification_status']);assert.equal(mutation.body.haul_verification_attempts,0);
});
test('corrupted local lists cannot introduce arbitrary URLs or duplicate comparison products',()=>{
 const api=load('src/lib/shopping-store.ts',{'react':{useMemo(){},useSyncExternalStore(){}}});
 assert.equal(api.readSavedAsins('not-json').length,0);assert.equal(api.readSavedAsins('{"asin":"B012345678"}').length,0);
 assert.deepEqual(Array.from(api.readSavedAsins('["B012345678","B012345678","https://malicious.test",null]')),['B012345678']);
});
test('AI products persist safely as local snapshots without inventing unavailable prices',()=>{
 const api=load('src/lib/shopping-store.ts',{'react':{useMemo(){},useSyncExternalStore(){}}});
 const result=api.readProductSnapshots(JSON.stringify([{...product,id:'',price_verified_at:null},{...product,affiliate_url:'javascript:alert(1)'},{...product,affiliate_url:'https://www.amazon.it.malicious.test/dp/B012345678'}]));
 assert.equal(result.length,1);assert.equal(result[0].asin,product.asin);assert.equal(result[0].price_verified_at,null);assert.equal(result[0].current_price,30);
});
test('display and importer share the rejection of Amazon chrome and energy labels',()=>{
 for(const title of ['La gamma di classi energetiche','Mostra visualizzazione per acquistare rapidamente','Sponsorizzato','Amazon.it: scegli paese','Prodotto Amazon B012345678'])assert.equal(presentation.usefulTitle(title),false,title);
});
test('the catalogue filter panel has one unambiguous completeness control',()=>{
 const source=readFileSync(new URL('../src/components/ProductBrowser.tsx',import.meta.url),'utf8');
 assert.match(source,/Mostra anche prodotti incompleti/);
 assert.doesNotMatch(source,/Solo con prezzo rilevato|product_category|productCategories|priced/);
 assert.doesNotMatch(source,/>Categoria</);
});
test('the last AI request can be restored safely while corrupted or unsafe sessions are ignored',()=>{
 const session=load('src/lib/ai-search-session.ts');
 const valid=JSON.stringify({version:1,query:'cuffie bluetooth sotto 40 euro',answer:'Ecco i risultati.',savedAt:100,products:[{asin:'B012345678',title:'Cuffie Sony',imageUrl:'https://m.media-amazon.com/images/I/test.jpg',currentPrice:30,listPrice:40,discountPercent:25,currency:'EUR',affiliateUrl:'https://www.amazon.it/dp/B012345678',source:'catalogo',priceVerifiedAt:'2026-10-10T10:00:00Z'}],noMoreProducts:false});
 const restored=session.readAiSearchSession(valid);
 assert.equal(restored.query,'cuffie bluetooth sotto 40 euro');assert.equal(restored.products.length,1);assert.equal(restored.products[0].currentPrice,30);
 assert.equal(session.readAiSearchSession('not-json'),null);
 assert.equal(session.readAiSearchSession(JSON.stringify({...JSON.parse(valid),products:[{...JSON.parse(valid).products[0],affiliateUrl:'javascript:alert(1)'}]})),null);
});
