import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("parses complete Amazon products from the resilient text search", () => {
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(new URL("../src/lib/jina-shopping.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    URL,
    process: { env: { AMAZON_PARTNER_TAG: "test-21" } },
    require(name) {
      if (name.includes("ai-relevance")) return { isRelevantProduct: () => true, queryTokens: () => [] };
      throw new Error("Unexpected import " + name);
    },
  });
  const markdown = `
[![Image 9: iRobot Roomba Plus 576](https://m.media-amazon.com/images/I/71NoxAdtujL._AC_UL320_.jpg)](http://www.amazon.it/-/en/iRobot-Roomba/dp/B0GXWXK6VF/ref=sr_1_1)

## [Roomba Plus 576 Combo Robot Vacuum Cleaner](http://amazon.it/-/en/iRobot-Roomba/dp/B0GXWXK6VF/ref=sr_1_1)

With AutoWash Self-Draining Station, extendible mop and LiDAR navigation

4.5[_4.5 out of 5 stars_](javascript:void(0))

Price, product page[€359.84€359.84 RRP: €613.93 RRP: €613.93€613.93](http://www.amazon.it/-/en/iRobot-Roomba/dp/B0GXWXK6VF/ref=sr_1_1)
`;
  const products = exports.parseJinaAmazonSearch(markdown);
  assert.equal(products.length, 1);
  assert.equal(products[0].asin, "B0GXWXK6VF");
  assert.match(products[0].title, /^iRobot Roomba/);
  assert.equal(products[0].currentPrice, 359.84);
  assert.equal(products[0].listPrice, 613.93);
  assert.equal(products[0].discountPercent, 41);
  assert.match(products[0].description, /AutoWash/);
  assert.match(products[0].imageUrl, /m\.media-amazon\.com/);
});

test("Jina search preserves gender and broadens bag queries through complete Amazon searches", async () => {
  const exports = {};
  const calls = [];
  const source = ts.transpileModule(
    readFileSync(new URL("../src/lib/jina-shopping.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    URL,
    process: { env: {} },
    AbortSignal: { timeout: () => undefined },
    fetch: async (url) => {
      const amazon = new URL(url.slice("https://r.jina.ai/".length));
      const query = amazon.searchParams.get("k");
      calls.push(query);
      const heading = query === "borsa donna"
        ? "Women Shoulder Handbag Faux Leather Crossbody Tote"
        : "Women's Tote Shoulder Bag";
      return {
        ok: true,
        async text() {
          return `[![Image 1: ${heading}](https://m.media-amazon.com/images/I/bag.jpg)](https://www.amazon.it/-/en/Borsa/dp/B0BAG00001/ref=sr_1_1)\n\n## [${heading}](https://www.amazon.it/-/en/Borsa/dp/B0BAG00001/ref=sr_1_1)\n\nPrice, product page[€39.99](https://www.amazon.it/-/en/Borsa/dp/B0BAG00001/ref=sr_1_1)`;
        },
      };
    },
    require(name) {
      if (name.includes("ai-relevance")) {
        return {
          isRelevantProduct: () => true,
          queryTokens: () => ["borsa"],
        };
      }
      throw new Error("Unexpected import " + name);
    },
  });

  const products = await exports.searchAmazonViaJina("borsa da donna", 2);
  assert.ok(calls.includes("borsa donna"), "base Amazon search keeps the audience qualifier");
  assert.ok(calls.includes("handbag women"), "search includes an English handbag variant");
  assert.equal(products.length, 1);
  assert.equal(products[0].currentPrice, 39.99);
});

test("an empty Italian page retries the older English-locale Amazon.it search for scarves", async () => {
  const exports = {};
  const calls = [];
  const source = ts.transpileModule(
    readFileSync(new URL("../src/lib/jina-shopping.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    URL,
    console: { info() {} },
    process: { env: {} },
    AbortSignal: { timeout: () => undefined },
    fetch: async (url) => {
      calls.push(url);
      const isEnglish = url.includes("/-/en/s");
      return {
        ok: true,
        async text() {
          if (!isEnglish) return "Amazon search page with no products";
          return Array.from({ length: 8 }, (_, index) => {
            const asin = `B0SCARF00${index}`;
            return `[![Image ${index + 1}: Sciarpa uomo lana ${index}](https://m.media-amazon.com/images/I/scarf${index}.jpg)](http://www.amazon.it/-/en/Sciarpa-uomo/dp/${asin}/ref=sr_1_${index + 1})\n\n## [Sciarpa uomo lana ${index}](http://www.amazon.it/-/en/Sciarpa-uomo/dp/${asin}/ref=sr_1_${index + 1})\n\nPrice, product page[€19.99](http://www.amazon.it/-/en/Sciarpa-uomo/dp/${asin}/ref=sr_1_${index + 1})`;
          }).join("\n\n");
        },
      };
    },
    require(name) {
      if (name.includes("ai-relevance")) return { isRelevantProduct: () => true, queryTokens: () => ["sciarpa", "uomo"] };
      throw new Error("Unexpected import " + name);
    },
  });
  const products = await exports.searchAmazonViaJina("sciarpa uomo", 8);
  assert.equal(products.length, 8);
  assert.equal(products[0].currentPrice, 19.99);
  assert.ok(calls[0].includes("https://www.amazon.it/s"));
  assert.ok(calls[1].includes("http://www.amazon.it/-/en/s"));
  assert.equal(calls.length, 2);
});
