import PublicHeader from "../../components/PublicHeader";
import ProductBrowser from "../../components/ProductBrowser";
import PublicTabs from "../../components/PublicTabs";

export default function HaulPage() {
  return (
    <main>
      <PublicHeader />

      <PublicTabs active="haul" />

      <div className="compactCatalogPage">
        <ProductBrowser
          fixedCategory="haul"
          heading="HAUL"
          eyebrow="PICCOLI ACQUISTI, NUOVE IDEE"
          showCategoryChips={false}
        />
      </div>

      <section className="notice compactNotice">
        <strong>Trasparenza</strong>
        <p>Scala dei Turchi partecipa al Programma Affiliazione Amazon. Alcuni link possono generare una commissione senza costi aggiuntivi per chi acquista.</p>
      </section>
      <footer><strong>Scala dei Turchi</strong><span>HAUL · Amazon Italia</span></footer>
    </main>
  );
}
