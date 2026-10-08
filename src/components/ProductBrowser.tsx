"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getProductPrice } from "../lib/product-price";

type Product = {
  id: string;
  asin: string;
  title: string;
  description: string | null;
  image_url: string | null;
  affiliate_url: string;
  current_price: number | null;
  list_price: number | null;
  currency: string;
  discount_percent: number | null;
  price_verified_at: string | null;
  haul_category?: string | null;
};

const categories = [
  ["tutte", "Tutte"],
  ["tecnologia", "Tecnologia"],
  ["casa", "Casa"],
  ["bellezza", "Bellezza"],
  ["tempo-libero", "Tempo libero"],
];

function formatPrice(value: number | null, currency: string) {
  if (value == null) return null;
  return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value);
}

function displayProductTitle(title: string) {
  const cleaned = title.replace(/\s+/g, " ").trim();
  const withoutAmazonEssentials = cleaned.replace(/^Amazon Essentials\s*[-–—:]?\s+/i, "");
  return withoutAmazonEssentials || cleaned;
}

export default function ProductBrowser({ fixedCategory, heading = "Cerca tra i prodotti", eyebrow = "CATALOGO", showCategoryChips = true, excludeCategories = "" }: { fixedCategory?: string; heading?: string; eyebrow?: string; showCategoryChips?: boolean; excludeCategories?: string }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(fixedCategory ?? "tutte");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const [selection, setSelection] = useState({ q: "", category: fixedCategory ?? "tutte", revision: 0 });
  const latestRequest = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++latestRequest.current;
    const params = new URLSearchParams({ limit: "30" });
    if (selection.q.trim()) params.set("q", selection.q.trim());
    if (selection.category !== "tutte") params.set("category", selection.category);
    if (!fixedCategory && excludeCategories) params.set("exclude", excludeCategories);
    fetch("/api/catalog?" + params.toString(), { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Impossibile caricare il catalogo.");
        return await response.json() as { products?: Product[] };
      })
      .then((data) => { if (!controller.signal.aborted && latestRequest.current === requestId) setProducts(data.products ?? []); })
      .catch((err) => {
        if (!controller.signal.aborted && latestRequest.current === requestId) setError(err instanceof Error ? err.message : "Errore durante il caricamento.");
      })
      .finally(() => { if (!controller.signal.aborted && latestRequest.current === requestId) setLoading(false); });
    return () => controller.abort();
  }, [selection, fixedCategory, excludeCategories]);

  function startSearch(search: string, selectedCategory: string) {
    setLoading(true);
    setError("");
    setProducts([]);
    setSelection((previous) => ({ q: search, category: selectedCategory, revision: previous.revision + 1 }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    startSearch(q, category);
  }
  function selectCategory(next: string) {
    setCategory(next);
    startSearch(q, next);
  }

  return (
    <section className="catalogSection" id="cerca">
      <div className="catalogHead">
        <div><p className="eyebrow">{eyebrow}</p><h2>{heading}</h2><p className="catalogOrder">Ordinati dal prezzo più basso.</p></div>
        <form className="searchBox" onSubmit={submit}>
          <label className="srOnly" htmlFor="catalog-search">Cerca prodotti</label>
          <input id="catalog-search" type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Es. cuffie, cucina, sport..." />
          <button type="submit">Cerca</button>
        </form>
      </div>

      {showCategoryChips ? <div className="chips" aria-label="Categorie">
        {categories.map(([slug, label]) => (
          <button className={category === slug ? "active" : ""} type="button" key={slug} onClick={() => selectCategory(slug)}>{label}</button>
        ))}
      </div> : null}

      {loading && <p className="catalogState">Caricamento prodotti…</p>}
      {error && <p className="catalogState">{error}</p>}
      {!loading && !error && products.length === 0 && <p className="catalogState">Nessun prodotto disponibile al momento.</p>}

      <div className="productGrid">
        {products.map((product) => {
          const price = getProductPrice(product, now);
          return (
            <article className="productCard" key={product.id}>
              <a className="productImage" href={product.affiliate_url} target="_blank" rel="sponsored noopener noreferrer">
                {product.image_url ? <Image src={product.image_url} alt={product.title} width={400} height={300} unoptimized /> : <span>Immagine non disponibile</span>}
              </a>
              <div className="productBody">
                {fixedCategory === "haul" && product.haul_category ? <span className="cardTag">{product.haul_category}</span> : null}
                {price?.discount != null ? <span className="discount">RISPARMIA {price.discount}%</span> : null}
                <h3>{displayProductTitle(product.title)}</h3>
                {(fixedCategory === "offerte-lambo" || fixedCategory === "bestseller") && product.description ? (
                  <details className="productDescription">
                    <summary>Descrizione</summary>
                    <p>{product.description}</p>
                  </details>
                ) : null}
                <div className="priceRow">
                  {price ? <strong>{formatPrice(price.current, product.currency)}</strong> : <strong>Vedi prezzo su Amazon</strong>}
                  {price?.reference != null ? <del aria-label="Prezzo di riferimento">{formatPrice(price.reference, product.currency)}</del> : null}
                </div>
                {price?.reference != null ? <small>Prezzo di riferimento: {formatPrice(price.reference, product.currency)}</small> : null}
                {price ? <small>{price.fresh ? "Prezzo rilevato" : "Ultimo prezzo rilevato"}: {new Date(price.verifiedAt).toLocaleString("it-IT")}.</small> : <small>Prezzo aggiornato disponibile su Amazon</small>}
                <a className="buyButton" href={`/api/click/${product.id}`} target="_blank" rel="sponsored noopener noreferrer">Vedi su Amazon</a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
