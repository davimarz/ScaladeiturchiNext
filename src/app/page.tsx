import Link from "next/link";

import PublicHeader from "../components/PublicHeader";

import PublicTabs from "../components/PublicTabs";

import ProductBrowser from "../components/ProductBrowser";

export default function Home() {
  return <main><PublicHeader /><PublicTabs active="home"/><section className="homeWelcome"><p className="eyebrow">SCOPRI, CONFRONTA, SCEGLI</p><h1>Trova il prodotto adatto a te.</h1><p>Esplora i cataloghi Amazon oppure descrivi quello che ti serve. Foto, caratteristiche e prezzi in un unico posto.</p><div className="homePortals"><Link href="/bestseller"><strong>Bestseller</strong><span>I prodotti nelle classifiche Amazon</span></Link><Link href="/offerte-lambo"><strong>Offerte Lampo</strong><span>Scopri i prodotti dalla pagina offerte</span></Link><Link href="/haul"><strong>HAUL</strong><span>Esplora la selezione Amazon HAUL</span></Link><Link href="/chiedi-ai" className="aiPortal"><strong>Chiedi all’AI →</strong><span>Descrivi esigenza e budget: ti aiuto a cercare</span></Link></div></section><div className="compactCatalogPage"><ProductBrowser heading="Da scoprire" pageSize={8}/></div><footer><strong>Scala dei Turchi</strong><span>Shopping con informazioni trasparenti</span></footer></main>;
}
