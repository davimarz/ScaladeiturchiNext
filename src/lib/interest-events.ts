export const interestEvents = ["catalog-view", "search", "filter", "sort", "favorite", "compare", "share"] as const;
export const interestCatalogs = ["tutte", "bestseller", "offerte-lambo", "haul", "ai", "preferiti"] as const;
export function validInterest(event: unknown, catalog: unknown) { return typeof event === "string" && interestEvents.includes(event as typeof interestEvents[number]) && typeof catalog === "string" && interestCatalogs.includes(catalog as typeof interestCatalogs[number]); }
const lastEvents = new Map<string, number>();
export function recordInterest(event: typeof interestEvents[number], catalog: string) {
    if (typeof window === "undefined")
        return;
    const safeCatalog = interestCatalogs.includes(catalog as typeof interestCatalogs[number]) ? catalog : "tutte";
    const key = event + ":" + safeCatalog, now = Date.now();
    if (now - (lastEvents.get(key) || 0) < 3000)
        return;
    lastEvents.set(key, now);
    void fetch("/api/interest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, catalog: safeCatalog }), keepalive: true }).catch(() => undefined);
}
