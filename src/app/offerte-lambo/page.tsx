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

      <div className="compactCatalogPage">
        <ProductBrowser
          fixedCategory="offerte-lambo"
          heading="Offerte Lampo"
          eyebrow="OFFERTE LAMPO"
          showCategoryChips={false}
        />
      </div>

      <section className="notice compactNotice">
        <strong>Trasparenza</strong>
        <p>Scala dei Turchi partecipa al Programma Affiliazione Amazon. Alcuni link possono generare una commissione senza costi aggiuntivi per chi acquista.</p>
      </section>
      <footer><strong>Scala dei Turchi</strong><span>Offerte Lampo · Amazon Italia</span></footer>
    </main>
  );
}
