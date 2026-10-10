"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useShoppingList, useShoppingSnapshots } from "../lib/shopping-store";
import { type StoreProduct } from "../lib/catalog-presentation";
import { getProductPrice } from "../lib/product-price";
import StoreProductCard from "./StoreProductCard";
import { money } from "./StoreProductCard";
function useSavedRows(asins: string[]) {
    const key = asins.join(",");
    const snapshots = useShoppingSnapshots();
    const [result, setResult] = useState<{
        key: string;
        products: StoreProduct[];
        error?: string;
    }>({ key: "", products: [] });
    useEffect(() => {
        if (!key)
            return;
        const controller = new AbortController();
        async function load() {
            try {
                const products: StoreProduct[] = [];
                let offset = 0, hasMore = true;
                while (hasMore && offset < 100) {
                    const response = await fetch(`/api/catalog?presentation=1&incomplete=1&limit=60&offset=${offset}&asins=${key}`, { signal: controller.signal, cache: "no-store" });
                    if (!response.ok)
                        throw new Error("Dati aggiornati temporaneamente non disponibili. Sono mostrate le copie salvate, quando presenti.");
                    const data = await response.json() as {
                        products: StoreProduct[];
                        has_more: boolean;
                        next_offset: number;
                    };
                    products.push(...data.products);
                    hasMore = data.has_more;
                    if (data.next_offset <= offset)
                        break;
                    offset = data.next_offset;
                }
                if (!controller.signal.aborted)
                    setResult({ key, products });
            }
            catch (error) {
                if (!controller.signal.aborted)
                    setResult({ key, products: [], error: error instanceof Error ? error.message : "Errore di caricamento." });
            }
        }
        void load();
        return () => controller.abort();
    }, [key]);
    const products = asins.map(asin => (result.key === key ? result.products : []).find(p => p.asin === asin) || (() => { const saved = snapshots.find(p => p.asin === asin); return saved ? { ...saved, id: "" } : undefined; })()).filter((p): p is StoreProduct => Boolean(p));
    return { products, loading: Boolean(key && result.key !== key), error: result.key === key ? result.error : undefined };
}
export function Favorites() {
    const { asins } = useShoppingList("favorites"), { products, loading, error } = useSavedRows(asins);
    const [now] = useState(Date.now);
    return <section><h1>I tuoi preferiti</h1><p className="savedNotice">I preferiti restano su questo browser e dispositivo, senza account. Cancellando i dati del browser li perdi. I prodotti trovati dall’AI possono essere conservati come copie locali: controlla sempre la data del prezzo e la disponibilità su Amazon.</p>{loading ? <p role="status">Controllo i dati aggiornati…</p> : null}{error ? <p role="status">{error}</p> : null}{!asins.length ? <div className="catalogState"><p>Salva un prodotto con il pulsante ♡ Salva per ritrovarlo qui.</p><Link href="/">Esplora i cataloghi</Link></div> : <><p>{products.length} preferiti disponibili su {asins.length} salvati.</p><div className="productGrid">{products.map(product => <StoreProductCard key={product.asin} product={product} now={now} catalog="preferiti"/>)}</div></>}</section>;
}
export function Comparison() {
    const { asins, toggle } = useShoppingList("compare");
    const { products, loading, error } = useSavedRows(asins);
    const [now] = useState(Date.now);
    const [message, setMessage] = useState("");
    return <section className="comparisonSection"><h1>Confronta i prodotti</h1><p>Scegli da 2 a 3 prodotti. Il confronto usa solo le informazioni disponibili: nessun punteggio o caratteristica viene inventato.</p>{message ? <p role="alert">{message}</p> : null}{!asins.length ? <p>Premi ⇄ Confronta nelle schede per iniziare. <Link href="/">Esplora i prodotti</Link></p> : loading ? <p role="status">Caricamento dati aggiornati…</p> : error && !products.length ? <p role="alert">{error}</p> : <>{error ? <p role="status">{error}</p> : null}<p>{products.length < 2 ? "Aggiungi un altro prodotto per confrontarli." : `${products.length} prodotti a confronto.`}{products.length < asins.length ? " Alcuni prodotti non sono più disponibili nel catalogo." : ""}</p><div className="comparisonScroll"><table className="comparisonTable"><caption>Prezzi e caratteristiche disponibili</caption><thead><tr><th scope="col">Informazione</th>{products.map(p => <th scope="col" key={p.asin}>{p.title}<button type="button" onClick={() => setMessage(toggle(p.asin))}>Rimuovi dal confronto</button></th>)}</tr></thead><tbody>{["Prezzo", "Prezzo di riferimento", "Descrizione", "Ultima lettura", "ASIN", "Acquisto"].map(label => <tr key={label}><th scope="row">{label}</th>{products.map(p => { const price = getProductPrice(p, now); return <td key={p.asin}>{label === "Prezzo" ? price ? money(price.current, p.currency) : "Non rilevato" : label === "Prezzo di riferimento" ? price?.reference ? money(price.reference, p.currency) : "Non disponibile" : label === "Descrizione" ? p.description || "Non disponibile" : label === "Ultima lettura" ? price ? new Date(price.verifiedAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "Non disponibile" : label === "ASIN" ? p.asin : <a href={p.id ? `/api/click/${p.id}` : p.affiliate_url} target="_blank" rel="sponsored noopener noreferrer">Vedi su Amazon</a>}</td>; })}</tr>)}</tbody></table></div><div className="comparisonSelection">{asins.filter(asin => !products.some(p => p.asin === asin)).map(asin => <button key={asin} type="button" onClick={() => setMessage(toggle(asin))}>Rimuovi {asin} non disponibile</button>)}</div></>}<p className="catalogDisclaimer">Le schede AI possono essere copie locali. Prezzi e disponibilità possono cambiare: controlla la data della lettura e verifica sempre su Amazon prima dell’acquisto.</p></section>;
}
