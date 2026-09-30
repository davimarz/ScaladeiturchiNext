import test from "node:test";
import assert from "node:assert/strict";
import { allowedAmazonUrl, allowedAmazonImage, parseAmazonInput, resolveAmazonUrl, extractAsin, deriveTitle } from "../src/lib/amazon-input.ts";
import { catalogLimit, isUuid } from "../src/lib/product-validation.ts";
const product = "https://www.amazon.it/dp/B01LZDYR7N";
test("accepts Italian product URLs and official short links only", () => {
  for (const url of [product, "https://amzn.to/abc", "https://link.amazon/abc"]) assert.ok(allowedAmazonUrl(url));
  for (const url of ["http://amazon.it/dp/B01LZDYR7N", "https://amazon.it.evil.test/x", "https://user:pass@amazon.it/x", "https://amazon.it:8080/x", "https://127.0.0.1/x"]) assert.equal(allowedAmazonUrl(url), null);
});
test("finds the product anchor and skips tracking pixels and unrelated images", () => {
  const html = '<a href="https://example.com">other</a><img src="https://m.media-amazon.com/pixel.jpg" width="1" height="1"><a href="' + product + '?tag=test-21&amp;ref=x"><img src="//m.media-amazon.com/images/I/photo.jpg"></a>';
  assert.deepEqual(parseAmazonInput(html), {amazonUrl: product + "?tag=test-21&ref=x", imageUrl: "https://m.media-amazon.com/images/I/photo.jpg"});
});
test("handles unquoted, lazy image attributes and numeric entities", () => {
  assert.equal(parseAmazonInput('<a href=' + product + '><img data-src="https://m.media-amazon.com/p.jpg?a=1&#38;b=2"></a>').imageUrl, "https://m.media-amazon.com/p.jpg?a=1&b=2");
});
test("plain links and image-free HTML do not invent an image", () => {
  assert.equal(parseAmazonInput(product).imageUrl, null);
  assert.equal(parseAmazonInput('<a href="' + product + '"><img src="https://tracking.test/a"></a>').imageUrl, null);
  assert.equal(allowedAmazonImage("https://m.media-amazon.com.evil.test/a"), null);
});
test("valid short redirect resolves with HEAD, a timeout, and manual redirects", async () => {
  const url = await resolveAmazonUrl("https://amzn.to/test", async (_, init) => {
    assert.equal(init.method,"HEAD"); assert.equal(init.redirect,"manual"); assert.ok(init.signal);
    return new Response(null, {status:302,headers:{location:product}});
  });
  assert.equal(url.href, product);
});
test("never fetches a redirect to internal or unapproved hosts", async () => {
  for (const target of ["https://127.0.0.1/private", "http://amazon.it/x", "https://example.com/x"]) {
    let calls = 0;
    await assert.rejects(resolveAmazonUrl("https://amzn.to/test", async () => { calls++; return new Response(null,{status:302,headers:{location:target}}); }));
    assert.equal(calls,1);
  }
});
test("bounds redirect loops and rejects unresolved links", async () => {
  let calls = 0;
  await assert.rejects(resolveAmazonUrl("https://amzn.to/test", async () => { calls++; return new Response(null,{status:302,headers:{location:"/loop"}}); }));
  assert.equal(calls,5);
  await assert.rejects(resolveAmazonUrl("https://amzn.to/test", async () => new Response(null,{status:200})));
});
test("extracts ASIN from supported paths and tolerates malformed title slugs", () => {
  for (const path of ["dp","gp/product","gp/aw/d"]) assert.equal(extractAsin(new URL("https://amazon.it/" + path + "/b01lzdyr7n")), "B01LZDYR7N");
  assert.equal(extractAsin(new URL("https://amazon.it/dp/B01LZDYR7NX")), null);
  assert.equal(deriveTitle(new URL("https://amazon.it/%ZZ/dp/B01LZDYR7N"), "B01LZDYR7N"), "Prodotto Amazon B01LZDYR7N");
});
test("catalog limits are finite, integral and bounded", () => {
  for (const [input, expected] of [[null,30],["wat",30],["Infinity",30],["3.5",3],["-9",1],["1000",60]]) assert.equal(catalogLimit(input), expected);
  assert.ok(isUuid("98e06f33-d699-4fae-9e7a-afbce8585000"));
  assert.equal(isUuid("bad-id"),false);
});
