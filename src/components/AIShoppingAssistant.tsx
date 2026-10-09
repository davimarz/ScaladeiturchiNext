"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { readServiceJson } from "../lib/service-json";

type Product = {
  asin: string;
  title: string;
  imageUrl: string | null;
  currentPrice: number | null;
  listPrice: number | null;
  discountPercent: number | null;
  currency: string;
  affiliateUrl: string;
  source: "catalogo" | "amazon-api" | "amazon-search" | "brave-search";
  features?: string[];
};

function money(value: number | null, currency: string) {
  if (value == null) return null;
  return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value);
}

export default function AIShoppingAssistant() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const [noMoreProducts, setNoMoreProducts] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai-suggestions", { signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { suggestions?: string[] } : { suggestions: [] })
      .then((data) => {
        if (!controller.signal.aborted) setSuggestions(data.suggestions || []);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (text.length < 3 || loading || moreLoading) return;

    setLoading(true);
    setError("");
    setAnswer("");
    setProducts([]);
    setNoMoreProducts(false);
    setLastQuery(text);

    try {
      const response = await fetch("/api/ai-shopping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: text }),
        signal: AbortSignal.timeout(240000),
      });
      const data = await readServiceJson<{ answer?: string; products?: Product[]; error?: string }>(response, "Ricerca temporaneamente non disponibile. Riprova tra poco.");
      if (!response.ok) throw new Error(data.error || "Ricerca non disponibile.");
      setAnswer(data.answer || "");
      setProducts(data.products || []);
    } catch (err) {
      setError(err instanceof Error && err.name === "TimeoutError" ? "La ricerca ha impiegato troppo tempo. Riprova tra poco." : err instanceof Error ? err.message : "Ricerca non disponibile.");
    } finally {
      setLoading(false);
    }
  }


  async function findMore() {
    const text = lastQuery.trim();
    if (text.length < 3 || loading || moreLoading) return;

    setMoreLoading(true);
    setError("");
    setNoMoreProducts(false);

    try {
      const response = await fetch("/api/ai-shopping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: text,
          excludeAsins: products.map((product) => product.asin),
          mode: "more",
        }),
        signal: AbortSignal.timeout(240000),
      });
      const data = await readServiceJson<{ products?: Product[]; error?: string }>(response, "Ricerca temporaneamente non disponibile. Riprova tra poco.");
      if (!response.ok) throw new Error(data.error || "Ricerca non disponibile.");

      const incoming = data.products || [];
      if (!incoming.length) {
        setNoMoreProducts(true);
        return;
      }

      setProducts((current) => {
        const seen = new Set(current.map((product) => product.asin));
        return [...current, ...incoming.filter((product) => !seen.has(product.asin))];
      });
    } catch (err) {
      setError(err instanceof Error && err.name === "TimeoutError" ? "La ricerca ha impiegato troppo tempo. Riprova tra poco." : err instanceof Error ? err.message : "Ricerca non disponibile.");
    } finally {
      setMoreLoading(false);
    }
  }

  return (
    <section className="aiShopping">
      <div className="aiShoppingIntro">
        <p className="eyebrow">ASSISTENTE SHOPPING</p>
        <h1>Chiedi all&apos;AI</h1>
        <p>Descrivi il prodotto che cerchi, indicando se vuoi marca, formato, caratteristiche e prezzo massimo.</p>
      </div>

      <form className="aiAskForm" onSubmit={ask}>
        <label className="srOnly" htmlFor="ai-query">Cosa stai cercando?</label>
        <textarea
          id="ai-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Es. Cerco una macchina da caffè per cialde sotto 60 €..."
          rows={3}
          maxLength={500}
        />
        <button type="submit" disabled={loading || moreLoading || query.trim().length < 3}>
          {loading ? "Cerco e verifico prezzi…" : "Chiedi all'AI"}
        </button>
      </form>

      <div className="aiSuggestions" aria-label="Suggerimenti">
        {suggestions.map((suggestion) => (
          <button type="button" key={suggestion} onClick={() => setQuery(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>

      {error ? <p className="adminError aiMessage">{error}</p> : null}
      {answer ? <div className="aiAnswer"><strong>Risposta</strong><p>{answer}</p></div> : null}

      {!loading && products.length > 0 ? (
        <div className="aiProductGrid">
          {products.map((product) => (
            <article className="productCard" key={product.asin}>
              <a className="productImage" href={product.affiliateUrl} target="_blank" rel="sponsored noopener noreferrer">
                {product.imageUrl ? (
                  <Image src={product.imageUrl} alt={product.title} width={400} height={300} unoptimized />
                ) : (
                  <span>Immagine non disponibile</span>
                )}
              </a>
              <div className="productBody">
                {product.discountPercent != null && product.discountPercent > 0 ? (
                  <span className="discount">RISPARMIA {Math.round(product.discountPercent)}%</span>
                ) : null}
                <h3>{product.title}</h3>
                {product.features?.length ? (
                  <ul className="aiFeatures">
                    {product.features.slice(0, 3).map((feature) => <li key={feature}>{feature}</li>)}
                  </ul>
                ) : null}
                <div className="priceRow">
                  {product.currentPrice != null ? <strong>{money(product.currentPrice, product.currency)}</strong> : <strong>Vedi prezzo su Amazon</strong>}
                  {product.listPrice != null && product.currentPrice != null && product.listPrice > product.currentPrice ? (
                    <del>{money(product.listPrice, product.currency)}</del>
                  ) : null}
                </div>
                <a className="buyButton" href={product.affiliateUrl} target="_blank" rel="sponsored noopener noreferrer">
                  Vedi su Amazon
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!loading && products.length > 0 ? (
        <div className="aiMoreWrap">
          <button type="button" className="aiMoreButton" onClick={findMore} disabled={moreLoading || noMoreProducts}>
            {moreLoading ? "Cerco e verifico altri prodotti…" : noMoreProducts ? "Nessun altro prodotto trovato" : "Trovane altri"}
          </button>
        </div>
      ) : null}

      {!loading && answer && products.length === 0 ? (
        <p className="catalogState">Nessun prodotto affidabile trovato per questa richiesta. Prova a descriverla in modo diverso.</p>
      ) : null}
    </section>
  );
}
