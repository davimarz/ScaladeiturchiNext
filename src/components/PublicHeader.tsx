import { ShoppingLinks } from "./ShoppingTools";

import Link from "next/link";
import Image from "next/image";

export default function PublicHeader() {
  return <>
    <header className="topbar">
      <Link className="brand" href="/bestseller" aria-label="Scala dei Turchi - Bestseller">
        <span className="brandMark" aria-hidden="true">
          <Image src="/brand/scala-logo.webp" alt="" width={58} height={58} />
        </span>
        <span><strong>Scala dei Turchi</strong><small>Il tuo punto di partenza per lo shopping</small></span>
      </Link>
      <ShoppingLinks />
    </header>

    <section className="brandHero" aria-labelledby="brandHeroTitle">
      <Image
        src="/brand/scala-banner.webp"
        alt=""
        fill
        preload
        sizes="(max-width: 600px) calc(100vw - 24px), 1176px"
        className="brandHeroImage"
        aria-hidden="true"
      />
      <div className="brandHeroScrim" aria-hidden="true" />
      <div className="brandHeroContent">
        <p className="eyebrow">REALMONTE · AGRIGENTO</p>
        <h1 id="brandHeroTitle">Offerte da scoprire, con un tocco di Sicilia.</h1>
        <p>Prodotti e occasioni selezionati per aiutarti a trovare ciò che cerchi.</p>
        <Link className="brandHeroCta" href="/bestseller#catalogo">Scopri le offerte</Link>
      </div>
    </section>
  </>;
}
