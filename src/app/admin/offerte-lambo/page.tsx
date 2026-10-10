import CatalogImportNotice from "../../../components/CatalogImportNotice";
import CatalogVerificationRunner from "../../../components/CatalogVerificationRunner";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCookie, verifyAdminSessionValue } from "../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../lib/supabase/admin";
import AdminUpdateButton from "../../../components/AdminUpdateButton";

export const dynamic = "force-dynamic";

const DEFAULT_LAMBO_URL = "https://www.amazon.it/offerte-lampo-del-giorno/s?k=offerte+lampo+del+giorno";

export default async function AdminOfferteLamboPage({ searchParams }: { searchParams: Promise<{ lambo_import?: string; lambo_count?: string; price_seen?: string; price_updated?: string; price_unchanged?: string; price_failed?: string }> }) {
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
        <div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Offerte Lampo</h1></div>
        <div className="adminActions">
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/haul">HAUL</Link>
          <Link href="/admin/bestseller">Bestseller</Link>
          <Link href="/offerte-lambo">Pagina pubblica</Link>
        </div>
      </section>

      <section className="adminPanel">
        <h2>Importazione prodotti Offerte Lampo</h2>
        <p>Prodotti Offerte Lampo attivi: {products.length}.</p>

        <CatalogImportNotice catalog="offerte-lambo" status={params.lambo_import} count={params.lambo_count} />

        <form action="/api/admin/offerte-lambo/import" method="post" encType="multipart/form-data" className="compactImportForm">
          <div className="quickImportControls">
            <input id="lambo-url" name="lambo_url" type="url" defaultValue={sourceUrl} aria-label="Link Amazon Offerte Lampo" required />
            <AdminUpdateButton idleLabel="Aggiorna Offerte" />
          </div>
          <details className="advancedImport">
            <summary>Opzioni avanzate</summary>
            <label htmlFor="lambo-html">File HTML salvato dal browser (facoltativo)</label>
            <input id="lambo-html" name="html_file" type="file" accept=".html,.htm,text/html" />
          </details>
        </form>

        <p className="adminHint">Cliccando “Aggiorna Offerte” il sistema importa i prodotti trovati e aggiorna anche prezzo attuale, prezzo precedente e sconto dei prodotti Offerte Lampo già presenti.</p>
      </section>
    <CatalogVerificationRunner catalog={params.lambo_import === "success" || params.lambo_import === "price-only" ? "offerte-lambo" : null} />
    </main>
  );
}
