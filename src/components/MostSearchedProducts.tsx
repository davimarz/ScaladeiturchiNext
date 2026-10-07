import Image from "next/image";
import { getMostSearchedProducts } from "../lib/ai-shopping";

function money(value: number | null, currency: string) {
  if (value == null) return null;
  return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value);
}

export default async function MostSearchedProducts() {
  const products = await getMostSearchedProducts(4).catch(() => []);
  if (!products.length) return null;

  return (
    <section className="aiShopping">
      <div className="aiShoppingIntro">
        <p className="eyebrow">I PIÙ RICERCATI</p>
        <h2>I 4 prodotti più ricercati</h2>
        <p>I prodotti che compaiono più spesso nelle ricerche dei clienti dell&apos;assistente shopping.</p>
      </div>

      <div className="aiProductGrid">
        {products.map((product, index) => (
          <article className="productCard" key={product.asin}>
            <a className="productImage" href={product.affiliateUrl} target="_blank" rel="sponsored noopener noreferrer">
              {product.imageUrl ? (
                <Image src={product.imageUrl} alt={product.title} width={400} height={300} unoptimized />
              ) : (
                <span>Immagine non disponibile</span>
              )}
            </a>
            <div className="productBody">
              <span className="discount">#{index + 1} · {product.searches} ricerche</span>
              {product.discountPercent != null && product.discountPercent > 0 ? (
                <span className="discount">RISPARMIA {Math.round(product.discountPercent)}%</span>
              ) : null}
              <h3>{product.title}</h3>
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
    </section>
  );
}
