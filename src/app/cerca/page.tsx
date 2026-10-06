import Link from "next/link";
import ProductBrowser from "../../components/ProductBrowser";
import PublicTabs from "../../components/PublicTabs";

export default function CercaPage() {
  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Scala dei Turchi - home">
          <span className="brandMark">ST</span>
          <span><strong>Scala dei Turchi</strong><small>Offerte Amazon</small></span>
        </Link>
      </header>

      <PublicTabs active="cerca" />

      <section className="hero homeHero">
        <div>
          <p className="eyebrow">SCALA DEI TURCHI · SHOPPING</p>
          <h1>Trova subito ciò che cerchi.</h1>
          <p className="lead">Cerca tra tutti i prodotti disponibili nei cataloghi.</p>
        </div>
      </section>

      <ProductBrowser
        heading="Cerca tra tutti i prodotti"
        eyebrow="CERCA"
        showCategoryChips={false}
      />

      <section className="notice">
        <strong>Trasparenza</strong>
        <p>Scala dei Turchi partecipa al Programma Affiliazione Amazon. Alcuni link ai prodotti possono generare una commissione senza costi aggiuntivi per chi acquista.</p>
      </section>
      <footer><strong>Scala dei Turchi</strong><span>Offerte Amazon · Italia</span></footer>
    </main>
  );
}
