"use client";

import { FormEvent, useEffect, useState } from "react";

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

  async function load(search = q, selectedCategory = category) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (search.trim()) params.set("q", search.trim());
      if (selectedCategory !== "tutte") params.set("category", selectedCategory);
      const response = await fetch(`/api/catalog?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Impossibile caricare il catalogo.");
      const data = await response.json() as { products?: Product[] };
      setProducts(data.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il caricamento.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load("", "tutte"); }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  function selectCategory(next: string) {
    setCategory(next);
    void load(q, next);
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
        {products.map((product) => (
          <article className="productCard" key={product.id}>
            <a className="productImage" href={product.affiliate_url} target="_blank" rel="sponsored noopener noreferrer">
              {product.image_url ? <img src={product.image_url} alt="" /> : <span>Immagine non disponibile</span>}
            </a>
            <div className="productBody">
              {product.discount_percent ? <span className="discount">-{product.discount_percent}%</span> : null}
              <h3>{product.title}</h3>
              <div className="priceRow">
                {product.current_price != null ? <strong>{formatPrice(product.current_price, product.currency)}</strong> : <strong>Vedi prezzo su Amazon</strong>}
                {product.list_price != null && product.list_price !== product.current_price ? <del>{formatPrice(product.list_price, product.currency)}</del> : null}
              </div>
              {product.price_verified_at ? <small>Prezzo verificato: {new Date(product.price_verified_at).toLocaleString("it-IT")}</small> : null}
              <a className="buyButton" href={`/api/click/${product.id}`} target="_blank" rel="sponsored noopener noreferrer">Vedi su Amazon</a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
