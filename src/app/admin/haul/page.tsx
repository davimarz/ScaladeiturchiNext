import CatalogImportNotice from "../../../components/CatalogImportNotice";
import CatalogVerificationRunner from "../../../components/CatalogVerificationRunner";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCookie, verifyAdminSessionValue } from "../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../lib/supabase/admin";
import AdminUpdateButton from "../../../components/AdminUpdateButton";

export const dynamic = "force-dynamic";

export default async function AdminHaulPage({ searchParams }: { searchParams: Promise<{ haul_import?: string; haul_count?: string; price_seen?: string; price_updated?: string; price_unchanged?: string; price_failed?: string }> }) {
  const session = (await cookies()).get(adminCookie.name)?.value;
  if (!verifyAdminSessionValue(session)) redirect("/admin");
  const params = await searchParams;
  const [settings, count] = await Promise.all([
    supabaseAdminFetch<Array<{ value: unknown }>>("site_settings?key=eq.haul_source_url&select=value&limit=1"),
    supabaseAdminFetch<Array<{ id: string }>>("products?in_haul=eq.true&active=eq.true&select=id"),
  ]);
  const sourceUrl = typeof settings[0]?.value === "string" ? settings[0].value : "https://www.amazon.it/haul/store?ref_=nav_cs_hul_disb";

  return <main className="adminShell">
    <section className="adminHeader">
      <div><p className="eyebrow">AMMINISTRAZIONE</p><h1>HAUL</h1></div>
      <div className="adminActions"><Link href="/admin">Dashboard</Link><Link href="/admin/offerte-lambo">Offerte Lampo</Link>
          <Link href="/admin/bestseller">Bestseller</Link><Link href="/haul">Pagina pubblica</Link></div>
    </section>
    <section className="adminPanel">
      <h2>Importazione prodotti HAUL</h2>
      <p>Prodotti HAUL attivi: {count.length}.</p>
        <CatalogImportNotice catalog="haul" status={params.haul_import} count={params.haul_count} />
      <form action="/api/admin/haul/import" method="post" encType="multipart/form-data" className="compactImportForm">
        <div className="quickImportControls">
          <input id="haul-url" name="haul_url" type="url" defaultValue={sourceUrl} aria-label="Link HAUL Amazon" required />
          <AdminUpdateButton idleLabel="Aggiorna HAUL" />
        </div>
        <details className="advancedImport">
          <summary>Opzioni avanzate</summary>
          <label htmlFor="haul-html">File HTML salvato dal browser (facoltativo)</label>
          <input id="haul-html" name="html_file" type="file" accept=".html,.htm,text/html" />
        </details>
      </form>
      <p className="adminHint">Cliccando “Aggiorna HAUL” il sistema importa i prodotti trovati e aggiorna anche prezzo attuale, prezzo precedente e sconto dei prodotti HAUL già presenti.</p>
    </section>
  <CatalogVerificationRunner catalog={params.haul_import === "success" || params.haul_import === "price-only" ? "haul" : null} />
    </main>;
}
