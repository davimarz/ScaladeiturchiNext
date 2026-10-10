import test from "node:test";
import assert from "node:assert/strict";
import { isRelevantProduct, isUnrequestedAccessory } from "../src/lib/ai-relevance.ts";

test("rejects unrelated products for coffee pod machine query", () => {
  const query = "mi serve una macchina da caffè con cialde";
  assert.equal(isRelevantProduct("Nicky Elite - 4 rotoli di carta igienica", query), false);
  assert.equal(isRelevantProduct("Max Factor matita occhi Kajal", query), false);
  assert.equal(isRelevantProduct("Macchina da caffè espresso compatibile con cialde ESE", query), true);
});

test("keeps single strong product term when preference words are generic", () => {
  assert.equal(isRelevantProduct("Aspirapolvere senza fili 2 in 1", "un aspirapolvere conveniente"), true);
});

test("complete devices do not recommend compatible accessories unless explicitly requested", () => {
  const query = "Spazzolino elettrico Oral-B sotto 100 euro";
  assert.equal(isUnrequestedAccessory("Oral-B Testine di Ricambio iO Gentle Care, 8 Ricambi per Spazzolino Elettrico", query), true);
  assert.equal(isRelevantProduct("Oral-B Testine di Ricambio iO Gentle Care, 8 Ricambi per Spazzolino Elettrico", query), false);
  assert.equal(isUnrequestedAccessory("Oral-B iO 2 Spazzolino Elettrico, con 1 Testina di Ricambio", query), false);
  assert.equal(isUnrequestedAccessory("Oral-B iO 3, 2 Spazzolini Elettrici, 2 Testine", query), false);
  assert.equal(isUnrequestedAccessory("Oral-B Testine di Ricambio per Spazzolino Elettrico", "Testine di ricambio Oral-B"), false);
  assert.equal(isUnrequestedAccessory("Custodia compatibile con cuffie Bluetooth", "Cuffie Bluetooth sotto 40 euro"), true);
  assert.equal(isUnrequestedAccessory("Cover per smartphone Samsung Galaxy", "Smartphone Samsung Galaxy"), true);
});
