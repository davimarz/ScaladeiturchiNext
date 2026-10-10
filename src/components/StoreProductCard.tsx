"use client";
import Image from "next/image";
import { getProductPrice } from "../lib/product-price";
import { cleanTitle, shortTitle, observedDate, type StoreProduct } from "../lib/catalog-presentation";
import { ProductTools } from "./ShoppingTools";
export function money(value: number, currency = "EUR") { return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value); }
export default function StoreProductCard({ product, now, catalog = "tutte", reason }: {
    product: StoreProduct;
    now: number;
    catalog?: string;
    reason?: string;
}) {
    const price = getProductPrice(product, now);
    const title = cleanTitle(product.title);
    return <article className="productCard">
    <a className="productImage" href={product.affiliate_url} target="_blank" rel="sponsored noopener noreferrer">{product.image_url ? <Image src={product.image_url} alt={title} width={400} height={300} unoptimized/> : <span>Immagine non disponibile</span>}</a>
    <div className="productBody">
      {product.bestseller_rank && catalog === "bestseller" ? <span className="cardTag">Posizione Amazon: {product.bestseller_rank}</span> : null}
      {price?.discount != null ? <span className="discount">−{Math.round(price.discount)}%</span> : null}
      <h3 title={title}>{shortTitle(title)}</h3>
      {reason ? <p className="recommendationReason">{reason}</p> : null}
      <p className="descriptionPreview">{product.description ? shortTitle(product.description, 140) : "Descrizione da verificare su Amazon."}</p>
      <details className="productDescription"><summary>Dettagli del prodotto</summary><p><strong>Titolo completo:</strong> {title}</p>{product.description ? <p>{product.description}</p> : null}<p>ASIN: {product.asin}</p>{price ? <p>Prezzo letto il {new Date(price.verifiedAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}. {price.reference ? "Il prezzo barrato è il riferimento rilevato, non una cronologia del prezzo." : "Prezzo originario non disponibile."}</p> : null}</details>
      <div className={price ? "priceRow" : "priceRow priceUnavailable"}>{price ? <strong>{money(price.current, product.currency)}</strong> : <strong>Vedi prezzo su Amazon</strong>}{price?.reference != null ? <del aria-label="Prezzo di riferimento">{money(price.reference, product.currency)}</del> : null}</div>
      <small>{price ? observedDate(price.verifiedAt, now) : "Prezzo non ancora verificato"}</small>
      <a className="buyButton" href={product.id ? `/api/click/${product.id}` : product.affiliate_url} target="_blank" rel="sponsored noopener noreferrer">Vedi su Amazon</a>
      <ProductTools asin={product.asin} title={title} url={product.affiliate_url} catalog={catalog} product={product}/>
    </div>
  </article>;
}
