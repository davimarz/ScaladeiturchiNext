import "server-only";
import { fetchAmazonProductSnapshot } from "./amazon-page-offer";
import { fetchAmazonProductSnapshotsWithBrowser } from "./haul-browser";
import { supabaseAdminFetch } from "./supabase/admin";
import { catalogConfig, type Catalog } from "./catalog-config";
import { mergeCatalogData, missingCatalogData, validPrice, type CatalogData } from "./catalog-product";

type ProductRow = {
  asin: string; title: string; description: string | null; image_url: string | null;
  current_price: number | null; list_price: number | null; discount_percent: number | null;
  [key: string]: string | number | null;
};
function rowData(product: ProductRow): CatalogData {
  return { title: product.title, description: product.description, imageUrl: product.image_url,
    currentPrice: product.current_price, listPrice: product.list_price, discountPercent: product.discount_percent };
}
export async function markCatalogVerificationPending(catalog: Catalog) {
  const { membership, prefix } = catalogConfig[catalog];
  await supabaseAdminFetch("products?active=eq.true&" + membership + "=eq.true", {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ [prefix + "_verification_status"]: "pending", [prefix + "_verification_attempts"]: 0, [prefix + "_last_verification_error"]: null }),
  });
}
export async function catalogVerificationSummary(catalog: Catalog) {
  const { membership, prefix } = catalogConfig[catalog];
  const products = await supabaseAdminFetch<Array<{ status: string }>>(
    `products?active=eq.true&${membership}=eq.true&select=status:${prefix}_verification_status&limit=1000`,
  );
  return { total: products.length, remaining: products.filter(p => p.status === "pending").length,
    complete: products.filter(p => p.status === "verified").length, incomplete: products.filter(p => p.status === "failed").length };
}
export async function verifyCatalogProductsBatch(catalog: Catalog, limit = 6) {
  const { membership, prefix } = catalogConfig[catalog];
  const status = prefix + "_verification_status";
  const attemptsColumn = prefix + "_verification_attempts";
  const products = await supabaseAdminFetch<ProductRow[]>(
    `products?active=eq.true&${membership}=eq.true&${status}=eq.pending&select=asin,title,description,image_url,current_price,list_price,discount_percent,${attemptsColumn},${prefix}_verified_at&order=${attemptsColumn}.asc,updated_at.asc&limit=${Math.max(1, Math.min(limit, 6))}`,
  );
  if (!products.length) return { checked: 0, verified: 0, pending: 0, failed: 0, imagesRecovered: 0, imagesMissing: 0 };
  const snapshots = new Map<string, Partial<CatalogData>>();
  // Cheap reader first; one Chromium batch only for observations still incomplete.
  await Promise.allSettled(products.map(async product => {
    const direct = await fetchAmazonProductSnapshot(product.asin);
    snapshots.set(product.asin, { title: direct.title, description: direct.description, imageUrl: direct.imageUrl,
      currentPrice: direct.offer?.currentPrice ?? null, listPrice: direct.offer?.listPrice ?? null, discountPercent: direct.offer?.discountPercent ?? null });
  }));
  const browserTargets = products.filter(p => missingCatalogData(mergeCatalogData(rowData(p), snapshots.get(p.asin) || {})).length > 0 || !validPrice(snapshots.get(p.asin)?.currentPrice));
  if (browserTargets.length) {
    try {
      const browser = await fetchAmazonProductSnapshotsWithBrowser(browserTargets.map(p => p.asin));
      for (const [asin, snapshot] of browser) {
        const direct = snapshots.get(asin);
        snapshots.set(asin, mergeCatalogData({ title: direct?.title ?? null, description: direct?.description ?? null,
          imageUrl: direct?.imageUrl ?? null, currentPrice: direct?.currentPrice ?? null,
          listPrice: direct?.listPrice ?? null, discountPercent: direct?.discountPercent ?? null }, snapshot));
      }
    } catch (error) { console.warn("catalog-browser-batch", error instanceof Error ? error.message : String(error)); }
  }
  let verified = 0, pending = 0, failed = 0, imagesRecovered = 0, imagesMissing = 0;
  // Persist each product before continuing; a later timeout cannot discard earlier work.
  for (const product of products) {
    const observation = snapshots.get(product.asin) || {};
    const data = mergeCatalogData(rowData(product), observation);
    const missing = missingCatalogData(data);
    const freshPrice = validPrice(observation.currentPrice);
    const complete = missing.length === 0 && freshPrice;
    const attempts = Number(product[attemptsColumn] || 0) + 1;
    const nextStatus = complete ? "verified" : attempts >= 3 ? "failed" : "pending";
    const now = new Date().toISOString();
    await supabaseAdminFetch(`products?asin=eq.${encodeURIComponent(product.asin)}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ title: data.title, description: data.description, image_url: data.imageUrl,
        current_price: data.currentPrice, list_price: data.listPrice, discount_percent: data.discountPercent,
        price_verified_at: freshPrice ? now : undefined, currency: "EUR", updated_at: now,
        [status]: nextStatus, [attemptsColumn]: attempts,
        [prefix + "_verified_at"]: complete ? now : undefined,
        [prefix + "_last_verification_error"]: complete ? null : "Dati mancanti o non riletti: " + [...missing, ...(!freshPrice ? ["prezzo aggiornato"] : [])].join(", "),
      }),
    });
    if (complete) verified++; else if (nextStatus === "failed") failed++; else pending++;
    if (data.imageUrl && data.imageUrl !== product.image_url) imagesRecovered++;
    if (missing.includes("immagine")) imagesMissing++;
  }
  return { checked: products.length, verified, pending, failed, imagesRecovered, imagesMissing };
}
