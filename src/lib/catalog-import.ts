import "server-only";
import { supabaseAdminFetch } from "./supabase/admin";
import { parseHaulHtml, isAmazonHaulUrl, isAmazonDealsUrl, isAmazonBestsellersUrl } from "./haul-import";
import { fetchHaulWithFullScroll, fetchAmazonSearchWithFullScroll, fetchAmazonBestsellersWithFullScroll } from "./haul-browser";
import { markCatalogVerificationPending } from "./catalog-sync";
import { catalogConfig, type Catalog } from "./catalog-config";
import { MANUAL_SOURCES } from "./product-validation";
import { mergeCatalogData, validPrice, type CatalogData } from "./catalog-product";

export function validCatalogUrl(catalog: Catalog, url: string) {
  return (catalog === "haul" ? isAmazonHaulUrl : catalog === "bestseller" ? isAmazonBestsellersUrl : isAmazonDealsUrl)(url);
}
type Existing = { asin: string; title: string; description: string | null; image_url: string | null;
  current_price: number | null; list_price: number | null; discount_percent: number | null;
  price_verified_at: string | null; category_id: string | null; featured: boolean; prime: boolean | null;
  in_haul: boolean; in_outlet: boolean; in_offerte_lambo: boolean; in_bestseller: boolean; haul_category: string | null; source: string };

export async function importCatalog(catalog: Catalog, sourceUrl: string, uploadedHtml?: string) {
  const config = catalogConfig[catalog];
  let products: ReturnType<typeof parseHaulHtml> = [];
  let scanError: string | null = null;
  try {
    if (uploadedHtml) products = parseHaulHtml(uploadedHtml);
    else {
      const scan = await (catalog === "haul" ? fetchHaulWithFullScroll : catalog === "bestseller" ? fetchAmazonBestsellersWithFullScroll : fetchAmazonSearchWithFullScroll)(sourceUrl);
      const byAsin = new Map(parseHaulHtml(scan.html).map(product => [product.asin, product]));
      for (const product of scan.products) {
        const previous = byAsin.get(product.asin);
        const data = mergeCatalogData({ title: previous?.title || null, description: previous?.description || null, imageUrl: previous?.imageUrl || null,
          currentPrice: previous?.currentPrice ?? null, listPrice: previous?.listPrice ?? null, discountPercent: previous?.discountPercent ?? null }, product);
        byAsin.set(product.asin, { ...previous, ...product, ...data, title: data.title || "Prodotto Amazon " + product.asin,
          haulCategory: previous?.haulCategory || product.haulCategory });
      }
      products = [...byAsin.values()];
    }
  } catch (error) {
    scanError = error instanceof Error ? error.message : "Scansione Amazon non disponibile";
    console.warn("catalog-import-scan", catalog, scanError);
  }
  const existingByAsin = new Map<string, Existing>();
  for (let offset = 0; offset < products.length; offset += 40) {
    const ids = products.slice(offset, offset + 40).map(product => product.asin);
    const existing = await supabaseAdminFetch<Existing[]>(`products?asin=in.(${ids.join(",")})&select=asin,title,description,image_url,current_price,list_price,discount_percent,price_verified_at,category_id,featured,prime,in_haul,in_outlet,in_offerte_lambo,in_bestseller,haul_category,source`);
    existing.forEach(product => existingByAsin.set(product.asin, product));
  }
  const now = new Date().toISOString();
  const rows = products.map((product, index) => {
    const existing = existingByAsin.get(product.asin);
    const previous: CatalogData = { title: existing?.title || null, description: existing?.description || null, imageUrl: existing?.image_url || null,
      currentPrice: existing?.current_price ?? null, listPrice: existing?.list_price ?? null, discountPercent: existing?.discount_percent ?? null };
    const data = mergeCatalogData(previous, product);
    const url = new URL("https://www.amazon.it/dp/" + product.asin);
    url.searchParams.set("tag", process.env.AMAZON_PARTNER_TAG || "eiapromo-21");
    return { asin: product.asin, title: data.title || product.title, description: data.description, image_url: data.imageUrl,
      current_price: data.currentPrice, list_price: data.listPrice, discount_percent: data.discountPercent,
      currency: "EUR", price_verified_at: validPrice(product.currentPrice) ? now : existing?.price_verified_at ?? null,
      category_id: existing?.category_id ?? null, featured: existing?.featured ?? false, prime: existing?.prime ?? null,
      in_haul: existing?.in_haul ?? false, in_outlet: existing?.in_outlet ?? false,
      in_offerte_lambo: existing?.in_offerte_lambo ?? false, in_bestseller: existing?.in_bestseller ?? false,
      [config.membership]: true, haul_category: product.haulCategory || existing?.haul_category || null,
      ...(catalog === "bestseller" ? { bestseller_rank: product.bestsellerRank ?? index + 1 } : {}),
      amazon_url: "https://www.amazon.it/dp/" + product.asin, affiliate_url: url.toString(),
      source: existing && MANUAL_SOURCES.some(source => source === existing.source) ? existing.source : "amazon-" + catalog + "-html", active: true, updated_at: now };
  });
  for (let offset = 0; offset < rows.length; offset += 50) {
    await supabaseAdminFetch("products?on_conflict=asin", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(offset, offset + 50)) });
  }
  // Persist the discovery outcome; verification continues in bounded, resumable batches.
  await markCatalogVerificationPending(catalog);
  const status = rows.length ? "success" : "price-only";
  await supabaseAdminFetch("site_settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([
    { key: config.sourceKey, value: sourceUrl },
    { key: catalog + "_last_import", value: { at: now, status, count: rows.length, error: scanError } },
  ]) });
  return { status, count: rows.length, scanError };
}
