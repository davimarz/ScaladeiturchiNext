import Link from "next/link";

type PublicTab = "haul" | "offerte" | "bestseller" | "ai" | "cerca";

export default function PublicTabs({ active }: { active: PublicTab }) {
  return (
    <nav className="publicTabs" aria-label="Cataloghi">
      <Link className={active === "bestseller" ? "active" : ""} href="/bestseller" aria-current={active === "bestseller" ? "page" : undefined}>Bestseller</Link>
      <Link className={active === "offerte" ? "active" : ""} href="/offerte-lambo" aria-current={active === "offerte" ? "page" : undefined}>Offerte Lampo</Link>
      <Link className={active === "haul" ? "active" : ""} href="/haul" aria-current={active === "haul" ? "page" : undefined}>HAUL</Link>
      <Link className={active === "ai" ? "active" : ""} href="/chiedi-ai" aria-current={active === "ai" ? "page" : undefined}>Chiedi all&apos;AI</Link>
    </nav>
  );
}
