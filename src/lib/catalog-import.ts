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

async function fetchListingHtml(sourceUrl: string) {
  const response = await fetch(sourceUrl, { cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { accept: "text/html", "accept-language": "it-IT,it;q=0.9",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36" } });
  if (!response.ok) throw new Error("Amazon HTML HTTP " + response.status);
  if (!/^https:\/\/(?:www\.)?amazon\.it\//i.test(response.url)) throw new Error("Pagina Amazon reindirizzata fuori da Amazon.it");
  if (!response.headers.get("content-type")?.includes("text/html")) throw new Error("La fonte non restituisce HTML");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Risposta Amazon senza contenuto");
  const decoder = new TextDecoder();
  let bytes = 0, html = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8 * 1024 * 1024) throw new Error("Pagina Amazon troppo grande");
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  if (/\/errors\/validateCaptcha|<title>\s*Robot Check/i.test(html)) throw new Error("Amazon richiede una verifica umana");
  return html;
}

async function saveCatalogProducts(catalog: Catalog, products: ReturnType<typeof parseHaulHtml>, now: string, pending = false) {
  if (!products.length) return 0;
  const config = catalogConfig[catalog];
  const existingByAsin = new Map<string, Existing>();
  for (let offset = 0; offset < products.length; offset += 40) {
    const ids = products.slice(offset, offset + 40).map(product => product.asin);
    const existing = await supabaseAdminFetch<Existing[]>(`products?asin=in.(${ids.join(",")})&select=asin,title,description,image_url,current_price,list_price,discount_percent,price_verified_at,category_id,featured,prime,in_haul,in_outlet,in_offerte_lambo,in_bestseller,haul_category,source`);
    existing.forEach(product => existingByAsin.set(product.asin, product));
  }
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
      ...(pending ? { [config.prefix + "_verification_status"]: "pending", [config.prefix + "_verification_attempts"]: 0 } : {}),
      ...(catalog === "bestseller" ? { bestseller_rank: product.bestsellerRank ?? index + 1 } : {}),
      amazon_url: "https://www.amazon.it/dp/" + product.asin, affiliate_url: url.toString(),
      source: existing && MANUAL_SOURCES.some(source => source === existing.source) ? existing.source : "amazon-" + catalog + "-html", active: true, updated_at: now };
  });
  for (let offset = 0; offset < rows.length; offset += 50) {
    await supabaseAdminFetch("products?on_conflict=asin", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(offset, offset + 50)) });
  }
  return rows.length;
}

export async function importCatalog(catalog: Catalog, sourceUrl: string, uploadedHtml?: string) {
  const config = catalogConfig[catalog];
  let products: ReturnType<typeof parseHaulHtml> = [];
  let scanError: string | null = null;
  const savedAsins = new Set<string>();
  const checkpointProducts = new Map<string, ReturnType<typeof parseHaulHtml>[number]>();
  try {
    if (uploadedHtml)
      products = parseHaulHtml(uploadedHtml);
    else {
      const scan = await (catalog === "haul" ? fetchHaulWithFullScroll : catalog === "bestseller" ? fetchAmazonBestsellersWithFullScroll : fetchAmazonSearchWithFullScroll)(sourceUrl, async checkpoint => {
        const discovered = new Set(checkpoint.asins);
        const fresh = parseHaulHtml(checkpoint.html).filter(product => discovered.has(product.asin) && !savedAsins.has(product.asin));
        await saveCatalogProducts(catalog, fresh, new Date().toISOString(), true);
        fresh.forEach(product => { savedAsins.add(product.asin); checkpointProducts.set(product.asin, product); });
        if (fresh.length) await supabaseAdminFetch("site_settings?on_conflict=key", {
          method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify([{ key: catalog + "_last_import", value: {
            at: new Date().toISOString(), status: "partial", count: savedAsins.size,
            error: "Scansione in corso o interrotta prima del completamento" } }]),
        });
      });
      scanError = scan.warning || null;
      // The page HTML also contains carousels and recommendation scripts. Only
      // save products actually discovered as cards or links in this catalogue.
      const discovered = new Set(scan.asins);
      const byAsin = new Map(parseHaulHtml(scan.html).filter(product => discovered.has(product.asin)).map(product => [product.asin, product]));
      for (const product of scan.products) {
        if (!discovered.has(product.asin)) continue;
        const previous = byAsin.get(product.asin);
        const data = mergeCatalogData({ title: previous?.title || null, description: previous?.description || null, imageUrl: previous?.imageUrl || null,
          currentPrice: previous?.currentPrice ?? null, listPrice: previous?.listPrice ?? null, discountPercent: previous?.discountPercent ?? null }, product);
        byAsin.set(product.asin, { ...previous, ...product, ...data, title: data.title || "Prodotto Amazon " + product.asin,
          haulCategory: previous?.haulCategory || product.haulCategory });
      }
      products = [...byAsin.values()];
    }
  }
  catch (error) {
    scanError = error instanceof Error ? error.message : "Scansione Amazon non disponibile";
    console.warn("catalog-import-scan", catalog, scanError);
    if (!uploadedHtml) {
      try {
        const html = await fetchListingHtml(sourceUrl);
        products = parseHaulHtml(html);
        if (!products.length) scanError += " · HTML senza schede prodotto";
      } catch (fallbackError) {
        scanError += " · " + (fallbackError instanceof Error ? fallbackError.message : "Lettura HTML non disponibile");
      }
    }
  }
  // The final browser document can contain fewer cards than earlier scroll
  // checkpoints (virtualized grids replace old cards). Keep every discovered
  // product in the final count and merge any richer final fields with it.
  if (checkpointProducts.size) {
    const combined = new Map(checkpointProducts);
    for (const product of products) {
      const previous = combined.get(product.asin);
      if (!previous) { combined.set(product.asin, product); continue; }
      const data = mergeCatalogData({ title: previous.title, description: previous.description || null,
        imageUrl: previous.imageUrl, currentPrice: previous.currentPrice, listPrice: previous.listPrice,
        discountPercent: previous.discountPercent }, product);
      combined.set(product.asin, { ...previous, ...product, ...data,
        title: data.title || previous.title, haulCategory: product.haulCategory || previous.haulCategory });
    }
    products = [...combined.values()];
  }
  const now = new Date().toISOString();
  const count = await saveCatalogProducts(catalog, products, now);
  // Persist the discovery outcome; verification continues in bounded, resumable batches.
  await markCatalogVerificationPending(catalog);
  const status = count ? scanError ? "partial" : "success" : scanError ? "source-unavailable" : "price-only";
  await supabaseAdminFetch("site_settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([
      { key: config.sourceKey, value: sourceUrl },
      { key: catalog + "_last_import", value: { at: now, status, count, error: scanError } },
      ...(count && !scanError ? [{ key: catalog + "_last_successful_import", value: { at: now, count } }] : []),
    ]) });
  return { status, count, scanError };
}
