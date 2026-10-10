import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCookie, verifyAdminSessionValue } from "../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../lib/supabase/admin";
import { catalogConfig, isCatalog } from "../../../lib/catalog-config";
import { missingCatalogData } from "../../../lib/catalog-product";
import { type StoreProduct } from "../../../lib/catalog-presentation";
import CatalogVerificationRunner from "../../../components/CatalogVerificationRunner";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: {
    searchParams: Promise<{
        catalog?: string;
        missing?: string;
    }>;
}) {
    if (!verifyAdminSessionValue((await cookies()).get(adminCookie.name)?.value))
        redirect("/admin");
    const params = await searchParams;
    const catalog = isCatalog(params.catalog) ? params.catalog : "bestseller";
    const field = ["titolo", "immagine", "descrizione", "prezzo"].includes(params.missing || "") ? params.missing! : "prezzo";
    const rows: StoreProduct[] = [];
    for (let offset = 0; offset <= 10000; offset += 1000) {
        const page = await supabaseAdminFetch<StoreProduct[]>(`products?active=eq.true&${catalogConfig[catalog].membership}=eq.true&select=id,asin,title,description,image_url,current_price,list_price,discount_percent,price_verified_at,affiliate_url,currency&order=id.asc&limit=1000&offset=${offset}`);
        rows.push(...page);
        if (page.length < 1000)
            break;
    }
    const products = rows.filter(p => missingCatalogData({ title: p.title, description: p.description, imageUrl: p.image_url, currentPrice: p.current_price, listPrice: p.list_price, discountPercent: p.discount_percent }).includes(field) || (field === "prezzo" && !p.price_verified_at));
    return <main className="adminShell"><Link href="/admin">← Amministrazione</Link><section className="adminPanel"><h1>{catalogConfig[catalog].label}: {products.length} prodotti senza {field}{field === "prezzo" ? " rilevato" : ""}</h1><p>Controlla la fonte oppure riprova i prodotti incompleti senza ripetere l’importazione.</p><CatalogVerificationRunner catalog={null} scope={catalog}/><div className="reviewProducts">{products.map(p => <article key={p.id}><h2>{p.title}</h2><p>ASIN: {p.asin}</p><p>{p.description || "Descrizione non disponibile"}</p><a href={p.affiliate_url} target="_blank" rel="noopener noreferrer">Controlla su Amazon</a></article>)}</div>{!products.length ? <p>Nessun prodotto con questo dato mancante.</p> : null}</section></main>;
}
