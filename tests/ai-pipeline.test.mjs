import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
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
  if(name.includes('ai-relevance'))return {isRelevantProduct:()=>true,maxPriceFromQuery:()=>50};
  if(name.includes('ai-usage'))return {async reserveAIUsage(){return {allowed:true,usageDay:'2026-10-09'};},async finalizeAIUsage(){},async recordAIQuery(){},async releaseAIUsage(){},async markAIExhausted(){}};
  throw new Error('Unexpected import '+name);
 }});
 for(const mode of ['search','more'])assert.equal((await exports.POST({async json(){return {query:'Cuffie bluetooth sotto 50 euro',mode};}})).products.length,8);
 assert.deepEqual(calls,['enrich','brave-enrich','enrich']);
});
