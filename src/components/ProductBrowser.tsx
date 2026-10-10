"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { productCategories, type StoreProduct } from "../lib/catalog-presentation";

import { recordInterest } from "../lib/interest-events";

import StoreProductCard from "./StoreProductCard";

type Options = {
  q: string;
  product_category: string;
  min: string;
  max: string;
  brand: string;
  sort: string;
  incomplete: boolean;
  priced: boolean;
};

const defaults: Options = { q: "", product_category: "tutte", min: "", max: "", brand: "", sort: "default", incomplete: false, priced: false };

type Result = {
  products: StoreProduct[];
  total: number;
  incomplete: number;
  brands: string[];
  has_more: boolean;
  next_offset: number;
  truncated?: boolean;
};

const introductions: Record<string, string> = { bestseller: "I prodotti presenti nelle classifiche Amazon, ordinati per posizione. La classifica non equivale a una valutazione di qualità.", "offerte-lambo": "Prodotti raccolti dalla pagina offerte Amazon. Prezzi, sconti e disponibilità possono cambiare: controllali su Amazon.", haul: "La selezione Amazon HAUL. Qui trovi solo i dati che siamo riusciti a rilevare dalla fonte." };

export default function ProductBrowser({ fixedCategory, heading = "Cerca tra i prodotti", eyebrow = "CATALOGO", excludeCategories = "", asins, pageSize = 30 }: {
  fixedCategory?: string;
  heading?: string;
  eyebrow?: string;
  showCategoryChips?: boolean;
  excludeCategories?: string;
  asins?: string[];
  pageSize?: number;
}) {
  const [draft, setDraft] = useState<Options>(defaults), [selected, setSelected] = useState<Options>(defaults);
  const [products, setProducts] = useState<StoreProduct[]>([]), [loading, setLoading] = useState(true), [moreLoading, setMoreLoading] = useState(false), [error, setError] = useState("");
  const [meta, setMeta] = useState<Omit<Result, "products">>({ total: 0, incomplete: 0, brands: [], has_more: false, next_offset: 0 });
  const [revision, setRevision] = useState(0), [now, setNow] = useState(Date.now);
  const latest = useRef(0);
  const asinKey = asins?.join(",");
  function parameters(options: Options, offset = 0) {
    const params = new URLSearchParams({ presentation: "1", limit: String(pageSize), offset: String(offset), category: fixedCategory || "tutte", q: options.q, product_category: options.product_category, min: options.min, max: options.max, brand: options.brand, sort: options.sort, incomplete: options.incomplete ? "1" : "0", priced: options.priced ? "1" : "0" });
    if (asinKey !== undefined)
      params.set("asins", asinKey);
    if (excludeCategories)
      params.set("exclude", excludeCategories);
    return params;
  }
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const controller = new AbortController(), requestId = ++latest.current;
    const params = new URLSearchParams({ presentation: "1", limit: String(pageSize), category: fixedCategory || "tutte", q: selected.q, product_category: selected.product_category, min: selected.min, max: selected.max, brand: selected.brand, sort: selected.sort, incomplete: selected.incomplete ? "1" : "0", priced: selected.priced ? "1" : "0" });
    if (asinKey !== undefined)
      params.set("asins", asinKey);
    if (excludeCategories)
      params.set("exclude", excludeCategories);
    fetch("/api/catalog?" + params, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok)
        throw new Error("Catalogo temporaneamente non disponibile. Riprova.");
      return await response.json() as Result;
    }).then(data => {
      if (!controller.signal.aborted && requestId === latest.current) {
        setProducts(data.products);
        setMeta(data);
        setError("");
      }
    }).catch(err => {
      if (!controller.signal.aborted && requestId === latest.current)
        setError(err instanceof Error ? err.message : "Caricamento interrotto.");
    }).finally(() => {
      if (!controller.signal.aborted && requestId === latest.current)
        setLoading(false);
    });
    return () => controller.abort();
  }, [selected, fixedCategory, excludeCategories, asinKey, revision, pageSize]);
  useEffect(() => { recordInterest("catalog-view", asinKey !== undefined ? "preferiti" : fixedCategory || "tutte"); }, [fixedCategory, asinKey]);
  function apply(options = draft) {
    latest.current++;
    setLoading(true);
    setMoreLoading(false);
    setProducts([]);
    setError("");
    setSelected({ ...options });
    setRevision(value => value + 1);
    recordInterest(options.q ? "search" : "filter", fixedCategory || "tutte");
    if (options.sort !== selected.sort)
      recordInterest("sort", fixedCategory || "tutte");
  }
  function submit(event: FormEvent) { event.preventDefault(); apply(); }
  async function more() {
    if (loading || moreLoading)
      return;
    const id = latest.current;
    setMoreLoading(true);
    setError("");
    try {
      const response = await fetch("/api/catalog?" + parameters(selected, meta.next_offset), { cache: "no-store" });
      if (!response.ok)
        throw new Error("Non è stato possibile caricare altri prodotti. Riprova.");
      const data = await response.json() as Result;
      if (id === latest.current) {
        setProducts(previous => [...new Map([...previous, ...data.products].map(p => [p.id, p])).values()]);
        setMeta(data);
      }
    }
    catch (err) {
      if (id === latest.current)
        setError(err instanceof Error ? err.message : "Errore di caricamento.");
    }
    finally {
      if (id === latest.current)
        setMoreLoading(false);
    }
  }
  const Heading = fixedCategory || asins ? "h1" : "h2";
  return <section className="catalogSection" id="catalogo" aria-busy={loading || moreLoading}>
  <div className="catalogHead"><div><p className="eyebrow">{eyebrow}</p><Heading>{heading}</Heading><p className="catalogOrder">{introductions[fixedCategory || ""] || "Esplora i prodotti con foto, descrizione e prezzo rilevato. Puoi includere quelli ancora da completare."}</p></div><form className="searchBox" onSubmit={submit}><label className="srOnly" htmlFor="catalog-search">Cerca prodotto o marca</label><input id="catalog-search" type="search" value={draft.q} onChange={e => setDraft({ ...draft, q: e.target.value })} placeholder="Prodotto, marca o ASIN" maxLength={120}/><button type="submit">Cerca</button></form></div>
  <details className="catalogFilters"><summary>Filtri e ordinamento</summary><form onSubmit={submit} className="filterFields">
   <label>Categoria<select value={draft.product_category} onChange={e => setDraft({ ...draft, product_category: e.target.value })}>{productCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
   <label>Marca<select value={draft.brand} onChange={e => setDraft({ ...draft, brand: e.target.value })}><option value="">Tutte le marche</option>{meta.brands.map(brand => <option key={brand}>{brand}</option>)}</select></label>
   <label>Prezzo minimo (€)<input type="number" min="0" step="0.01" value={draft.min} onChange={e => setDraft({ ...draft, min: e.target.value })}/></label><label>Prezzo massimo (€)<input type="number" min={draft.min || "0"} step="0.01" value={draft.max} onChange={e => setDraft({ ...draft, max: e.target.value })}/></label>
   <label>Ordina per<select value={draft.sort} onChange={e => setDraft({ ...draft, sort: e.target.value })}><option value="default">{fixedCategory === "bestseller" ? "Classifica Amazon" : "Completezza dei dati"}</option><option value="price-asc">Prezzo crescente</option><option value="price-desc">Prezzo decrescente</option><option value="discount">Sconto maggiore</option></select></label>
   <label className="checkFilter"><input type="checkbox" checked={draft.incomplete} onChange={e => setDraft({ ...draft, incomplete: e.target.checked })}/>Mostra anche prodotti incompleti</label><label className="checkFilter"><input type="checkbox" checked={draft.priced} onChange={e => setDraft({ ...draft, priced: e.target.checked })}/>Solo con prezzo rilevato</label>
   <button type="submit">Applica filtri</button><button type="button" className="secondaryButton" onClick={() => { setDraft(defaults); apply(defaults); }}>Azzera filtri</button>
  </form></details>
  <p className="catalogResults" role="status">{loading ? "Caricamento prodotti…" : `${meta.total} prodotti trovati · ${products.length} mostrati`}{!loading && !selected.incomplete && meta.incomplete > 0 ? ` · ${meta.incomplete} incompleti esclusi` : ""}</p>
  {!loading && !selected.incomplete && meta.incomplete > 0 ? <button className="textButton" type="button" onClick={() => { const next = { ...draft, incomplete: true }; setDraft(next); apply(next); }}>Includi i prodotti incompleti</button> : null}
  {meta.truncated ? <p role="status">Catalogo molto ampio: la ricerca riguarda i primi 11.000 prodotti. Scegli un catalogo specifico per restringerla.</p> : null}
  {error ? <p className="adminError" role="alert">{error} <button type="button" onClick={() => apply(selected)}>Riprova</button></p> : null}
  {!loading && !error && !products.length ? <div className="catalogState"><p>Nessun prodotto con questi filtri. Prova una parola più breve, un’altra marca o includi i dati incompleti.</p><button type="button" onClick={() => { setDraft(defaults); apply(defaults); }}>Mostra tutti i prodotti disponibili</button></div> : null}
  <div className="productGrid">{products.map(product => <StoreProductCard key={product.id} product={product} now={now} catalog={fixedCategory || "tutte"}/>)}</div>
  {meta.has_more ? <button className="buyButton catalogMoreButton" type="button" disabled={loading || moreLoading} onClick={more}>{moreLoading ? "Caricamento…" : "Mostra altri prodotti"}</button> : null}
  <p className="catalogDisclaimer">I prezzi indicano l’ultima lettura riuscita. Prezzo finale e disponibilità sono quelli mostrati su Amazon al momento dell’acquisto. I link affiliati possono generare una commissione senza costi aggiuntivi.</p>
 </section>;
}
