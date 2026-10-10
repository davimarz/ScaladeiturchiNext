import PublicHeader from "../../components/PublicHeader";
import ProductBrowser from "../../components/ProductBrowser";
import PublicTabs from "../../components/PublicTabs";

export default function OfferteLamboPage() {
  return (
    <main>
      <PublicHeader />

      <PublicTabs active="offerte" />

      <div className="compactCatalogPage">
        <ProductBrowser
          fixedCategory="offerte-lambo"
          heading="Offerte Lampo"
          eyebrow="OFFERTE DA SCOPRIRE"
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
