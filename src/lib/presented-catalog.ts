import "server-only";
import { supabaseAdminFetch } from "./supabase/admin";
import { productCategories, presentable, matchesSearch, inferredCategory, productBrand, sortProducts, usefulTitle, type StoreProduct } from "./catalog-presentation";
import { catalogLimit } from "./product-validation";
const membership: Record<string, string> = { bestseller: "in_bestseller", haul: "in_haul", "offerte-lambo": "in_offerte_lambo", outlet: "in_outlet" };
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
    const rows: StoreProduct[] = [];
    let truncated = false;
    for (let offset = 0; offset <= 10000; offset += 1000) {
        const page = await supabaseAdminFetch<StoreProduct[]>("products?" + filters.join("&") + `&limit=1000&offset=${offset}`);
        rows.push(...page);
        if (page.length < 1000)
            break;
        if (offset === 10000)
            truncated = true;
    }
    const brands = [...new Set(rows.map(p => productBrand(p.title)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
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
    const sorted = sortProducts(results, params.get("sort") || "default", catalog === "bestseller");
    const limit = catalogLimit(params.get("limit"));
    const offset = Math.max(0, Math.min(10000, Math.floor(Number(params.get("offset")) || 0)));
    return { products: sorted.slice(offset, offset + limit).map(p => ({ ...p, title: usefulTitle(p.title) ? p.title : "Prodotto Amazon " + p.asin })), total: sorted.length, incomplete, brands, truncated,
        category_counts: productCategories.map(([slug, label]) => ({ slug, label, count: rows.filter(p => slug === "tutte" || inferredCategory(p.title) === slug).length })),
        has_more: offset + limit < sorted.length, next_offset: Math.min(offset + limit, sorted.length) };
}
