import "server-only";
import { getAmazonItems, searchAmazonItems } from "./amazon/client";
import { fetchAmazonProductOffer } from "./amazon-page-offer";
import { supabaseAdminFetch } from "./supabase/admin";

type OfferListing = {
  price?: {
    money?: { amount?: number; currency?: string };
    savingBasis?: { money?: { amount?: number } };
    savings?: { percentage?: number };
  };
};

type AmazonCatalogItem = {
  asin: string;
  detailPageURL?: string;
  images?: { primary?: { medium?: { url?: string } } };
  itemInfo?: { title?: { displayValue?: string } };
  offersV2?: { listings?: OfferListing[] };
};

const feeds = [
  { slug: "tecnologia", name: "Tecnologia", query: "accessori tecnologia" },
  { slug: "casa", name: "Casa", query: "casa cucina offerte" },
  { slug: "bellezza", name: "Bellezza", query: "bellezza cura persona" },
  { slug: "tempo-libero", name: "Tempo libero", query: "sport tempo libero" },
] as const;

function mapProduct(item: AmazonCatalogItem, categoryId: string) {
  if (!item.detailPageURL) return null;

  const listing = item.offersV2?.listings?.[0];
  const price = listing?.price;
  const now = new Date().toISOString();

  return {
    asin: item.asin,
    title: item.itemInfo?.title?.displayValue ?? item.asin,
    category_id: categoryId,
    image_url: item.images?.primary?.medium?.url ?? null,
    amazon_url: item.detailPageURL,
    affiliate_url: item.detailPageURL,
    current_price: price?.money?.amount ?? null,
    list_price: price?.savingBasis?.money?.amount ?? null,
    currency: price?.money?.currency ?? "EUR",
    discount_percent: price?.savings?.percentage ?? null,
    prime: null,
    source: "amazon-creators-api",
    price_verified_at: price?.money?.amount ? now : null,
    active: true,
    updated_at: now,
  };
}

function isCreatorsEligibilityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /AssociateNotEligible|eligibility requirements|Amazon Creators API failed:\s*403/i.test(message);
}

async function syncExistingFromAmazonPages(filter = "") {
  const suffix = filter ? "&" + filter : "";
  const existing = await supabaseAdminFetch<Array<{ asin: string }>>(
    "products?active=eq.true" + suffix + "&select=asin&order=updated_at.asc&limit=500",
  );
  let updated = 0;

  for (let offset = 0; offset < existing.length; offset += 12) {
    const batch = existing.slice(offset, offset + 12);
    const results = await Promise.allSettled(
      batch.map(async ({ asin }) => {
        const offer = await fetchAmazonProductOffer(asin);
        if (!offer) return false;

        const now = new Date().toISOString();
        const payload: Record<string, unknown> = {
          current_price: offer.currentPrice,
          currency: offer.currency,
          price_verified_at: now,
          updated_at: now,
        };

        payload.list_price = offer.listPrice;
        payload.discount_percent = offer.discountPercent;

        await supabaseAdminFetch(`products?asin=eq.${encodeURIComponent(asin)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(payload),
        });
        return true;
      }),
    );
    updated += results.filter((result) => result.status === "fulfilled" && result.value).length;
  }

  return { productsSeen: existing.length, productsUpdated: updated };
}

async function syncViaCreatorsApi() {
  const categories = await supabaseAdminFetch<Array<{ id: string; slug: string }>>(
    "categories?on_conflict=slug",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(feeds.map((feed, index) => ({
        slug: feed.slug,
        name: feed.name,
        sort_order: index + 1,
        active: true,
      }))),
    },
  );

  const categoryBySlug = new Map(categories.map((category) => [category.slug, category.id]));
  let seen = 0;
  let updated = 0;

  for (const feed of feeds) {
    const categoryId = categoryBySlug.get(feed.slug);
    if (!categoryId) continue;

    const result = await searchAmazonItems(feed.query, 10);
    const items = result.items as AmazonCatalogItem[];
    seen += items.length;

    const rows = items
      .map((item) => mapProduct(item, categoryId))
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (!rows.length) continue;

    await supabaseAdminFetch("products?on_conflict=asin", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
    updated += rows.length;
  }

  const existing = await supabaseAdminFetch<Array<{ asin: string; category_id: string | null }>>(
    "products?active=eq.true&select=asin,category_id&order=updated_at.asc&limit=500",
  );
  const categoryByAsin = new Map(existing.map((product) => [product.asin, product.category_id]));

  for (let offset = 0; offset < existing.length; offset += 10) {
    const ids = existing.slice(offset, offset + 10).map((product) => product.asin);
    const result = await getAmazonItems(ids);
    const rows = (result.items as AmazonCatalogItem[])
      .map((item) => mapProduct(item, categoryByAsin.get(item.asin) ?? ""))
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .map((row) => ({ ...row, category_id: row.category_id || null }));
    seen += result.items.length;
    if (!rows.length) continue;

    await supabaseAdminFetch("products?on_conflict=asin", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
    updated += rows.length;
  }

  return { productsSeen: seen, productsUpdated: updated };
}

export async function syncAmazonCatalog() {
  try {
    return await syncViaCreatorsApi();
  } catch (error) {
    if (!isCreatorsEligibilityError(error)) throw error;
    console.warn("amazon-creators-api-fallback", error instanceof Error ? error.message : String(error));
    return syncExistingFromAmazonPages();
  }
}

export async function syncCatalogPricesByMembership(membership: "haul" | "offerte-lambo") {
  const filter = membership === "haul" ? "in_haul=eq.true" : "in_offerte_lambo=eq.true";
  return syncExistingFromAmazonPages(filter);
}
