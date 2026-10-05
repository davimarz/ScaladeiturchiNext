import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCookie, verifyAdminSessionValue } from "../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

const DEFAULT_LAMBO_URL = "https://www.amazon.it/offerte-lampo-del-giorno/s?k=offerte+lampo+del+giorno";

export default async function AdminOfferteLamboPage({ searchParams }: { searchParams: Promise<{ lambo_import?: string; lambo_count?: string; price_seen?: string; price_updated?: string }> }) {
  const session = (await cookies()).get(adminCookie.name)?.value;
  if (!verifyAdminSessionValue(session)) redirect("/admin");

  const params = await searchParams;
  const [settings, products] = await Promise.all([
    supabaseAdminFetch<Array<{ value: unknown }>>("site_settings?key=eq.offerte_lambo_source_url&select=value&limit=1"),
    supabaseAdminFetch<Array<{ id: string }>>("products?in_offerte_lambo=eq.true&active=eq.true&select=id"),
  ]);
  const sourceUrl = typeof settings[0]?.value === "string" ? settings[0].value : DEFAULT_LAMBO_URL;

  return (
    <main className="adminShell">
      <section className="adminHeader">
        <div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Offerte Lambo</h1></div>
        <div className="adminActions">
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/haul">HAUL</Link>
          <Link href="/offerte-lambo">Pagina pubblica</Link>
        </div>
      </section>

      <section className="adminPanel">
        <h2>Importazione prodotti Offerte Lambo</h2>
        <p>Prodotti Offerte Lambo attivi: {products.length}.</p>

        {params.lambo_import === "success" ? <p className="adminNotice">Aggiornamento completato: {params.lambo_count ?? "0"} prodotti importati o aggiornati; prezzi controllati per {params.price_seen ?? "0"} prodotti e aggiornati per {params.price_updated ?? "0"}.</p> : null}
        {params.lambo_import === "price-only" ? <p className="adminNotice">Amazon ha bloccato la scansione del catalogo, ma prezzi e sconti dei prodotti Offerte Lambo esistenti sono stati controllati: {params.price_updated ?? "0"} aggiornati su {params.price_seen ?? "0"}.</p> : null}
        {params.lambo_import === "blocked" ? <p className="adminError">Amazon ha bloccato la scansione automatica anche dopo il secondo tentativo. Puoi usare “Opzioni avanzate” e caricare il file HTML salvato dal browser.</p> : null}
        {params.lambo_import === "empty" ? <p className="adminError">Non sono stati trovati prodotti riconoscibili nella pagina.</p> : null}
        {params.lambo_import === "invalid-url" ? <p className="adminError">Inserisci un URL Amazon Offerte Lampo valido.</p> : null}
        {params.lambo_import === "invalid-file" ? <p className="adminError">Il file deve essere HTML e non superare 40 MB.</p> : null}
        {params.lambo_import && !["success","price-only","blocked","empty","invalid-url","invalid-file"].includes(params.lambo_import) ? <p className="adminError">Importazione non completata ({params.lambo_import}). Puoi riprovare con il file HTML della pagina Offerte Lampo.</p> : null}

        <form action="/api/admin/offerte-lambo/import" method="post" encType="multipart/form-data" className="compactImportForm">
          <div className="quickImportControls">
            <input id="lambo-url" name="lambo_url" type="url" defaultValue={sourceUrl} aria-label="Link Amazon Offerte Lampo" required />
            <button type="submit">Aggiorna Offerte</button>
          </div>
          <details className="advancedImport">
            <summary>Opzioni avanzate</summary>
            <label htmlFor="lambo-html">File HTML salvato dal browser (facoltativo)</label>
            <input id="lambo-html" name="html_file" type="file" accept=".html,.htm,text/html" />
          </details>
        </form>

        <p className="adminHint">Cliccando “Aggiorna Offerte” il sistema importa i prodotti trovati e aggiorna anche prezzo attuale, prezzo precedente e sconto dei prodotti Offerte Lambo già presenti.</p>
      </section>
    </main>
  );
}
