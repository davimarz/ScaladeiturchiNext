import test from "node:test";
import assert from "node:assert/strict";
import { isRelevantProduct } from "../src/lib/ai-shopping.ts";

test("rejects unrelated products for coffee pod machine query", () => {
  const query = "mi serve una macchina da caffè con cialde";
  assert.equal(isRelevantProduct("Nicky Elite - 4 rotoli di carta igienica", query), false);
  assert.equal(isRelevantProduct("Max Factor matita occhi Kajal", query), false);
  assert.equal(isRelevantProduct("Macchina da caffè espresso compatibile con cialde ESE", query), true);
});

test("keeps single strong product term when preference words are generic", () => {
  assert.equal(isRelevantProduct("Aspirapolvere senza fili 2 in 1", "un aspirapolvere conveniente"), true);
});
