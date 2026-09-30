import { cookies } from "next/headers";
import DeleteProductButton from "../../components/DeleteProductButton";
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
  source: string | null;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    sync?: string;
    manual?: string;
    delete?: string;
  }>;
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
    supabaseAdminFetch<SyncRun[]>(
      "sync_runs?select=id,status,products_seen,products_updated,started_at,finished_at,error_message&order=started_at.desc&limit=10",
    ),
    supabaseAdminFetch<Product[]>(
      "products?select=id,asin,title,current_price,currency,updated_at,active,source&order=updated_at.desc&limit=30",
    ),
  ]);

  return (
    <main className="adminShell">
      <section className="adminHeader">
        <div>
          <p className="eyebrow">SCALA DEI TURCHI</p>
          <h1>Dashboard</h1>
        </div>
        <div className="adminActions">
          <a href="/">Apri il sito</a>
          <form action="/api/admin/logout" method="post">
            <button type="submit">Esci</button>
          </form>
        </div>
      </section>

      <section className="adminPanel">
        <h2>Catalogo manuale</h2>
        <p>
          Creators API è pronta ma Amazon sta restituendo <strong>AssociateNotEligible</strong>.
          Nel frattempo puoi pubblicare prodotti usando i link generati da SiteStripe/Product Links.
        </p>

        {params.manual === "success" ? <p className="adminNotice">Prodotto aggiunto al catalogo.</p> : null}
        {params.manual === "success-image" ? <p className="adminNotice">Prodotto aggiunto con immagine.</p> : null}
        {params.manual === "updated" ? <p className="adminNotice">Prodotto aggiornato nel catalogo.</p> : null}
        {params.manual === "updated-image" ? <p className="adminNotice">Prodotto aggiornato con immagine.</p> : null}
        {params.manual === "invalid" ? <p className="adminError">Inserisci un link Amazon valido (amazon.it, amzn.to o link.amazon).</p> : null}
        {params.manual === "unresolved" ? <p className="adminError">Non sono riuscito a risolvere il link corto Amazon. Prova con il link completo del prodotto.</p> : null}
        {params.manual === "noasin" ? <p className="adminError">Non sono riuscito a trovare l'ASIN nel link. Prova con il link della pagina prodotto.</p> : null}
        {params.manual === "image-invalid" ? <p className="adminError">Immagine non valida. Usa JPG, PNG o WEBP fino a 5 MB.</p> : null}
        {params.manual === "error" ? <p className="adminError">Errore durante il salvataggio del prodotto. Riprova.</p> : null}
        {params.delete === "success" ? <p className="adminNotice">Prodotto eliminato dal catalogo.</p> : null}
        {params.delete === "invalid" ? <p className="adminError">Prodotto non valido.</p> : null}
        {params.delete === "error" ? <p className="adminError">Errore durante l'eliminazione del prodotto.</p> : null}

        <form action="/api/admin/products" method="post" encType="multipart/form-data" className="adminForm">
          <textarea name="amazon_input" required rows={5} placeholder="Incolla qui il link Amazon oppure il codice SiteStripe Immagine / Testo + immagine" />
          <input type="file" name="image" accept="image/jpeg,image/png,image/webp" />
          <button type="submit">Aggiungi prodotto</button>
        </form>

        <p className="adminHint">
          Se incolli un normale link Amazon, il sistema pulisce il link e applica il tag affiliato eiapromo-21. Se incolli il codice SiteStripe “Immagine” o “Testo + immagine”, estrae anche l'immagine automaticamente. Il caricamento da PC resta facoltativo.
        </p>
      </section>

      <section className="adminPanel">
        <h2>Ultime sincronizzazioni API</h2>
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Stato</th>
                <th>Prodotti</th>
                <th>Aggiornati</th>
                <th>Avvio</th>
                <th>Errore</th>
              </tr>
            </thead>
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
        <h2>Prodotti nel catalogo</h2>
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Codice</th>
                <th>Titolo</th>
                <th>Fonte</th>
                <th>Prezzo</th>
                <th>Aggiornato</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.asin}</td>
                  <td>{product.title}</td>
                  <td>{product.source ?? "—"}</td>
                  <td>
                    {product.current_price == null
                      ? "Su Amazon"
                      : new Intl.NumberFormat("it-IT", {
                          style: "currency",
                          currency: product.currency,
                        }).format(product.current_price)}
                  </td>
                  <td>{new Date(product.updated_at).toLocaleString("it-IT")}</td>
                  <td>
                    {product.source === "manual-amazon-link" ? (
                      <DeleteProductButton id={product.id} />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
