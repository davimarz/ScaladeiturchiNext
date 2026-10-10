import PublicHeader from "../../components/PublicHeader";
import PublicTabs from "../../components/PublicTabs";
import AIShoppingAssistant from "../../components/AIShoppingAssistant";

export default function ChiediAIPage() {
  return (
    <main>
      <PublicHeader />

      <PublicTabs active="ai" />

      <AIShoppingAssistant />

      <section className="notice compactNotice">
        <strong>Trasparenza</strong>
        <p>I risultati sono selezionati in base ai dati disponibili. Prezzi e disponibilità possono cambiare su Amazon. I link ai prodotti includono il codice affiliato di Scala dei Turchi.</p>
      </section>
      <footer><strong>Scala dei Turchi</strong><span>Assistente shopping AI · Amazon Italia</span></footer>
    </main>
  );
}
