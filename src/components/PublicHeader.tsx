import { ShoppingLinks } from "./ShoppingTools";

import Link from "next/link";
import Image from "next/image";

export default function PublicHeader() {
  return <header className="topbar">
  <Link className="brand" href="/bestseller" aria-label="Scala dei Turchi - Bestseller">
   <span className="brandMark" aria-hidden="true">
    <Image src="/brand/scala-logo.webp" alt="" width={58} height={58} />
   </span>
   <span><strong>Scala dei Turchi</strong><small>Il tuo punto di partenza per lo shopping</small></span>
  </Link>
  <ShoppingLinks />
 </header>;
}
