"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { defaultCatalogSort, type StoreProduct } from "../lib/catalog-presentation";

import { recordInterest } from "../lib/interest-events";

import StoreProductCard from "./StoreProductCard";

import CatalogFilterPanel, { type CatalogFilterValues } from "./CatalogFilterPanel";

type Options = CatalogFilterValues & {
  q: string;
};

const defaults: Options = { q: "", min: "", max: "", brand: "", sort: "default", incomplete: false };
const optionsForCategory = (category?: string): Options => ({ ...defaults, sort: defaultCatalogSort(category || "tutte") });

type Result = {
  products: StoreProduct[];
  total: number;
  incomplete: number;
  brands: string[];
  has_more: boolean;
  next_offset: number;
  truncated?: boolean;
};

function parseCatalogResult(value: unknown): Result {
  if (!value || typeof value !== "object" || !Array.isArray((value as { products?: unknown }).products))
    throw new Error("La risposta del catalogo non è valida. Riprova.");
  const result = value as Partial<Result>;
  return {
    products: result.products as StoreProduct[],
    total: Number.isFinite(result.total) ? Number(result.total) : 0,
    incomplete: Number.isFinite(result.incomplete) ? Number(result.incomplete) : 0,
    brands: Array.isArray(result.brands) ? result.brands.filter((brand): brand is string => typeof brand === "string") : [],
    has_more: Boolean(result.has_more),
    next_offset: Number.isFinite(result.next_offset) ? Number(result.next_offset) : 0,
    truncated: Boolean(result.truncated),
  };
}

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
  const [draft, setDraft] = useState<Options>(() => optionsForCategory(fixedCategory)), [selected, setSelected] = useState<Options>(() => optionsForCategory(fixedCategory));
  const [products, setProducts] = useState<StoreProduct[]>([]), [loading, setLoading] = useState(true), [moreLoading, setMoreLoading] = useState(false), [error, setError] = useState("");
  const [meta, setMeta] = useState<Omit<Result, "products">>({ total: 0, incomplete: 0, brands: [], has_more: false, next_offset: 0 });
  const [revision, setRevision] = useState(0), [now, setNow] = useState(Date.now);
  const latest = useRef(0);
  const moreController = useRef<AbortController | null>(null);
  const previousCategory = useRef(fixedCategory);
  const asinKey = asins?.join(",");
  useEffect(() => {
    if (previousCategory.current === fixedCategory) return;
    previousCategory.current = fixedCategory;
    const next = optionsForCategory(fixedCategory);
    setDraft(next);
    setSelected(next);
  }, [fixedCategory]);
  function parameters(options: Options, offset = 0) {
    const params = new URLSearchParams({ presentation: "1", limit: String(pageSize), offset: String(offset), category: fixedCategory || "tutte", q: options.q, min: options.min, max: options.max, brand: options.brand, sort: options.sort, incomplete: options.incomplete ? "1" : "0" });
    if (asinKey !== undefined)
      params.set("asins", asinKey);
    if (excludeCategories)
      params.set("exclude", excludeCategories);
    return params;
  }
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => () => moreController.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController(), requestId = ++latest.current;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
    const params = new URLSearchParams({ presentation: "1", limit: String(pageSize), category: fixedCategory || "tutte", q: selected.q, min: selected.min, max: selected.max, brand: selected.brand, sort: selected.sort, incomplete: selected.incomplete ? "1" : "0" });
    if (asinKey !== undefined)
      params.set("asins", asinKey);
    if (excludeCategories)
      params.set("exclude", excludeCategories);
    fetch("/api/catalog?" + params, { signal }).then(async (response) => {
      if (!response.ok)
        throw new Error("Catalogo temporaneamente non disponibile. Riprova.");
      return parseCatalogResult(await response.json());
    }).then(data => {
      if (!controller.signal.aborted && requestId === latest.current) {
        setProducts(data.products);
        setMeta(data);
        setError("");
      }
    }).catch(err => {
      if (!controller.signal.aborted && requestId === latest.current)
        setError(err instanceof Error && err.name === "TimeoutError" ? "Il catalogo sta impiegando troppo tempo. Riprova." : err instanceof Error ? err.message : "Caricamento interrotto.");
    }).finally(() => {
      if (!controller.signal.aborted && requestId === latest.current)
        setLoading(false);
    });
    return () => controller.abort();
  }, [selected, fixedCategory, excludeCategories, asinKey, revision, pageSize]);
  useEffect(() => { recordInterest("catalog-view", asinKey !== undefined ? "preferiti" : fixedCategory || "tutte"); }, [fixedCategory, asinKey]);
  function apply(options = draft) {
    latest.current++;
    moreController.current?.abort();
    moreController.current = null;
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
    const controller = new AbortController();
    moreController.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
    setMoreLoading(true);
    setError("");
    try {
      const response = await fetch("/api/catalog?" + parameters(selected, meta.next_offset), { signal });
      if (!response.ok)
        throw new Error("Non è stato possibile caricare altri prodotti. Riprova.");
      const data = parseCatalogResult(await response.json());
      if (id === latest.current) {
        setProducts(previous => [...new Map([...previous, ...data.products].map(p => [p.id, p])).values()]);
        setMeta(data);
      }
    }
    catch (err) {
      if (id === latest.current && !controller.signal.aborted)
        setError(err instanceof Error && err.name === "TimeoutError" ? "Il caricamento sta impiegando troppo tempo. Riprova." : err instanceof Error ? err.message : "Errore di caricamento.");
    }
    finally {
      if (id === latest.current && !controller.signal.aborted)
        setMoreLoading(false);
      if (moreController.current === controller)
        moreController.current = null;
    }
  }
  const Heading = fixedCategory || asins ? "h1" : "h2";
  return <section className="catalogSection" id="catalogo" aria-busy={loading || moreLoading}>
  <div className="catalogHead"><div><p className="eyebrow">{eyebrow}</p><Heading>{heading}</Heading><p className="catalogOrder">{introductions[fixedCategory || ""] || "Esplora i prodotti con foto, descrizione e prezzo rilevato. Puoi includere quelli ancora da completare."}</p></div><form className="searchBox" onSubmit={submit}><label className="srOnly" htmlFor="catalog-search">Cerca prodotto o marca</label><input id="catalog-search" type="search" value={draft.q} onChange={e => setDraft({ ...draft, q: e.target.value })} placeholder="Prodotto, marca o ASIN" maxLength={120}/><button type="submit">Cerca</button></form></div>
  <CatalogFilterPanel value={draft} brands={meta.brands} defaultSortLabel={fixedCategory === "bestseller" ? "Classifica Amazon" : fixedCategory === "haul" || fixedCategory === "offerte-lambo" ? "Sconto maggiore" : "Completezza dei dati"} onChange={(filters) => setDraft({ ...draft, ...filters })} onSubmit={submit} onReset={() => { const next = optionsForCategory(fixedCategory); setDraft(next); apply(next); }}/>
  <p className="catalogResults" role="status">{loading ? "Caricamento prodotti…" : `${meta.total} prodotti trovati · ${products.length} mostrati`}{!loading && !selected.incomplete && meta.incomplete > 0 ? ` · ${meta.incomplete} incompleti esclusi` : ""}</p>
  {!loading && !selected.incomplete && meta.incomplete > 0 ? <button className="textButton" type="button" onClick={() => { const next = { ...draft, incomplete: true }; setDraft(next); apply(next); }}>Includi i prodotti incompleti</button> : null}
  {meta.truncated ? <p role="status">Catalogo molto ampio: la ricerca riguarda i primi 11.000 prodotti. Scegli un catalogo specifico per restringerla.</p> : null}
  {error ? <p className="adminError" role="alert">{error} <button type="button" onClick={() => apply(selected)}>Riprova</button></p> : null}
  {!loading && !error && !products.length ? <div className="catalogState"><p>Nessun prodotto con questi filtri. Prova una parola più breve, un’altra marca o includi i dati incompleti.</p><button type="button" onClick={() => { const next = optionsForCategory(fixedCategory); setDraft(next); apply(next); }}>Mostra tutti i prodotti disponibili</button></div> : null}
  {loading ? <div className="productGrid productGridLoading" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <div className="productSkeleton" key={index}><span/><div><i/><i/><i/><b/></div></div>)}</div> : <div className="productGrid">{products.map((product, index) => <StoreProductCard key={product.id} product={product} now={now} catalog={fixedCategory || "tutte"} priority={index === 0}/>)}</div>}
  {meta.has_more ? <button className="buyButton catalogMoreButton" type="button" disabled={loading || moreLoading} onClick={more}>{moreLoading ? "Caricamento…" : "Mostra altri prodotti"}</button> : null}
  <p className="catalogDisclaimer">I prezzi indicano l’ultima lettura riuscita. Prezzo finale e disponibilità sono quelli mostrati su Amazon al momento dell’acquisto. I link affiliati possono generare una commissione senza costi aggiuntivi.</p>
 </section>;
}
