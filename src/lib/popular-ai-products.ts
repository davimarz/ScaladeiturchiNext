import "server-only";
import { supabaseAdminFetch } from "./supabase/admin";
import { enrichMissingProductData, type ShoppingProduct } from "./ai-shopping";

type AIHistoryRow = {
  query: string;
  status: string;
  product_asins: string[];
  product_titles: string[];
};

const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG || "eiapromo-21";

function affiliateSearchUrl(asin: string) {
  const url = new URL("https://www.amazon.it/s");
  url.searchParams.set("k", asin);
  url.searchParams.set("tag", PARTNER_TAG);
  return url.toString();
}

export async function getPopularAIProducts(limit = 4): Promise<ShoppingProduct[]> {
  const history = await supabaseAdminFetch<AIHistoryRow[]>(
    "ai_search_history?select=query,status,product_asins,product_titles&status=eq.success&order=created_at.desc&limit=500",
  ).catch(() => []);

  const ranking = new Map<string, { asin: string; title: string; searches: number }>();

  for (const item of history) {
    const seenInQuery = new Set<string>();
    const asins = Array.isArray(item.product_asins) ? item.product_asins : [];
    const titles = Array.isArray(item.product_titles) ? item.product_titles : [];

    for (let index = 0; index < asins.length; index++) {
      const asin = String(asins[index] ?? "").trim().toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin) || seenInQuery.has(asin)) continue;
      seenInQuery.add(asin);

      const title = String(titles[index] ?? "").trim() || asin;
      const current = ranking.get(asin);
      if (current) {
        current.searches += 1;
        if (current.title === current.asin && title !== asin) current.title = title;
      } else {
        ranking.set(asin, { asin, title, searches: 1 });
      }
    }
  }

  const top = [...ranking.values()]
    .sort((a, b) => b.searches - a.searches || a.title.localeCompare(b.title, "it"))
    .slice(0, Math.max(1, limit));

  if (!top.length) return [];

  const products: ShoppingProduct[] = top.map((item) => ({
    asin: item.asin,
    title: item.title,
    imageUrl: null,
    currentPrice: null,
    listPrice: null,
    discountPercent: null,
    currency: "EUR",
    affiliateUrl: affiliateSearchUrl(item.asin),
    source: "catalogo",
    features: [item.searches + (item.searches === 1 ? " ricerca cliente" : " ricerche clienti")],
  }));

  return enrichMissingProductData(products);
}
