import { cookies } from "next/headers";
import { adminCookie, verifyAdminSessionValue } from "../../lib/admin-auth";
import { supabaseAdminFetch } from "../../lib/supabase/admin";

export const dynamic = "force-dynamic";

type SyncRun = {
  id: number;
  status: string;
  products_seen: number;
  products_updated: number;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
};

type Product = {
  id: string;
  asin: string;
  title: string;
  current_price: number | null;
  currency: string;
  updated_at: string;
  active: boolean;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const cookieStore = await cookies();
  const session = cookieStore.get(adminCookie.name)?.value;
  const authenticated = verifyAdminSessionValue(session);
  const params = await searchParams;

  if (!authenticated) {
    return (
      <main className="adminShell">
        <section className="adminLogin">
          <p className="eyebrow">AREA RISERVATA</p>
          <h1>Amministrazione</h1>
          <p>Inserisci la password amministratore.</p>
          {params.error ? <p className="adminError">Password non valida.</p> : null}
          <form action="/api/admin/login" method="post" className="adminForm">
            <input type="password" name="password" required autoComplete="current-password" placeholder="Password" />
            <button type="submit">Accedi</button>
          </form>
          <a href="/">← Torna al sito</a>
        </section>
      </main>
    );
  }

  const [runs, products] = await Promise.all([
    supabaseAdminFetch<SyncRun[]>("sync_runs?select=id,status,products_seen,products_updated,started_at,finished_at,error_message&order=started_at.desc&limit=10"),
    supabaseAdminFetch<Product[]>("products?select=id,asin,title,current_price,currency,updated_at,active&order=updated_at.desc&limit=20"),
  ]);

  return (
    <main className="adminShell">
      <section className="adminHeader">
        <div><p className="eyebrow">SCALA DEI TURCHI</p><h1>Dashboard</h1></div>
        <div className="adminActions">
          <a href="/">Apri il sito</a>
          <form action="/api/admin/logout" method="post"><button type="submit">Esci</button></form>
        </div>
      </section>

      <section className="adminPanel">
        <h2>Ultime sincronizzazioni</h2>
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead><tr><th>Stato</th><th>Prodotti</th><th>Aggiornati</th><th>Avvio</th><th>Errore</th></tr></thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.status}</td>
                  <td>{run.products_seen}</td>
                  <td>{run.products_updated}</td>
                  <td>{new Date(run.started_at).toLocaleString("it-IT")}</td>
                  <td>{run.error_message ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="adminPanel">
        <h2>Prodotti aggiornati di recente</h2>
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead><tr><th>ASIN</th><th>Titolo</th><th>Prezzo</th><th>Aggiornato</th></tr></thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.asin}</td>
                  <td>{product.title}</td>
                  <td>{product.current_price == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: product.currency }).format(product.current_price)}</td>
                  <td>{new Date(product.updated_at).toLocaleString("it-IT")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
