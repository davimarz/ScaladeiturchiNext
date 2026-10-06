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
      <div className="adminActions"><Link href="/admin">Dashboard</Link><Link href="/admin/offerte-lambo">Offerte Lambo</Link>\n          <Link href="/admin/bestseller">Bestseller</Link><Link href="/haul">Pagina pubblica</Link></div>
    </section>
    <section className="adminPanel">
      <h2>Importazione prodotti HAUL</h2>
      <p>Prodotti HAUL attivi: {count.length}.</p>
      {params.haul_import === "success" ? <p className="adminNotice">HAUL: {params.haul_count ?? "0"} importati/aggiornati · {params.price_seen ?? "0"} controllati · {params.price_updated ?? "0"} prezzi cambiati · {params.price_unchanged ?? "0"} invariati · {params.price_failed ?? "0"} non leggibili/bloccati.</p> : null}
      {params.haul_import === "price-only" ? <p className="adminNotice">HAUL: scansione catalogo non disponibile · {params.price_seen ?? "0"} controllati · {params.price_updated ?? "0"} cambiati · {params.price_unchanged ?? "0"} invariati · {params.price_failed ?? "0"} non leggibili/bloccati.</p> : null}
      {params.haul_import === "blocked" ? <p className="adminError">Amazon ha bloccato il download diretto. Salva la pagina HAUL dal browser e carica il file HTML.</p> : null}
      {params.haul_import && !["success","price-only","blocked"].includes(params.haul_import) ? <p className="adminError">Importazione non completata ({params.haul_import}). Se il browser automatico è stato bloccato, puoi riprovare con il file HTML della pagina HAUL dopo averla scorsa fino in fondo.</p> : null}
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
  </main>;
}
