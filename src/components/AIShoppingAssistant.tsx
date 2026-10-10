"use client";

import { FormEvent, useEffect, useState } from "react";

import StoreProductCard from "./StoreProductCard";

import { queryTokens, maxPriceFromQuery } from "../lib/ai-relevance";

import { normalizeWords } from "../lib/catalog-presentation";

import { recordInterest } from "../lib/interest-events";

import { readServiceJson } from "../lib/service-json";

import { aiSearchSessionKey, readAiSearchSession, serializeAiSearchSession, type AiSearchProduct as Product } from "../lib/ai-search-session";

const examples = ["Cuffie Bluetooth per telefonare sotto 40 €", "Una friggitrice ad aria per due persone entro 80 €", "Uno zaino leggero per escursioni sotto 35 €", "Un rasoio elettrico sotto 50 €"];

function recommendation(product: Product, query: string) {
  const maximum = maxPriceFromQuery(query);
  if (maximum != null && product.currentPrice != null && product.currentPrice > 0 && product.currentPrice <= maximum && product.priceVerifiedAt)
    return "L’ultimo prezzo rilevato rientra nel budget di " + maximum + " €.";
  const matched = queryTokens(query).filter(word => normalizeWords(product.title).split(" ").includes(word));
  return matched.length ? "Il titolo contiene: " + matched.slice(0, 3).join(", ") + ". Verifica nei dettagli le altre esigenze." : "Risultato della ricerca: verifica nelle caratteristiche la compatibilità con le tue esigenze.";
}

export default function AIShoppingAssistant() {
  const [now, setNow] = useState(Date.now);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>(examples);
  const [elapsed, setElapsed] = useState(0);
  const [answer, setAnswer] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const [noMoreProducts, setNoMoreProducts] = useState(false);
  const [error, setError] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => {
    try {
      const saved = readAiSearchSession(sessionStorage.getItem(aiSearchSessionKey) || "");
      if (saved) {
        setQuery(saved.query);
        setLastQuery(saved.query);
        setAnswer(saved.answer);
        setProducts(saved.products);
        setNoMoreProducts(saved.noMoreProducts);
        setNow(saved.savedAt);
      }
    }
    finally { setSessionReady(true); }
  }, []);
  useEffect(() => {
    if (!sessionReady || !lastQuery) return;
    try {
      sessionStorage.setItem(aiSearchSessionKey, serializeAiSearchSession({ query: lastQuery, answer, products, noMoreProducts, savedAt: now }));
    }
    catch { /* The search still works when browser storage is unavailable. */ }
  }, [sessionReady, lastQuery, answer, products, noMoreProducts, now]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai-suggestions", { signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as {
      suggestions?: string[];
    } : { suggestions: [] })
      .then((data) => {
      if (!controller.signal.aborted)
        setSuggestions([...new Set([...examples, ...(data.suggestions || []).slice(0, 2)])]);
    })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!loading && !moreLoading)
      return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [loading, moreLoading]);
  async function ask(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (text.length < 3 || loading || moreLoading)
      return;
    setElapsed(0);
    recordInterest("search", "ai");
    setLoading(true);
    setError("");
    setAnswer("");
    setProducts([]);
    setNoMoreProducts(false);
    setLastQuery(text);
    try { sessionStorage.removeItem(aiSearchSessionKey); }
    catch { /* The new request still replaces the visible result. */ }
    try {
      const response = await fetch("/api/ai-shopping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: text }),
        signal: AbortSignal.timeout(240000),
      });
      const data = await readServiceJson<{
        answer?: string;
        products?: Product[];
        error?: string;
      }>(response, "Ricerca temporaneamente non disponibile. Riprova tra poco.");
      if (!response.ok)
        throw new Error(data.error || "Ricerca non disponibile.");
      setAnswer(data.answer || "");
      setNow(Date.now());
      setProducts(data.products || []);
    }
    catch (err) {
      setError(err instanceof Error && err.name === "TimeoutError" ? "La ricerca ha impiegato troppo tempo. Riprova tra poco." : err instanceof Error ? err.message : "Ricerca non disponibile.");
    }
    finally {
      setLoading(false);
    }
  }
  async function findMore() {
    const text = lastQuery.trim();
    if (text.length < 3 || loading || moreLoading)
      return;
    setElapsed(0);
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
      const data = await readServiceJson<{
        products?: Product[];
        error?: string;
      }>(response, "Ricerca temporaneamente non disponibile. Riprova tra poco.");
      if (!response.ok)
        throw new Error(data.error || "Ricerca non disponibile.");
      setNow(Date.now());
      const incoming = data.products || [];
      if (!incoming.length) {
        setNoMoreProducts(true);
        return;
      }
      setProducts((current) => {
        const seen = new Set(current.map((product) => product.asin));
        return [...current, ...incoming.filter((product) => !seen.has(product.asin))];
      });
    }
    catch (err) {
      setError(err instanceof Error && err.name === "TimeoutError" ? "La ricerca ha impiegato troppo tempo. Riprova tra poco." : err instanceof Error ? err.message : "Ricerca non disponibile.");
    }
    finally {
      setMoreLoading(false);
    }
  }
  return (<section className="aiShopping" aria-busy={loading || moreLoading}>
   <div className="aiShoppingIntro">
    <p className="eyebrow">ASSISTENTE SHOPPING</p>
    <h1>Chiedi all&apos;AI</h1>
    <p>Descrivi il prodotto che cerchi, indicando se vuoi marca, formato, caratteristiche e prezzo massimo.</p>
   </div>

   <form className="aiAskForm" onSubmit={ask}>
    <label className="srOnly" htmlFor="ai-query">Cosa stai cercando?</label>
    <textarea id="ai-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Es. Cerco una macchina da caffè per cialde sotto 60 €..." rows={3} maxLength={500}/>
    <button type="submit" disabled={loading || moreLoading || query.trim().length < 3}>
     {loading ? "Cerco e verifico prezzi…" : "Chiedi all'AI"}
    </button>
   </form>

   <div className="aiSuggestions" aria-label="Suggerimenti">
    {suggestions.map((suggestion) => (<button type="button" key={suggestion} onClick={() => setQuery(suggestion)}>
      {suggestion}
     </button>))}
   </div>

   {loading || moreLoading ? <p className="aiMessage" role="status">Ricerca e verifica dei dati in corso · {elapsed} secondi. {elapsed >= 45 ? "Le fonti stanno impiegando più tempo. Puoi attendere senza inviare di nuovo la richiesta." : "Sto consultando le fonti disponibili."}</p> : null}
   {error ? <p className="adminError aiMessage" role="alert">{error}</p> : null}
   {!loading && lastQuery && (answer || products.length > 0) ? <p className="aiLastRequest"><strong>Ultima richiesta:</strong> {lastQuery}</p> : null}
   {answer ? <div className="aiAnswer"><strong>Risposta</strong><p>{answer}</p></div> : null}

   {!loading && products.length > 0 ? (<div className="aiProductGrid">
     {products.map((product) => <StoreProductCard key={product.asin} now={now} catalog="ai" reason={recommendation(product, lastQuery)} product={{ id: "", asin: product.asin, title: product.title, image_url: product.imageUrl, description: product.description || product.features?.join(" · ") || null, current_price: product.currentPrice, list_price: product.listPrice, discount_percent: product.discountPercent, currency: product.currency, affiliate_url: product.affiliateUrl, price_verified_at: product.priceVerifiedAt || null }}/>)}
    </div>) : null}

   {!loading && products.length > 0 ? (<div className="aiMoreWrap">
     <button type="button" className="aiMoreButton" onClick={findMore} disabled={moreLoading || noMoreProducts}>
      {moreLoading ? "Cerco e verifico altri prodotti…" : noMoreProducts ? "Nessun altro prodotto trovato" : "Trovane altri"}
     </button>
    </div>) : null}

   <p className="catalogDisclaimer">Le proposte si basano sui dati disponibili. Prezzi e disponibilità vanno confermati su Amazon. I link affiliati possono generare una commissione senza costi aggiuntivi.</p>
   {!loading && answer && products.length === 0 ? (<p className="catalogState">Nessun prodotto affidabile trovato per questa richiesta. Prova a descriverla in modo diverso.</p>) : null}
  </section>);
}
