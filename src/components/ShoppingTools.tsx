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
    const saved = favorites.asins.includes(asin);
    const compared = compare.asins.includes(asin);
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
    return <div className="productTools">
      <button type="button" className="productToolIcon" title={saved ? "Rimuovi dai preferiti" : "Salva nei preferiti"} aria-label={(saved ? "Rimuovi dai preferiti: " : "Salva nei preferiti: ") + title} aria-pressed={saved} onClick={() => { if (product)
        rememberProduct(product); setMessage(favorites.toggle(asin)); recordInterest("favorite", catalog); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
      </button>
      <button type="button" className="productToolIcon" title={compared ? "Rimuovi dal confronto" : "Aggiungi al confronto"} aria-label={(compared ? "Rimuovi dal confronto: " : "Aggiungi al confronto: ") + title} aria-pressed={compared} onClick={() => { if (product)
        rememberProduct(product); setMessage(compare.toggle(asin)); recordInterest("compare", catalog); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 4H4v4M4 4l6 6m6 10h4v-4m0 4-6-6M14 4h6v6m0-6-7 7M4 14v6h6m-6 0 7-7"/></svg>
      </button>
      <button type="button" className="productToolIcon" title="Condividi" aria-label={"Condividi: " + title} onClick={share}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 16V3m0 0L7 8m5-5 5 5M5 13v7h14v-7"/></svg>
      </button>
      <a className="productToolIcon whatsappTool" href={"https://wa.me/?text=" + encodeURIComponent(title + " " + url)} target="_blank" rel="noopener noreferrer" onClick={() => recordInterest("share", catalog)} aria-label={"Condividi su WhatsApp: " + title} title="Condividi su WhatsApp">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.6a8.5 8.5 0 1 1 16.3-3.9Z"/><path d="M8.5 8.2c.4-.5.8-.4 1.1 0l.9 1.5c.2.3.1.6-.2.9l-.5.5c.6 1.2 1.5 2.1 2.7 2.7l.5-.6c.2-.3.6-.4.9-.2l1.5.9c.4.2.5.7.2 1.1-.5.7-1.3 1-2.1.8-2.5-.6-5.4-3.5-6-6-.2-.7.2-1.3 1-1.6Z"/></svg>
      </a>
      {message ? <small role="status">{message}</small> : null}
    </div>;
}
