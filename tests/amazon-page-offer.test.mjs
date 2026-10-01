import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadParser() {
  const source = ts.transpileModule(
    readFileSync(new URL("../src/lib/amazon-page-offer.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    Response,
    URL,
    TextDecoder,
    AbortSignal,
    console,
    require(name) {
      if (name === "server-only") return {};
      throw new Error("Unexpected import " + name);
    },
  });
  return exports;
}

const { extractAmazonProductOffer } = loadParser();

test("extracts current price, reference price and visible discount", () => {
  const html = `
    <div class="priceToPay"><span class="a-offscreen">32,99 €</span></div>
    <div class="basisPrice"><span class="a-offscreen">54,95 €</span></div>
    <span class="savingsPercentage">-40%</span>
  `;
  const offer = extractAmazonProductOffer(html);
  assert.equal(offer.currentPrice, 32.99);
  assert.equal(offer.listPrice, 54.95);
  assert.equal(offer.discountPercent, 40);
  assert.equal(offer.currency, "EUR");
});

test("computes discount when Amazon exposes both prices but not the percentage", () => {
  const html = `
    <div class="apexPriceToPay"><span class="a-offscreen">9,40 €</span></div>
    <span class="a-text-price"><span class="a-offscreen">14,49 €</span></span>
  `;
  const offer = extractAmazonProductOffer(html);
  assert.equal(offer.currentPrice, 9.4);
  assert.equal(offer.listPrice, 14.49);
  assert.equal(offer.discountPercent, 35);
});

test("does not invent a discount when only the current price is present", () => {
  const html = '<div id="corePriceDisplay_desktop_feature_div"><span class="a-offscreen">19,99 €</span></div>';
  const offer = extractAmazonProductOffer(html);
  assert.equal(offer.currentPrice, 19.99);
  assert.equal(offer.listPrice, null);
  assert.equal(offer.discountPercent, null);
});
