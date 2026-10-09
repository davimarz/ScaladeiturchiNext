import test from "node:test";
import assert from "node:assert/strict";
import { getProductPrice } from "../src/lib/product-price.ts";
const now=Date.parse("2026-10-01T00:00:00Z");
const product={current_price:41.94,list_price:54.95,price_verified_at:new Date(now).toISOString()};
test("derives the real saving from the verified price pair",()=>{
 const price=getProductPrice(product,now);
 assert.equal(price.current,41.94);assert.equal(price.reference,54.95);assert.equal(price.discount,24);assert.equal(price.fresh,true);
});
test("retains an older observation while marking it as historical",()=>{
 assert.equal(getProductPrice(product,now+3600000).fresh,true);
 const price=getProductPrice(product,now+3600001);
 assert.equal(price.fresh,false);assert.equal(price.current,41.94);assert.equal(price.discount,24);
});
test("does not display missing, unverified, invalid or future prices",()=>{
 for(const patch of [{current_price:null},{current_price:NaN},{current_price:-1},{current_price:0},{price_verified_at:null},{price_verified_at:"invalid"},{price_verified_at:new Date(now+1).toISOString()}]){
  assert.equal(getProductPrice({...product,...patch},now),null);
 }
});
test("does not invent savings from equal, lower or invalid reference prices",()=>{
 for(const list_price of [null,41.94,30,NaN,Infinity]){
  const price=getProductPrice({...product,list_price},now);assert.equal(price.reference,null);assert.equal(price.discount,null);
 }
});
