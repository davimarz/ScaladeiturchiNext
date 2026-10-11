import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("AI product search uses the shared region-aware Amazon Creators client", async () => {
  const exports = {};
  const calls = [];
  const source = ts.transpileModule(
    readFileSync(new URL("../src/lib/ai-shopping.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;

  vm.runInNewContext(source, {
    exports,
    process: { env: { AMAZON_PARTNER_TAG: "test-21" } },
    URL,
    console,
    require(name) {
      if (name === "server-only") return {};
      if (name.includes("amazon/client")) return {
        async amazonRequest(operation, payload) {
          calls.push({ operation, payload });
          return {
            searchResult: {
              items: [{
                asin: "B0ROOMBA01",
                itemInfo: { title: { displayValue: "iRobot Roomba 115 Combo robot aspirapolvere" } },
                images: { primary: { large: { url: "https://m.media-amazon.com/images/I/roomba.jpg" } } },
                offersV2: { listings: [{ price: { money: { amount: 249, currency: "EUR" } } }] },
              }],
            },
          };
        },
      };
      if (name.includes("ai-relevance")) return {
        isRelevantProduct: () => true,
        maxPriceFromQuery: () => null,
        queryTokens: () => [],
        titleRelevance: () => ({ matches: 0, score: 0 }),
      };
      if (name.includes("haul-import")) return { parseHaulHtml: () => [] };
      if (name.includes("haul-browser")) return { fetchAmazonKeywordSearchWithFullScroll: async () => ({ html: "" }), fetchAmazonProductSnapshotsWithBrowser: async () => new Map() };
      if (name.includes("supabase/admin")) return { supabaseAdminFetch: async () => [] };
      if (name.includes("amazon-page-offer")) return { fetchAmazonProductSnapshot: async () => ({}) };
      throw new Error("Unexpected import " + name);
    },
  });

  const products = await exports.searchAmazonCreators("irobot roomba", 8);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation, "searchItems");
  assert.equal(calls[0].payload.keywords, "irobot roomba");
  assert.equal(JSON.stringify(calls[0].payload.languagesOfPreference), '["it_IT"]');
  assert.equal(products.length, 1);
  assert.equal(products[0].currentPrice, 249);
});
