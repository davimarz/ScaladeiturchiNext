import Link from "next/link";
import ProductBrowser from "../../components/ProductBrowser";

export default function VetrinaPage() {
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

      <section className="hero">
        <div>
          <p className="eyebrow">VETRINA</p>
          <h1>Prodotti selezionati</h1>
          <p className="lead">La vetrina generale contiene solo i prodotti del catalogo standard. I prodotti HAUL e Offerte Lambo restano nelle rispettive pagine dedicate.</p>
          <div className="heroActions"><Link className="cta" href="#vetrina-products">Vedi i prodotti</Link><Link className="secondary" href="/">Torna alla home</Link></div>
        </div>
      </section>

      <div id="vetrina-products">
        <ProductBrowser heading="Vetrina prodotti" eyebrow="VETRINA" excludeCategories="haul,outlet,offerte-lambo" />
      </div>

      <section className="notice"><strong>Trasparenza</strong><p>Scala dei Turchi partecipa al Programma Affiliazione Amazon. Alcuni link ai prodotti possono generare una commissione senza costi aggiuntivi per chi acquista.</p></section>
      <footer><strong>Scala dei Turchi</strong><span>Vetrina · Amazon Italia</span></footer>
    </main>
  );
}
