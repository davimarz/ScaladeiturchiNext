import CatalogImportNotice from "../../../components/CatalogImportNotice";
import CatalogVerificationRunner from "../../../components/CatalogVerificationRunner";
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

        <CatalogImportNotice catalog="bestseller" status={params.bestseller_import} count={params.bestseller_count} />

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
    <CatalogVerificationRunner catalog={params.bestseller_import === "success" || params.bestseller_import === "price-only" ? "bestseller" : null} />
    </main>
  );
}
