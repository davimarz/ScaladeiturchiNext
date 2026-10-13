import PublicHeader from "../../components/PublicHeader";
import ProductBrowser from "../../components/ProductBrowser";
import PublicTabs from "../../components/PublicTabs";

export default function BestsellerPage() {
  return (
    <main>
      <PublicHeader />

      <PublicTabs active="bestseller" />

      <div className="compactCatalogPage">
        <ProductBrowser
          fixedCategory="bestseller"
          heading="Bestseller"
          eyebrow="I PIÙ VENDUTI"
          showCategoryChips={false}
        />
      </div>

      <section className="notice compactNotice">
        <strong>Trasparenza</strong>
        <p>Scala dei Turchi partecipa al Programma Affiliazione Amazon. Alcuni link possono generare una commissione senza costi aggiuntivi per chi acquista.</p>
      </section>
      <footer><strong>Scala dei Turchi</strong><span>Bestseller · Amazon Italia</span></footer>
    </main>
  );
}
