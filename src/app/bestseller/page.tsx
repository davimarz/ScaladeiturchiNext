import PublicHeader from "../../components/PublicHeader";
import Image from "next/image";
import ProductBrowser from "../../components/ProductBrowser";
import PublicTabs from "../../components/PublicTabs";

export default function BestsellerPage() {
  return (
    <main>
      <PublicHeader />

      <section className="brandHero" aria-labelledby="brandHeroTitle">
        <div className="brandHeroContent">
          <p className="eyebrow">REALMONTE · AGRIGENTO</p>
          <h2 id="brandHeroTitle">Offerte da scoprire, con un tocco di Sicilia.</h2>
          <p>Prodotti e occasioni Amazon selezionati per rendere più semplice la tua ricerca.</p>
          <a className="brandHeroCta" href="#catalogo">Scopri le offerte</a>
        </div>
        <div className="brandHeroVisual">
          <Image src="/brand/scala-banner.webp" alt="La Scala dei Turchi e il mare della costa agrigentina" fill preload sizes="(max-width: 600px) 100vw, 1176px" className="brandHeroImage" />
        </div>
      </section>

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
