"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getProductPrice } from "../lib/product-price";

type Product = {
  id: string;
  asin: string;
  title: string;
  image_url: string | null;
  affiliate_url: string;
  current_price: number | null;
  list_price: number | null;
  currency: string;
  discount_percent: number | null;
  price_verified_at: string | null;
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

export default function ProductBrowser() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("tutte");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const [selection, setSelection] = useState({ q: "", category: "tutte", revision: 0 });
  const latestRequest = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++latestRequest.current;
    const params = new URLSearchParams({ limit: "30" });
    if (selection.q.trim()) params.set("q", selection.q.trim());
    if (selection.category !== "tutte") params.set("category", selection.category);
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
  }, [selection]);

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
        <div><p className="eyebrow">CATALOGO</p><h2>Cerca tra i prodotti</h2></div>
        <form className="searchBox" onSubmit={submit}>
          <label className="srOnly" htmlFor="catalog-search">Cerca prodotti</label>
          <input id="catalog-search" type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Es. cuffie, cucina, sport..." />
          <button type="submit">Cerca</button>
        </form>
      </div>

      <div className="chips" aria-label="Categorie">
        {categories.map(([slug, label]) => (
          <button className={category === slug ? "active" : ""} type="button" key={slug} onClick={() => selectCategory(slug)}>{label}</button>
        ))}
      </div>

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
                {price?.discount != null ? <span className="discount">{price.fresh ? "" : "Sconto rilevato "}−{price.discount}%</span> : null}
                <h3>{product.title}</h3>
                <div className="priceRow">
                  {price ? <strong>{formatPrice(price.current, product.currency)}</strong> : <strong>Vedi prezzo su Amazon</strong>}
                  {price?.reference != null ? <del aria-label="Prezzo di riferimento">{formatPrice(price.reference, product.currency)}</del> : null}
                </div>
                {price?.reference != null ? <small>Prezzo di riferimento: {formatPrice(price.reference, product.currency)}</small> : null}
                {price ? <small>{price.fresh ? "Prezzo rilevato" : "Ultimo prezzo rilevato"}: {new Date(price.verifiedAt).toLocaleString("it-IT")}. Prezzo e sconto possono cambiare su Amazon.</small> : <small>Prezzo aggiornato disponibile su Amazon</small>}
                <a className="buyButton" href={`/api/click/${product.id}`} target="_blank" rel="sponsored noopener noreferrer">Vedi su Amazon</a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
