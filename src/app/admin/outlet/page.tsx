import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCookie, verifyAdminSessionValue } from "../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

const DEFAULT_OUTLET_URL = "https://www.amazon.it/b?_encoding=UTF8&node=21955579031&ref=it_outsbcd_9&ref_=cct_cg_OutletIT_1b1&pf_rd_p=944e3502-a5e7-48c3-a5d6-330210c1b635&pf_rd_r=8VJYFFY6AFE33ERXY91J";

export default async function AdminOutletPage({ searchParams }: { searchParams: Promise<{ outlet_import?: string; outlet_count?: string }> }) {
  const session = (await cookies()).get(adminCookie.name)?.value;
  if (!verifyAdminSessionValue(session)) redirect("/admin");
  const params = await searchParams;
  const [settings, count] = await Promise.all([
    supabaseAdminFetch<Array<{ value: unknown }>>("site_settings?key=eq.outlet_source_url&select=value&limit=1"),
    supabaseAdminFetch<Array<{ id: string }>>("products?in_outlet=eq.true&active=eq.true&select=id"),
  ]);
  const sourceUrl = typeof settings[0]?.value === "string" ? settings[0].value : DEFAULT_OUTLET_URL;

  return <main className="adminShell">
    <section className="adminHeader">
      <div><p className="eyebrow">AMMINISTRAZIONE</p><h1>OUTLET</h1></div>
      <div className="adminActions"><Link href="/admin">Dashboard</Link><Link href="/admin/haul">HAUL</Link><Link href="/outlet">Pagina pubblica</Link></div>
    </section>
    <section className="adminPanel">
      <h2>Importazione prodotti OUTLET</h2>
      <p>Prodotti OUTLET attivi: {count.length}. Questa raccolta è indipendente da HAUL.</p>
      {params.outlet_import === "success" ? <p className="adminNotice">Importazione completata: {params.outlet_count ?? "0"} prodotti inseriti o aggiornati.</p> : null}
      {params.outlet_import === "blocked" ? <p className="adminError">Amazon ha bloccato il download diretto. Salva la pagina OUTLET dal browser e carica il file HTML.</p> : null}
      {params.outlet_import && !["success","blocked"].includes(params.outlet_import) ? <p className="adminError">Importazione non completata ({params.outlet_import}). Puoi riprovare con il file HTML.</p> : null}
      <form action="/api/admin/outlet/import" method="post" encType="multipart/form-data" className="adminForm">
        <label htmlFor="outlet-url">Link OUTLET Amazon</label>
        <input id="outlet-url" name="outlet_url" type="url" defaultValue={sourceUrl} required />
        <label htmlFor="outlet-html">File HTML salvato dal browser (facoltativo)</label>
        <input id="outlet-html" name="html_file" type="file" accept=".html,.htm,text/html" />
        <button type="submit">Importa automaticamente prodotti OUTLET</button>
      </form>
      <p className="adminHint">Il link è modificabile. Senza file HTML il pulsante tenta di importare direttamente tutti i prodotti presenti nella pagina OUTLET indicata.</p>
    </section>
  </main>;
}
