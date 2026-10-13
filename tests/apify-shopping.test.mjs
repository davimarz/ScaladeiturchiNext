import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports={};
const source=ts.transpileModule(readFileSync(new URL('../src/lib/apify-shopping.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(source,{exports,URL,Date,process:{env:{AMAZON_PARTNER_TAG:'test-tag'}},require(name){
 if(name==='server-only')return {};
 if(name.includes('ai-relevance'))return {isRelevantProduct:()=>true};
 throw new Error('Unexpected import '+name);
}});

test('Apify Amazon products map price, list price, image, description and affiliate link',()=>{
 const products=exports.parseApifyAmazonProducts([
  {asin:'B012345678',title:'Cuffie Bluetooth con cancellazione del rumore',price:{value:39.99,currency:'EUR'},listPrice:{value:59.99,currency:'EUR'},thumbnailImage:'https://m.media-amazon.com/images/I/headphones.jpg',description:'Cuffie wireless con cancellazione attiva del rumore.',features:['Autonomia 30 ore']},
  {asin:'B012345678',title:'Duplicato',price:{value:1,currency:'EUR'}},
  {asin:'invalid',title:'Prodotto non valido'},
 ],'cuffie bluetooth',8);
 assert.equal(products.length,1);
 assert.equal(products[0].currentPrice,39.99);
 assert.equal(products[0].listPrice,59.99);
 assert.equal(products[0].discountPercent,33);
 assert.equal(products[0].imageUrl,'https://m.media-amazon.com/images/I/headphones.jpg');
 assert.equal(products[0].description,'Cuffie wireless con cancellazione attiva del rumore.');
 assert.match(products[0].affiliateUrl,/tag=test-tag/);
 assert.equal(products[0].source,'amazon-apify');
});
