import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCookie, verifyAdminSessionValue } from "../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../lib/supabase/admin";
import AdminUpdateButton from "../../../components/AdminUpdateButton";

export const dynamic = "force-dynamic";

const DEFAULT_BESTSELLER_URL = "https://www.amazon.it/gp/bestsellers/?ref_=nav_cs_bestsellers";

export default async function AdminBestsellerPage({
  searchParams,
}: {
  searchParams: Promise<{
    bestseller_import?: string;
    bestseller_count?: string;
    price_seen?: string;
    price_updated?: string;
    price_unchanged?: string;
    price_failed?: string;
    images_recovered?: string;
    images_missing?: string;
  }>;
}) {
  const session = (await cookies()).get(adminCookie.name)?.value;
  if (!verifyAdminSessionValue(session)) redirect("/admin");

  const params = await searchParams;
  const [settings, products] = await Promise.all([
    supabaseAdminFetch<Array<{ value: unknown }>>("site_settings?key=eq.bestseller_source_url&select=value&limit=1"),
    supabaseAdminFetch<Array<{ id: string }>>("products?in_bestseller=eq.true&active=eq.true&select=id&limit=1000"),
  ]);
  const sourceUrl = typeof settings[0]?.value === "string" ? settings[0].value : DEFAULT_BESTSELLER_URL;

  return (
    <main className="adminShell">
      <section className="adminHeader">
        <div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Bestseller</h1></div>
        <div className="adminActions">
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/haul">HAUL</Link>
          <Link href="/admin/offerte-lambo">Offerte Lampo</Link>
          <Link href="/bestseller">Pagina pubblica</Link>
        </div>
      </section>

      <section className="adminPanel">
        <h2>Importazione prodotti Bestseller</h2>
        <p>Prodotti Bestseller attivi: {products.length}.</p>

        {params.bestseller_import === "success" ? <p className="adminNotice">Bestseller: {params.bestseller_count ?? "0"} importati/aggiornati · {params.price_seen ?? "0"} controllati · {params.price_updated ?? "0"} prezzi cambiati · {params.price_unchanged ?? "0"} invariati · {params.price_failed ?? "0"} non leggibili/bloccati · {params.images_recovered ?? "0"} immagini recuperate · {params.images_missing ?? "0"} ancora mancanti.</p> : null}
        {params.bestseller_import === "price-only" ? <p className="adminNotice">Bestseller: scansione catalogo non disponibile; controllo prodotti esistenti completato · {params.price_seen ?? "0"} controllati · {params.price_updated ?? "0"} cambiati · {params.price_unchanged ?? "0"} invariati · {params.price_failed ?? "0"} non leggibili/bloccati.</p> : null}
        {params.bestseller_import === "blocked" ? <p className="adminError">Amazon ha bloccato la scansione automatica Bestseller. Puoi usare le opzioni avanzate e caricare il file HTML salvato dal browser.</p> : null}
        {params.bestseller_import === "empty" ? <p className="adminError">Non sono stati trovati prodotti riconoscibili nella pagina Bestseller.</p> : null}
        {params.bestseller_import === "invalid-url" ? <p className="adminError">Inserisci un URL Amazon Bestseller valido.</p> : null}
        {params.bestseller_import === "invalid-file" ? <p className="adminError">Il file deve essere HTML e non superare 40 MB.</p> : null}

        <form action="/api/admin/bestseller/import" method="post" encType="multipart/form-data" className="compactImportForm">
          <div className="quickImportControls">
            <input id="bestseller-url" name="bestseller_url" type="url" defaultValue={sourceUrl} aria-label="Link Amazon Bestseller" required />
            <AdminUpdateButton idleLabel="Aggiorna Bestseller" />
          </div>
          <details className="advancedImport">
            <summary>Opzioni avanzate</summary>
            <label htmlFor="bestseller-html">File HTML salvato dal browser (facoltativo)</label>
            <input id="bestseller-html" name="html_file" type="file" accept=".html,.htm,text/html" />
          </details>
        </form>

        <p className="adminHint">Cliccando “Aggiorna Bestseller” il sistema importa i prodotti trovati e aggiorna titolo, immagine, prezzo attuale, prezzo precedente e sconto dei prodotti Bestseller già presenti.</p>
      </section>
    </main>
  );
}
