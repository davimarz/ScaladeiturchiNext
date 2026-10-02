import Link from "next/link";
import ProductBrowser from "../../components/ProductBrowser";

export default function HaulPage() {
  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Scala dei Turchi - home">
          <span className="brandMark">ST</span>
          <span><strong>Scala dei Turchi</strong><small>Offerte Amazon</small></span>
        </Link>
        <nav aria-label="Navigazione principale">
          <Link href="/vetrina">Vetrina</Link>
          <Link href="/haul">HAUL</Link>
          <Link href="/offerte-lambo">Offerte Lambo</Link>
          <Link href="/">Home</Link>
        </nav>
      </header>

      <section className="hero haulHero">
        <div>
          <p className="eyebrow">AMAZON HAUL</p>
          <h1>Prodotti HAUL</h1>
          <p className="lead">Una pagina dedicata ai prodotti importati dalla sezione HAUL di Amazon Italia. Il catalogo viene aggiornato dall&apos;area amministratore.</p>
          <div className="heroActions"><Link className="cta" href="#haul-products">Vedi i prodotti</Link><Link className="secondary" href="/">Torna alla home</Link></div>
        </div>
        <aside className="heroPanel">
          <span>SEZIONE DEDICATA</span>
          <strong>HAUL</strong>
          <p>I link prodotto includono il tag affiliato del sito. Prezzi e sconti vengono mostrati quando disponibili nei dati importati o verificati.</p>
        </aside>
      </section>

      <div id="haul-products">
        <ProductBrowser fixedCategory="haul" heading="Catalogo HAUL" eyebrow="HAUL" showCategoryChips={false} />
      </div>

      <section className="notice"><strong>Trasparenza</strong><p>Scala dei Turchi partecipa al Programma Affiliazione Amazon. Alcuni link ai prodotti possono generare una commissione senza costi aggiuntivi per chi acquista.</p></section>
      <footer><strong>Scala dei Turchi</strong><span>HAUL · Amazon Italia</span></footer>
    </main>
  );
}
