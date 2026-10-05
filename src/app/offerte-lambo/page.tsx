import Link from "next/link";
import ProductBrowser from "../../components/ProductBrowser";
import PublicTabs from "../../components/PublicTabs";

export default function OfferteLamboPage() {
  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Scala dei Turchi - home">
          <span className="brandMark">ST</span>
          <span><strong>Scala dei Turchi</strong><small>Offerte Amazon</small></span>
        </Link>

      </header>
      <PublicTabs active="offerte" />

      <section className="hero">
        <div>
          <p className="eyebrow">AMAZON DEALS</p>
          <h1>Offerte Lambo</h1>
          <p className="lead">Una pagina dedicata ai prodotti importati dalla sezione Offerte di Amazon Italia, separata da Vetrina e HAUL.</p>
        </div>
        <aside className="heroPanel">
          <span>SEZIONE DEDICATA</span>
          <strong>Offerte Lambo</strong>
          <p>I prodotti vengono aggiornati dall&apos;area amministratore tramite scansione della pagina Amazon Deals.</p>
        </aside>
      </section>

      <div id="lambo-products">
        <ProductBrowser fixedCategory="offerte-lambo" heading="Catalogo Offerte Lambo" eyebrow="OFFERTE LAMBO" showCategoryChips={false} />
      </div>

      <section className="notice"><strong>Trasparenza</strong><p>Scala dei Turchi partecipa al Programma Affiliazione Amazon. Alcuni link ai prodotti possono generare una commissione senza costi aggiuntivi per chi acquista.</p></section>
      <footer><strong>Scala dei Turchi</strong><span>Offerte Lambo · Amazon Italia</span></footer>
    </main>
  );
}
