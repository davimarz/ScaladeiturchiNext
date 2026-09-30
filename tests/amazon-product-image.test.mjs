import test from "node:test";
import assert from "node:assert/strict";
import { extractAmazonProductImage, fetchAmazonProductImage } from "../src/lib/amazon-input.ts";
const asin = "B01LZDYR7N", image = "https://m.media-amazon.com/images/I/main.jpg";
const identity = '<input type="hidden" id="ASIN" value="' + asin + '">';
const page = identity + '<img id="landingImage" src="' + image + '" data-old-hires="' + image + '">';
const htmlResponse = (html) => new Response(html, {headers:{"content-type":"text/html; charset=utf-8"}});
test("selects the product main image instead of recommendations",()=>{
  const html = '<img src="https://m.media-amazon.com/recommendation.jpg">' + page;
  assert.equal(extractAmazonProductImage(html,asin),image);
  assert.equal(extractAmazonProductImage(html,"B000000000"),null);
});
test("selects the largest dynamic main image and decodes HTML entities",()=>{
  const html = identity + '<img id="landingImage" src="https://m.media-amazon.com/small.jpg" data-a-dynamic-image="{&quot;https://m.media-amazon.com/large.jpg&quot;:[1200,800],&quot;https://m.media-amazon.com/tiny.jpg&quot;:[100,80]}">';
  assert.equal(extractAmazonProductImage(html,asin),"https://m.media-amazon.com/large.jpg");
});
test("never invents a product image from recommendation-only or unrelated pages",()=>{
  assert.equal(extractAmazonProductImage('<img src="' + image + '">',asin),null);
  assert.equal(extractAmazonProductImage('<meta property="og:image" content="' + image + '">',asin),null);
  assert.equal(extractAmazonProductImage(identity + '<meta property="og:image" content="' + image + '">',asin),image);
});
test("fetches the canonical product URL with a timeout and manual redirects",async()=>{
  const result=await fetchAmazonProductImage(asin,async(url,init)=>{
    assert.equal(url.href,"https://www.amazon.it/dp/"+asin);
    assert.equal(init.redirect,"manual");assert.ok(init.signal);
    return htmlResponse(page);
  });
  assert.equal(result,image);
});
test("rejects unavailable, CAPTCHA and non-HTML responses",async()=>{
  await assert.rejects(fetchAmazonProductImage(asin,async()=>new Response("unavailable",{status:503})));
  await assert.rejects(fetchAmazonProductImage(asin,async()=>htmlResponse('<title>Robot Check</title><form action="/errors/validateCaptcha"></form>')));
  await assert.rejects(fetchAmazonProductImage(asin,async()=>new Response("{}",{headers:{"content-type":"application/json"}})));
});
test("rejects redirects outside Amazon and to another ASIN before fetching them",async()=>{
  for(const target of ["https://127.0.0.1/private","https://example.com","https://www.amazon.it/dp/B000000000"]){
    let calls=0;
    await assert.rejects(fetchAmazonProductImage(asin,async()=>{calls++;return new Response(null,{status:302,headers:{location:target}});}));
    assert.equal(calls,1);
  }
});
test("bounds HTML size, but stops reading after main image and ASIN",async()=>{
  await assert.rejects(fetchAmazonProductImage(asin,async()=>htmlResponse("x".repeat(2*1024*1024+1))));
  let cancelled=false;
  const stream=new ReadableStream({
    start(controller){controller.enqueue(new TextEncoder().encode(page));},
    cancel(){cancelled=true;},
  });
  assert.equal(await fetchAmazonProductImage(asin,async()=>new Response(stream,{headers:{"content-type":"text/html"}})),image);
  assert.equal(cancelled,true);
});
test("rejects invalid ASIN without making a network request",async()=>{
  await assert.rejects(fetchAmazonProductImage("../private",()=>assert.fail("must not fetch")));
});
