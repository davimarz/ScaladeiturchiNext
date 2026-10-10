import Link from "next/link";

export default function PublicHeader() {
  return <header className="topbar">
    <Link className="brand" href="/" aria-label="Scala dei Turchi - home">
      <span className="brandMark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none"><path d="M5 23h7v-5h7v-5h8M5 28h22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span><strong>Scala dei Turchi</strong><small>Il tuo punto di partenza per lo shopping</small></span>
    </Link>
    <span className="headerNote">Cataloghi Amazon · Italia</span>
  </header>;
}
