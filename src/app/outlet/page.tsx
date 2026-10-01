import Link from "next/link";
import ProductBrowser from "../../components/ProductBrowser";

export default function OutletPage() {
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
          <Link href="/outlet">OUTLET</Link>
          <Link href="/">Home</Link>
        </nav>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">AMAZON OUTLET</p>
          <h1>Prodotti OUTLET</h1>
          <p className="lead">Una pagina dedicata ai prodotti importati dalla sezione Outlet di Amazon Italia, separata dalla Vetrina e da HAUL.</p>
          <div className="heroActions"><Link className="cta" href="#outlet-products">Vedi i prodotti</Link><Link className="secondary" href="/">Torna alla home</Link></div>
        </div>
        <aside className="heroPanel">
          <span>SEZIONE DEDICATA</span>
          <strong>OUTLET</strong>
          <p>Le schede mostrano prezzo e sconto quando presenti nei dati importati o verificati e usano i link affiliati del sito.</p>
        </aside>
      </section>

      <div id="outlet-products">
        <ProductBrowser fixedCategory="outlet" heading="Catalogo OUTLET" eyebrow="OUTLET" showCategoryChips={false} />
      </div>

      <section className="notice"><strong>Trasparenza</strong><p>Scala dei Turchi partecipa al Programma Affiliazione Amazon. Alcuni link ai prodotti possono generare una commissione senza costi aggiuntivi per chi acquista.</p></section>
      <footer><strong>Scala dei Turchi</strong><span>OUTLET · Amazon Italia</span></footer>
    </main>
  );
}
