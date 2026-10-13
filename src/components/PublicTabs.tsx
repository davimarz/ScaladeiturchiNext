import Link from "next/link";

type PublicTab = "haul" | "offerte" | "bestseller" | "ai" | "cerca" | "home";

function TabIcon({ name }: { name: "haul" | "offerte" | "bestseller" | "ai" }) {
  const paths = {
    bestseller: <><path d="M12 22c4 0 7-2.7 7-6.3 0-2.8-1.8-4.6-3.2-6.1.1 2-1.1 3.3-2.2 3.7C14.3 9.5 12.1 5.5 9 2c.4 3.6-1.3 5.5-3 7.5C4.9 10.9 5 12.6 5 15.7 5 19.3 8 22 12 22Z"/><path d="M12 22c1.8 0 3-1.4 3-3.1 0-1.3-.7-2.4-2-3.5-.1 1.4-.9 2-1.6 2.3-.4-1.4-1.3-2.4-2.2-3.1.1 1.6-1.2 2.8-1.2 4.3 0 1.7 1.2 3.1 4 3.1Z"/></>,
    offerte: <path d="m13 2-9 11h7l-1 9 10-12h-7l0-8Z"/>,
    haul: <><path d="M3 7h18l-2 13H5L3 7Z"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/><path d="M9 13h6"/></>,
    ai: <><rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M9 3h6M8 13h.01M16 13h.01M9 17h6"/></>,
  };
  return <svg className="publicTabIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function PublicTabs({ active }: { active: PublicTab }) {
  return (
    <nav className="publicTabs" aria-label="Cataloghi">
      <Link className={active === "bestseller" ? "active" : ""} href="/bestseller" aria-current={active === "bestseller" ? "page" : undefined}><TabIcon name="bestseller"/><span>Bestseller</span></Link>
      <Link className={active === "offerte" ? "active" : ""} href="/offerte-lambo" aria-current={active === "offerte" ? "page" : undefined}><TabIcon name="offerte"/><span>Offerte Lampo</span></Link>
      <Link className={active === "haul" ? "active" : ""} href="/haul" aria-current={active === "haul" ? "page" : undefined}><TabIcon name="haul"/><span>Occasioni HAUL</span></Link>
      <Link className={active === "ai" ? "active" : ""} href="/chiedi-ai" aria-current={active === "ai" ? "page" : undefined}><TabIcon name="ai"/><span>Assistente AI</span></Link>
    </nav>
  );
}
