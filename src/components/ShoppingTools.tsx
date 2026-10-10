"use client";
import Link from "next/link";
import { useState } from "react";
import { useShoppingList, rememberProduct } from "../lib/shopping-store";
import type { StoreProduct } from "../lib/catalog-presentation";
import { recordInterest } from "../lib/interest-events";
export function ShoppingLinks() {
    const favorites = useShoppingList("favorites"), compare = useShoppingList("compare");
    return <nav className="shoppingLinks" aria-label="I tuoi prodotti"><Link href="/preferiti">♡ Preferiti <span>{favorites.asins.length}</span></Link><Link href="/confronta">⇄ Confronta <span>{compare.asins.length}/3</span></Link></nav>;
}
export function ProductTools({ asin, title, url, catalog = "tutte", product }: {
    asin: string;
    title: string;
    url: string;
    catalog?: string;
    product?: StoreProduct;
}) {
    const favorites = useShoppingList("favorites"), compare = useShoppingList("compare");
    const [message, setMessage] = useState("");
    async function share() {
        try {
            if (navigator.share)
                await navigator.share({ title, text: title, url });
            else {
                await navigator.clipboard.writeText(url);
                setMessage("Link copiato. Puoi incollarlo dove preferisci.");
            }
            recordInterest("share", catalog);
        }
        catch (error) {
            if (!(error instanceof Error && error.name === "AbortError"))
                setMessage("Puoi condividere il prodotto con il link WhatsApp.");
        }
    }
    return <div className="productTools"><button type="button" aria-label={(favorites.asins.includes(asin) ? "Rimuovi dai preferiti: " : "Salva nei preferiti: ") + title} aria-pressed={favorites.asins.includes(asin)} onClick={() => { if (product)
        rememberProduct(product); setMessage(favorites.toggle(asin)); recordInterest("favorite", catalog); }}>{favorites.asins.includes(asin) ? "♥ Salvato" : "♡ Salva"}</button><button type="button" aria-pressed={compare.asins.includes(asin)} onClick={() => { if (product)
        rememberProduct(product); setMessage(compare.toggle(asin)); recordInterest("compare", catalog); }}>{compare.asins.includes(asin) ? "✓ Nel confronto" : "⇄ Confronta"}</button><button type="button" onClick={share}>Condividi</button><a href={"https://wa.me/?text=" + encodeURIComponent(title + " " + url)} target="_blank" rel="noopener noreferrer" onClick={() => recordInterest("share", catalog)} aria-label={"Condividi su WhatsApp: " + title}>WhatsApp</a>{message ? <small role="status">{message}</small> : null}</div>;
}
