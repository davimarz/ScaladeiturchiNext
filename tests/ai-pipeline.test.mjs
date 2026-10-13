import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadRoute({intent,local=[],creators=async()=>[],jina=async()=>[],fallback=async()=>[],braveSearch=async()=>[],enrich=async items=>items,braveEnrich=async items=>items,generateAnswer=async()=>({text:'Risultati trovati',inputTokens:1,outputTokens:1,totalTokens:2,model:'test'}),relevant=()=>true}) {
 const exports={};
 const source=ts.transpileModule(readFileSync(new URL('../src/app/api/ai-shopping/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,console,require(name){
  if(name==='next/server')return {NextResponse:{json:body=>body}};
  if(name.includes('ai-shopping'))return {
   async interpretShoppingQuery(){return intent;},
   async searchLocalCatalog(){return local;},
   mergeProducts:(...groups)=>groups.flat(),
   searchAmazonCreators:creators,
   searchAmazonFallback:fallback,
   enrichMissingProductData:enrich,
   generateShoppingAnswer:generateAnswer,
  };
  if(name.includes('brave-shopping'))return {searchAmazonViaBrave:braveSearch,enrichAmazonProductsViaBraveByAsin:braveEnrich};
  if(name.includes('jina-shopping'))return {searchAmazonViaJina:jina};
  if(name.includes('ai-relevance'))return {isRelevantProduct:relevant,isUnrequestedAccessory:()=>false,maxPriceFromQuery:()=>null};
  if(name.includes('ai-usage'))return {async reserveAIUsage(){return {allowed:true,usageDay:'2026-10-11'};},async finalizeAIUsage(){},async recordAIQuery(){},async releaseAIUsage(){},async markAIExhausted(){}};
  throw new Error('Unexpected import '+name);
 }});
 return exports;
}

test('AI avoids re-scanning complete results and enriches each search only once',async()=>{
 const exports={},calls=[];
 const products=Array.from({length:8},(_,i)=>({asin:'B01234567'+i,title:'Cuffie bluetooth con microfono',imageUrl:'https://m.media-amazon.com/images/I/cuffie.jpg',currentPrice:20,listPrice:null,discountPercent:null,currency:'EUR',source:'catalogo'}));
 const source=ts.transpileModule(readFileSync(new URL('../src/app/api/ai-shopping/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{exports,console,require(name){
  if(name==='next/server')return {NextResponse:{json:body=>body}};
  if(name.includes('ai-shopping'))return {
   async interpretShoppingQuery(query){return {canonicalQuery:query,searchQueries:[query],inputTokens:0,outputTokens:0,totalTokens:0};},
   async searchLocalCatalog(){return products;},mergeProducts:(...groups)=>groups.flat(),
   async searchAmazonCreators(){calls.push('creators');return[];},async searchAmazonFallback(){calls.push('browser-search');return[];},
   async enrichMissingProductData(items){calls.push('enrich');return items;},
   async generateShoppingAnswer(){return {text:'Otto cuffie sotto 50 euro',inputTokens:1,outputTokens:1,totalTokens:2};},
  };
  if(name.includes('brave-shopping'))return {async searchAmazonViaBrave(){calls.push('brave-search');return[];},async enrichAmazonProductsViaBraveByAsin(items){calls.push('brave-enrich');return items;}};
  if(name.includes('jina-shopping'))return {async searchAmazonViaJina(){calls.push('jina-search');return[];}};
  if(name.includes('ai-relevance'))return {isRelevantProduct:()=>true,isUnrequestedAccessory:()=>false,maxPriceFromQuery:()=>50};
  if(name.includes('ai-usage'))return {async reserveAIUsage(){return {allowed:true,usageDay:'2026-10-09'};},async finalizeAIUsage(){},async recordAIQuery(){},async releaseAIUsage(){},async markAIExhausted(){}};
  throw new Error('Unexpected import '+name);
 }});
 for(const mode of ['search','more'])assert.equal((await exports.POST({async json(){return {query:'Cuffie bluetooth sotto 50 euro',mode};}})).products.length,8);
 assert.deepEqual(calls,['enrich','enrich']);
});

test('AI always searches the exact user query even when generated variants come first',async()=>{
 const searched=[];
 const roomba={asin:'B0ROOMBA01',title:'iRobot Roomba 115 Combo robot aspirapolvere lavapavimenti',imageUrl:'https://m.media-amazon.com/images/I/roomba.jpg',currentPrice:249,listPrice:299,discountPercent:17,currency:'EUR',source:'amazon-api'};
 const route=loadRoute({
  intent:{canonicalQuery:'robot aspirapolvere con mappatura e stazione automatica',searchQueries:['robot aspirapolvere premium','robot lavapavimenti smart','robot con stazione automatica','irobot roomba'],inputTokens:0,outputTokens:0,totalTokens:0},
  creators:async query=>{searched.push(query);return query==='irobot roomba'?[roomba]:[];},
  relevant:title=>/irobot roomba/i.test(title),
 });
 const response=await route.POST({async json(){return {query:'irobot roomba'};}});
 assert.equal(searched[0],'irobot roomba');
 assert.equal(response.products.length,1);
 assert.equal(response.products[0].asin,'B0ROOMBA01');
});

test('AI bag search accepts Italian and English handbag naming variants with complete data',async()=>{
 const handbag={asin:'B0BAG00001',title:'Women Shoulder Handbag Faux Leather Crossbody Tote',imageUrl:'https://m.media-amazon.com/images/I/bag.jpg',currentPrice:39.99,listPrice:59.99,discountPercent:33,currency:'EUR',source:'amazon-search',description:'Borsa a tracolla da donna in pelle sintetica con tasche interne.'};
 const route=loadRoute({
  intent:{canonicalQuery:'borsa donna',searchQueries:['borsa donna','borsa a tracolla donna','handbag women','tote bag women'],inputTokens:0,outputTokens:0,totalTokens:0},
  jina:async query=>query==='borsa da donna'?[handbag]:[],
  relevant:title=>/handbag|borsa|tote/i.test(title),
 });
 const response=await route.POST({async json(){return {query:'borsa da donna'};}});
 assert.equal(response.products.length,1);
 assert.equal(response.products[0].asin,'B0BAG00001');
 assert.ok(response.products[0].imageUrl);
 assert.equal(response.products[0].currentPrice,39.99);
});

test('AI does not treat incomplete candidates as sufficient and enriches the best candidates once',async()=>{
 const incomplete=Array.from({length:32},(_,i)=>({asin:'B'+String(i).padStart(9,'0'),title:'iRobot Roomba robot aspirapolvere '+i,imageUrl:null,currentPrice:null,listPrice:null,discountPercent:null,currency:'EUR',source:'catalogo'}));
 let enrichmentCalls=0;
 const route=loadRoute({
  intent:{canonicalQuery:'irobot roomba',searchQueries:['irobot roomba'],inputTokens:0,outputTokens:0,totalTokens:0},
  local:incomplete,
  relevant:title=>/irobot roomba/i.test(title),
  enrich:async items=>{enrichmentCalls+=1;return items.map((item,index)=>index===0?{...item,imageUrl:'https://m.media-amazon.com/images/I/roomba.jpg',currentPrice:199}:item);},
 });
 const response=await route.POST({async json(){return {query:'irobot roomba'};}});
 assert.equal(enrichmentCalls,1);
 assert.equal(response.products.length,1);
 assert.equal(response.products[0].currentPrice,199);
});

test('AI continues with another Amazon query when one browser attempt returns an error',async()=>{
 const attempted=[];
 const roomba={asin:'B0ROOMBA02',title:'iRobot Roomba Plus 576 Combo robot aspirapolvere',imageUrl:'https://m.media-amazon.com/images/I/roomba.jpg',currentPrice:359,listPrice:499,discountPercent:28,currency:'EUR',source:'amazon-search',description:'Robot aspirapolvere e lavapavimenti con stazione automatica.',priceVerifiedAt:new Date().toISOString()};
 const route=loadRoute({
  intent:{canonicalQuery:'irobot roomba',searchQueries:['irobot roomba','robot aspirapolvere roomba'],inputTokens:0,outputTokens:0,totalTokens:0},
  creators:async()=>{throw new Error('AssociateNotEligible');},
  fallback:async query=>{attempted.push(query);if(attempted.length===1)throw new Error('Amazon browser HTTP 503');return [roomba];},
  relevant:title=>/irobot roomba/i.test(title),
 });
 const response=await route.POST({async json(){return {query:'irobot roomba'};}});
 assert.equal(attempted.length,2);
 assert.equal(response.products.length,1);
 assert.equal(response.products[0].asin,'B0ROOMBA02');
});


test('AI calls Creators first and keeps valid products if Gemini answer generation fails',async()=>{
 const calls=[];
 const products=Array.from({length:4},(_,i)=>({asin:'B01234567'+i,title:'Sciarpa uomo in lana morbida '+i,imageUrl:'https://m.media-amazon.com/images/I/scarf.jpg',currentPrice:19+i,listPrice:29+i,discountPercent:34,currency:'EUR',source:'amazon-api'}));
 const route=loadRoute({
  intent:{canonicalQuery:'sciarpa uomo',searchQueries:['sciarpa uomo','sciarpa da uomo'],inputTokens:0,outputTokens:0,totalTokens:0},
  creators:async query=>{calls.push('creators:'+query);return products;},
  jina:async()=>{calls.push('jina');return[];},
  generateAnswer:async()=>{calls.push('gemini');throw new Error('Gemini API unavailable');},
 });
 const response=await route.POST({async json(){return {query:'sciarpa uomo'};}});
 assert.equal(response.products.length,4);
 assert.match(response.answer,/Ho trovato 4 prodotti pertinenti/);
 assert.deepEqual(calls,['creators:sciarpa uomo','gemini']);
});
