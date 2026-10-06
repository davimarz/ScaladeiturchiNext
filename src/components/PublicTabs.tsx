import Link from "next/link";

type PublicTab = "haul" | "offerte" | "bestseller" | "cerca";

export default function PublicTabs({ active }: { active: PublicTab }) {
  return (
    <nav className="publicTabs" aria-label="Cataloghi">
      <Link className={active === "haul" ? "active" : ""} href="/haul" aria-current={active === "haul" ? "page" : undefined}>HAUL</Link>
      <Link className={active === "offerte" ? "active" : ""} href="/offerte-lambo" aria-current={active === "offerte" ? "page" : undefined}>Offerte Lampo</Link>
      <Link className={active === "bestseller" ? "active" : ""} href="/bestseller" aria-current={active === "bestseller" ? "page" : undefined}>Bestseller</Link>
      <Link className={active === "cerca" ? "active" : ""} href="/" aria-current={active === "cerca" ? "page" : undefined}>Cerca</Link>
    </nav>
  );
}
