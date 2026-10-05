import ProductBrowser from "../components/ProductBrowser";

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Scala dei Turchi - home">
          <span className="brandMark">ST</span>
          <span><strong>Scala dei Turchi</strong><small>Offerte Amazon</small></span>
        </a>
        <nav aria-label="Navigazione principale">
          <a href="/haul">HAUL</a>
          <a href="/offerte-lambo">Offerte Lampo</a>
          <a href="#cerca">Cerca</a>
        </nav>
      </header>

      <section className="hero homeHero">
        <div>
          <p className="eyebrow">SCALA DEI TURCHI · SHOPPING</p>
          <h1>Trova subito ciò che cerchi.</h1>
          <p className="lead">Vai direttamente a HAUL, alle Offerte Lampo oppure cerca tra tutti i prodotti disponibili.</p>
          <div className="homeQuickNav" aria-label="Accessi rapidi">
            <a className="homeNavButton" href="/haul">HAUL</a>
            <a className="homeNavButton" href="/offerte-lambo">Offerte Lampo</a>
            <a className="homeNavButton" href="#cerca">Cerca</a>
          </div>
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
