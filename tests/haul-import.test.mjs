import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadModule() {
  const source = ts.transpileModule(
    readFileSync(new URL("../src/lib/haul-import.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    URL,
    require(name) {
      if (name.includes("amazon-input")) {
        return {
          allowedAmazonImage(value) {
            try {
              const url = new URL(value);
              return url.hostname === "m.media-amazon.com" ? url.toString() : null;
            } catch {
              return null;
            }
          },
        };
      }
      throw new Error("Unexpected import " + name);
    },
  });
  return exports;
}

const { parseHaulHtml, isAmazonHaulUrl, isAmazonOutletUrl } = loadModule();

test("recognizes Amazon.it HAUL URLs only", () => {
  assert.equal(isAmazonHaulUrl("https://www.amazon.it/haul/store?ref_=nav_cs_hul_disb"), true);
  assert.equal(isAmazonHaulUrl("https://www.amazon.it/haul/deals"), true);
  assert.equal(isAmazonHaulUrl("https://www.amazon.it/dp/B012345678"), false);
  assert.equal(isAmazonHaulUrl("https://example.com/haul/store"), false);
});

test("extracts HAUL products with image, prices and discount", () => {
  const html = `
    <div data-asin="B012345678">
      <h2><span>Prodotto HAUL Uno</span></h2>
      <img src="https://m.media-amazon.com/images/I/test1.jpg" alt="Prodotto HAUL Uno">
      <span class="a-price"><span class="a-offscreen">9,40 €</span></span>
      <span class="a-text-price"><span class="a-offscreen">14,49 €</span></span>
      <span class="savingsPercentage">-35%</span>
    </div>
    <div data-asin="B087654321">
      <h2><span>Prodotto HAUL Due</span></h2>
      <img src="https://m.media-amazon.com/images/I/test2.jpg">
      <span class="a-price"><span class="a-offscreen">12,99 €</span></span>
    </div>
  `;
  const products = parseHaulHtml(html);
  assert.equal(products.length, 2);
  assert.equal(products[0].asin, "B012345678");
  assert.equal(products[0].title, "Prodotto HAUL Uno");
  assert.equal(products[0].currentPrice, 9.4);
  assert.equal(products[0].listPrice, 14.49);
  assert.equal(products[0].discountPercent, 35);
  assert.equal(products[1].currentPrice, 12.99);
  assert.equal(products[1].discountPercent, null);
});

test("falls back to canonical dp links when data-asin is absent", () => {
  const html = '<a href="https://www.amazon.it/example/dp/B012345678"><img src="https://m.media-amazon.com/images/I/test.jpg" alt="Fallback HAUL"></a>';
  const products = parseHaulHtml(html);
  assert.equal(products.length, 1);
  assert.equal(products[0].asin, "B012345678");
});


test("recognizes the configured Amazon.it OUTLET page", () => {
  assert.equal(isAmazonOutletUrl("https://www.amazon.it/b?_encoding=UTF8&node=21955579031&ref=it_outsbcd_9&ref_=cct_cg_OutletIT_1b1&pf_rd_p=944e3502-a5e7-48c3-a5d6-330210c1b635&pf_rd_r=8VJYFFY6AFE33ERXY91J"), true);
  assert.equal(isAmazonOutletUrl("https://www.amazon.it/b?node=21955579031"), true);
  assert.equal(isAmazonOutletUrl("https://www.amazon.it/b?node=123456"), false);
  assert.equal(isAmazonOutletUrl("https://example.com/b?node=21955579031"), false);
});


test("assigns the nearest HAUL section category to each product", () => {
  const html = `
    <section><h2>Bestseller</h2>
      <div data-asin="B012345678"><h2><span>Prodotto bestseller</span></h2></div>
    </section>
    <section><h2>Marchi top</h2>
      <div data-asin="B087654321"><h2><span>Prodotto marchio top</span></h2></div>
    </section>
    <section><h2>Offerta top</h2>
      <div data-asin="B011111111"><h2><span>Prodotto offerta top</span></h2></div>
    </section>
    <section><h2>Prezzi da urlo</h2>
      <div data-asin="B022222222"><h2><span>Prodotto prezzo da urlo</span></h2></div>
    </section>
  `;
  const products = parseHaulHtml(html);
  const categories = Object.fromEntries(products.map((product) => [product.asin, product.haulCategory]));
  assert.equal(categories.B012345678, "Bestseller");
  assert.equal(categories.B087654321, "Marchi top");
  assert.equal(categories.B011111111, "Offerta top");
  assert.equal(categories.B022222222, "Prezzi da urlo");
});
