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

## [iRobot Roomba Plus 576 Combo Robot Vacuum Cleaner](http://www.amazon.it/-/en/iRobot-Roomba/dp/B0GXWXK6VF/ref=sr_1_1)

With AutoWash Self-Draining Station, extendible mop and LiDAR navigation

4.5[_4.5 out of 5 stars_](javascript:void(0))

Price, product page[€359.84€359.84 RRP: €613.93 RRP: €613.93€613.93](http://www.amazon.it/-/en/iRobot-Roomba/dp/B0GXWXK6VF/ref=sr_1_1)
`;
  const products = exports.parseJinaAmazonSearch(markdown);
  assert.equal(products.length, 1);
  assert.equal(products[0].asin, "B0GXWXK6VF");
  assert.equal(products[0].currentPrice, 359.84);
  assert.equal(products[0].listPrice, 613.93);
  assert.equal(products[0].discountPercent, 41);
  assert.match(products[0].description, /AutoWash/);
  assert.match(products[0].imageUrl, /m\.media-amazon\.com/);
});
