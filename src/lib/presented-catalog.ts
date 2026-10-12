import "server-only";
import { supabaseAdminFetch } from "./supabase/admin";
import { productCategories, presentable, matchesSearch, inferredCategory, productBrand, sortProducts, usefulTitle, defaultCatalogSort, type StoreProduct } from "./catalog-presentation";
import { catalogLimit } from "./product-validation";
const membership: Record<string, string> = { bestseller: "in_bestseller", haul: "in_haul", "offerte-lambo": "in_offerte_lambo", outlet: "in_outlet" };
// The source catalogs update in batches; reuse each category's base rows briefly
// so changing a client-side filter does not repeat up to eleven REST reads.
const rowCache = new Map<string, { expiresAt: number; rows: Promise<StoreProduct[]> }>();
const ROW_CACHE_TTL_MS = 45_000;
const ROW_CACHE_LIMIT = 6;

async function loadRows(filters: string[], cacheable: boolean): Promise<StoreProduct[]> {
    const key = filters.join("&");
    const now = Date.now();
    if (cacheable) {
        const cached = rowCache.get(key);
        if (cached && cached.expiresAt > now) {
            rowCache.delete(key);
            rowCache.set(key, cached);
            return cached.rows;
        }
        if (cached)
            rowCache.delete(key);
    }
    const rows = (async () => {
        const all: StoreProduct[] = [];
        for (let offset = 0; offset <= 10000; offset += 1000) {
            const page = await supabaseAdminFetch<StoreProduct[]>("products?" + key + `&limit=1000&offset=${offset}`);
            all.push(...page);
            if (page.length < 1000)
                break;
        }
        return all;
    })();
    if (!cacheable)
        return rows;
    const entry = { expiresAt: Number.POSITIVE_INFINITY, rows };
    rowCache.set(key, entry);
    while (rowCache.size > ROW_CACHE_LIMIT)
        rowCache.delete(rowCache.keys().next().value!);
    try {
        const result = await rows;
        entry.expiresAt = Date.now() + ROW_CACHE_TTL_MS;
        return result;
    }
    catch (error) {
        if (rowCache.get(key)?.rows === rows)
            rowCache.delete(key);
        throw error;
    }
}

export async function getPresentedCatalog(params: URLSearchParams) {
    const catalog = params.get("category") || "tutte";
    const filters = ["active=eq.true", "select=id,asin,title,description,image_url,affiliate_url,current_price,list_price,currency,discount_percent,price_verified_at,haul_category,bestseller_rank", "order=id.asc"];
    if (membership[catalog])
        filters.push(membership[catalog] + "=eq.true");
    for (const exclude of (params.get("exclude") || "").split(","))
        if (membership[exclude] && !membership[catalog])
            filters.push(membership[exclude] + "=eq.false");
    const asins = (params.get("asins") || "").split(",").filter(asin => /^[A-Z0-9]{10}$/.test(asin)).slice(0, 100);
    if (params.has("asins") && !asins.length)
        return { products: [], total: 0, has_more: false, next_offset: 0, incomplete: 0, brands: [] };
    if (asins.length)
        filters.push("asin=in.(" + asins.join(",") + ")");
    const rows = await loadRows(filters, asins.length === 0);
    const truncated = rows.length >= 11000;
    const brands = [...new Set(rows.map(p => productBrand(p.title)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
    // This is the latest verified price, not an inferred offer expiration or a sync timestamp.
    const latestPriceVerifiedAt = rows.reduce<string | null>((latest, product) => {
        const observed = product.price_verified_at;
        return product.current_price && product.current_price > 0 && observed && Number.isFinite(Date.parse(observed)) && Date.parse(observed) <= Date.now() && (!latest || Date.parse(observed) > Date.parse(latest)) ? observed : latest;
    }, null);
    const incomplete = rows.filter(p => !presentable(p)).length;
    const query = (params.get("q") || "").slice(0, 120).trim();
    const selected = params.get("product_category") || (!membership[catalog] ? catalog : "tutte");
    const min = Number(params.get("min"));
    const max = params.get("max") ? Number(params.get("max")) : Infinity;
    const brand = params.get("brand");
    const results = rows.filter(p => (params.get("incomplete") === "1" || presentable(p))
        && (!query || matchesSearch(p, query))
        && (!selected || selected === "tutte" || inferredCategory(p.title) === selected)
        && (!brand || productBrand(p.title).toLowerCase() === brand.toLowerCase())
        && (!(min > 0) || (p.current_price != null && p.current_price >= min))
        && (!Number.isFinite(max) || (p.current_price != null && p.current_price <= max))
        && (params.get("priced") !== "1" || Boolean(p.current_price && p.current_price > 0 && p.price_verified_at)));
    const sorted = sortProducts(results, params.get("sort") || defaultCatalogSort(catalog), catalog === "bestseller");
    const limit = catalogLimit(params.get("limit"));
    const offset = Math.max(0, Math.min(10000, Math.floor(Number(params.get("offset")) || 0)));
    return { products: sorted.slice(offset, offset + limit).map(p => ({ ...p, title: usefulTitle(p.title) ? p.title : "Prodotto Amazon " + p.asin })), total: sorted.length, incomplete, brands, truncated, latest_price_verified_at: latestPriceVerifiedAt,
        category_counts: productCategories.map(([slug, label]) => ({ slug, label, count: rows.filter(p => slug === "tutte" || inferredCategory(p.title) === slug).length })),
        has_more: offset + limit < sorted.length, next_offset: Math.min(offset + limit, sorted.length) };
}
