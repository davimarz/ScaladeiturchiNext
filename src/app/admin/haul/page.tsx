import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCookie, verifyAdminSessionValue } from "../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminHaulPage({ searchParams }: { searchParams: Promise<{ haul_import?: string; haul_count?: string }> }) {
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
      <div className="adminActions"><Link href="/admin">Dashboard</Link><Link href="/admin/offerte-lambo">Offerte Lambo</Link><Link href="/haul">Pagina pubblica</Link></div>
    </section>
    <section className="adminPanel">
      <h2>Importazione prodotti HAUL</h2>
      <p>Prodotti HAUL attivi: {count.length}.</p>
      {params.haul_import === "success" ? <p className="adminNotice">Importazione completata: {params.haul_count ?? "0"} prodotti inseriti o aggiornati.</p> : null}
      {params.haul_import === "blocked" ? <p className="adminError">Amazon ha bloccato il download diretto. Salva la pagina HAUL dal browser e carica il file HTML.</p> : null}
      {params.haul_import && !["success","blocked"].includes(params.haul_import) ? <p className="adminError">Importazione non completata ({params.haul_import}). Se il browser automatico è stato bloccato, puoi riprovare con il file HTML della pagina HAUL dopo averla scorsa fino in fondo.</p> : null}
      <form action="/api/admin/haul/import" method="post" encType="multipart/form-data" className="adminForm">
        <label htmlFor="haul-url">Link HAUL Amazon</label>
        <input id="haul-url" name="haul_url" type="url" defaultValue={sourceUrl} required />
        <label htmlFor="haul-html">File HTML salvato dal browser (facoltativo)</label>
        <input id="haul-html" name="html_file" type="file" accept=".html,.htm,text/html" />
        <button type="submit">Scansiona tutta la pagina e importa HAUL</button>
      </form>
      <p className="adminHint">Puoi sostituire il link predefinito con un altro URL HAUL Amazon.it. Se non carichi un file, il sistema apre automaticamente HAUL con un browser, scorre la pagina fino a quando non trova più nuovi prodotti e poi importa tutti gli ASIN rilevati.</p>
    </section>
  </main>;
}
