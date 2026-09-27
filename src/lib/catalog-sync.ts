import "server-only";
import { searchAmazonItems } from "./amazon/client";
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

export async function syncAmazonCatalog() {
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

    await supabaseAdminFetch(
      "products?on_conflict=asin",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      },
    );
    updated += rows.length;
  }

  return { productsSeen: seen, productsUpdated: updated };
}
