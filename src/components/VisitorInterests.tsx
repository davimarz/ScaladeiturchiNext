import Link from "next/link";
import { supabaseAdminFetch } from "../lib/supabase/admin";
const labels: Record<string, string> = { "catalog-view": "Consultazioni cataloghi", search: "Ricerche", filter: "Filtri applicati", sort: "Ordinamenti", favorite: "Interazioni preferiti", compare: "Interazioni confronto", share: "Condivisioni" };
async function loadInterests() {
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const data = await Promise.all([supabaseAdminFetch<Array<{
            event: string;
            catalog: string;
            count: number;
        }>>(`shopping_interest_daily?event_day=gte.${since}&select=event,catalog,count&limit=1000`), supabaseAdminFetch<Array<{
            product_id: string;
            title: string;
            clicks: number;
            affiliate_url: string;
        }>>("rpc/shopping_click_summary", { method: "POST", body: "{}" })]).catch(() => null);
    if (!data) return null;
    const [rows, clicks] = data;
    const links = clicks.length ? await supabaseAdminFetch<Array<{id:string;affiliate_url:string}>>(`products?id=in.(${clicks.map(row=>row.product_id).join(",")})&select=id,affiliate_url&limit=10`).catch(()=>[]) : [];
    return [rows, clicks.map(row=>({...row, affiliate_url:links.find(link=>link.id===row.product_id)?.affiliate_url || ""}))] as const;
}
export default async function VisitorInterests() {
    const data = await loadInterests();
    if (!data)
        return <section className="adminPanel"><h2>Interessi dei visitatori</h2><p>Statistiche temporaneamente non disponibili. Cataloghi e aggiornamenti restano accessibili.</p></section>;
    const [rows, clicks] = data;
    const totals = new Map<string, number>(), catalogs = new Map<string, number>();
    for (const row of rows) {
        totals.set(row.event, (totals.get(row.event) || 0) + row.count);
        if (row.event === "catalog-view")
            catalogs.set(row.catalog, (catalogs.get(row.catalog) || 0) + row.count);
    }
    return <section className="adminPanel"><h2>Interessi dei visitatori · ultimi 30 giorni</h2><p>Conteggi aggregati delle interazioni, senza identificativi, cookie di tracciamento o testo delle ricerche. Non rappresentano visitatori unici. Le ricerche AI sono consultabili nello storico dedicato.</p><div className="interestGrid">{Object.entries(labels).map(([event, label]) => <div key={event}><span>{label}</span><strong>{totals.get(event) || 0}</strong></div>)}<div><span>Clic verso Amazon</span><strong>{clicks.reduce((sum, row) => sum + Number(row.clicks), 0)}</strong><small>Somma dei 10 prodotti più cliccati</small></div></div><details><summary>Cataloghi consultati e prodotti più cliccati</summary><ul>{[...catalogs].sort((a, b) => b[1] - a[1]).map(([catalog, count]) => <li key={catalog}>{catalog}: {count} consultazioni</li>)}</ul><ol>{clicks.map(row => <li key={row.product_id}>{row.title}: {row.clicks} clic <Link href={row.affiliate_url || "/"} target="_blank" rel="noopener noreferrer">Apri il prodotto</Link></li>)}</ol>{!rows.length ? <p>I nuovi conteggi iniziano dalla pubblicazione di questa versione.</p> : null}</details></section>;
}
