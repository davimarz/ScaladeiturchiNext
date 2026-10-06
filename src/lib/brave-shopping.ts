import "server-only";
import { isRelevantProduct, queryTokens } from "./ai-relevance";

export type ExternalShoppingProduct = {
  asin: string;
  title: string;
  imageUrl: string | null;
  currentPrice: number | null;
  listPrice: number | null;
  discountPercent: number | null;
  currency: string;
  affiliateUrl: string;
  source: "brave-search";
  features?: string[];
};

const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG || "eiapromo-21";

function affiliateUrl(asin: string) {
  const url = new URL("https://www.amazon.it/dp/" + asin);
  url.searchParams.set("tag", PARTNER_TAG);
  return url.toString();
}

export async function searchAmazonViaBrave(query: string, limit = 8): Promise<ExternalShoppingProduct[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error("Brave Search API key unavailable");

  const keywords = queryTokens(query).join(" ") || query;
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", "site:amazon.it/dp/ " + keywords);
  url.searchParams.set("count", "20");
  url.searchParams.set("country", "IT");
  url.searchParams.set("search_lang", "it");
  url.searchParams.set("safesearch", "moderate");

  const response = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  const data = await response.json().catch(() => ({})) as {
    web?: {
      results?: Array<{
        title?: string;
        url?: string;
        description?: string;
        thumbnail?: { src?: string };
      }>;
    };
  };

  if (!response.ok) {
    const error = new Error("Brave Search HTTP " + response.status);
    (error as Error & { statusCode?: number }).statusCode = response.status;
    throw error;
  }

  const products: ExternalShoppingProduct[] = [];
  const seen = new Set<string>();

  for (const result of data.web?.results ?? []) {
    const rawUrl = result.url || "";
    const match = rawUrl.match(/amazon\.it\/(?:[^/?#]+\/)?dp\/([A-Z0-9]{10})(?:[/?#]|$)/i);
    if (!match) continue;

    const asin = match[1].toUpperCase();
    if (seen.has(asin)) continue;

    const title = (result.title || "")
      .replace(/\s*[-|:]\s*Amazon(?:\.it)?\s*$/i, "")
      .trim();

    if (!title || !isRelevantProduct(title, query)) continue;

    seen.add(asin);
    products.push({
      asin,
      title,
      imageUrl: result.thumbnail?.src || null,
      currentPrice: null,
      listPrice: null,
      discountPercent: null,
      currency: "EUR",
      affiliateUrl: affiliateUrl(asin),
      source: "brave-search",
      features: result.description ? [result.description.slice(0, 220)] : [],
    });

    if (products.length >= limit) break;
  }

  return products;
}
