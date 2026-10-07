import Link from "next/link";
import PublicTabs from "../../components/PublicTabs";
import AIShoppingAssistant from "../../components/AIShoppingAssistant";
import { getMostSearchedProducts } from "../../lib/ai-shopping";

export default async function ChiediAIPage() {
  const popularSuggestions = (await getMostSearchedProducts(4).catch(() => []))
    .map((product) => product.title)
    .filter(Boolean);

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Scala dei Turchi - home">
          <span className="brandMark">ST</span>
          <span><strong>Scala dei Turchi</strong><small>Offerte Amazon</small></span>
        </Link>
      </header>

      <PublicTabs active="ai" />

      <AIShoppingAssistant suggestions={popularSuggestions} />

      <section className="notice compactNotice">
        <strong>Trasparenza</strong>
        <p>I risultati sono selezionati in base ai dati disponibili. Prezzi e disponibilità possono cambiare su Amazon. I link ai prodotti includono il codice affiliato di Scala dei Turchi.</p>
      </section>
      <footer><strong>Scala dei Turchi</strong><span>Assistente shopping AI · Amazon Italia</span></footer>
    </main>
  );
}
