"use client";
import type { StoreProduct } from "./catalog-presentation";
import { useMemo, useSyncExternalStore } from "react";
const listeners = new Set<() => void>();
const empty = "[]";
function snapshot(key: string) { try {
    return localStorage.getItem(key) || empty;
}
catch {
    return empty;
} }
function subscribe(listener: () => void) { listeners.add(listener); window.addEventListener("storage", listener); return () => { listeners.delete(listener); window.removeEventListener("storage", listener); }; }
export function readSavedAsins(raw: string) { try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && /^[A-Z0-9]{10}$/.test(id)))].slice(0, 100) : [];
}
catch {
    return [];
} }
export function useShoppingList(kind: "favorites" | "compare") {
    const key = "scaladeiturchi-" + kind;
    const raw = useSyncExternalStore(subscribe, () => snapshot(key), () => empty);
    const asins = useMemo(() => readSavedAsins(raw), [raw]);
    function toggle(asin: string) {
        if (!/^[A-Z0-9]{10}$/.test(asin))
            return "Prodotto non valido.";
        const current = readSavedAsins(snapshot(key));
        const limit = kind === "compare" ? 3 : 100;
        if (!current.includes(asin) && current.length >= limit)
            return kind === "compare" ? "Puoi confrontare al massimo 3 prodotti. Rimuovine uno dal confronto." : "Hai raggiunto 100 preferiti. Rimuovine uno per aggiungerne altri.";
        try {
            localStorage.setItem(key, JSON.stringify(current.includes(asin) ? current.filter(id => id !== asin) : [...current, asin]));
            listeners.forEach(listener => listener());
            return "";
        }
        catch {
            return "Il browser non permette il salvataggio sul dispositivo.";
        }
    }
    return { asins, toggle };
}
const snapshotsKey = "scaladeiturchi-product-snapshots";
function safeAmazonUrl(value: unknown) {
    if (typeof value !== "string")
        return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && ["amazon.it", "www.amazon.it"].includes(url.hostname) && !url.username && !url.password;
    }
    catch {
        return false;
    }
}
export function readProductSnapshots(raw: string): StoreProduct[] {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed.slice(0, 100).filter((value): value is StoreProduct => Boolean(value && typeof value === "object" && /^[A-Z0-9]{10}$/.test(value.asin) && typeof value.title === "string" && safeAmazonUrl(value.affiliate_url))).map(p => ({
            id: typeof p.id === "string" && /^[a-f0-9-]{36}$/i.test(p.id) ? p.id : "", asin: p.asin, title: p.title.slice(0, 1000), description: typeof p.description === "string" ? p.description.slice(0, 1400) : null,
            image_url: typeof p.image_url === "string" && /^https:\/\//.test(p.image_url) ? p.image_url : null, affiliate_url: p.affiliate_url,
            current_price: typeof p.current_price === "number" && Number.isFinite(p.current_price) && p.current_price > 0 && p.current_price < 10000 ? p.current_price : null,
            list_price: typeof p.list_price === "number" && Number.isFinite(p.list_price) && p.list_price > 0 && p.list_price < 10000 ? p.list_price : null,
            discount_percent: typeof p.discount_percent === "number" && p.discount_percent > 0 && p.discount_percent < 100 ? p.discount_percent : null,
            currency: typeof p.currency === "string" && /^[A-Z]{3}$/.test(p.currency) ? p.currency : "EUR", price_verified_at: typeof p.price_verified_at === "string" ? p.price_verified_at : null,
        }));
    }
    catch {
        return [];
    }
}
export function rememberProduct(product: StoreProduct) {
    try {
        const current = readProductSnapshots(snapshot(snapshotsKey));
        const next = [product, ...current.filter(p => p.asin !== product.asin)].slice(0, 100);
        localStorage.setItem(snapshotsKey, JSON.stringify(next));
        listeners.forEach(listener => listener());
    }
    catch { /* The list action reports storage failures to the visitor. */ }
}
export function useShoppingSnapshots() {
    const raw = useSyncExternalStore(subscribe, () => snapshot(snapshotsKey), () => empty);
    return useMemo(() => readProductSnapshots(raw), [raw]);
}
