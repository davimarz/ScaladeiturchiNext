import "server-only";
import { isRelevantProduct, queryTokens } from "./ai-relevance";
import { fetchAmazonProductSnapshot } from "./amazon-page-offer";

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

type BraveResult = {
  title?: string;
  url?: string;
  description?: string;
  extra_snippets?: string[];
  thumbnail?: { src?: string };
};

const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG || "eiapromo-21";

function affiliateUrl(asin: string) {
  const url = new URL("https://www.amazon.it/dp/" + asin);
  url.searchParams.set("tag", PARTNER_TAG);
  return url.toString();
}

function cleanText(value: string) {
  return value
    .replace(/<\/?(?:strong|b|em|i|mark|span)[^>]*>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function braveWebSearch(apiKey: string, searchQuery: string) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("count", "20");
  url.searchParams.set("country", "IT");
  url.searchParams.set("search_lang", "it");
  url.searchParams.set("ui_lang", "it-IT");
  url.searchParams.set("safesearch", "moderate");
  url.searchParams.set("extra_snippets", "true");
  url.searchParams.set("operators", "true");

  const response = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  const data = await response.json().catch(() => ({})) as {
    web?: { results?: BraveResult[] };
  };

  if (!response.ok) {
    const error = new Error("Brave Search HTTP " + response.status);
    (error as Error & { statusCode?: number }).statusCode = response.status;
    throw error;
  }

  return data.web?.results ?? [];
}

export async function searchAmazonViaBrave(query: string, limit = 8): Promise<ExternalShoppingProduct[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error("Brave Search API key unavailable");

  const keywords = queryTokens(query).join(" ") || query;
  const products: ExternalShoppingProduct[] = [];
  const seen = new Set<string>();

  const collect = (results: BraveResult[]) => {
    for (const result of results) {
      const rawUrl = result.url || "";
      const match = rawUrl.match(/amazon\.it\/(?:[^?#]*\/)?(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i);
      if (!match) continue;

      const asin = match[1].toUpperCase();
      if (seen.has(asin)) continue;

      const title = cleanText(result.title || "")
        .replace(/\s*[-|:]\s*Amazon(?:\.it)?(?:\s*:\s*Moda)?\s*$/i, "")
        .trim();

      if (!title || !isRelevantProduct(title, query)) continue;

      const snippets = [result.description, ...(result.extra_snippets ?? [])]
        .filter((value): value is string => Boolean(value))
        .map(cleanText)
        .filter((value) => value.length >= 20 && value.toLowerCase() !== title.toLowerCase());

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
        features: snippets.slice(0, 2).map((value) => value.slice(0, 220)),
      });

      if (products.length >= limit) break;
    }
  };

  collect(await braveWebSearch(apiKey, "site:amazon.it " + keywords));

  if (products.length < 4) {
    collect(await braveWebSearch(apiKey, keywords + " Amazon.it"));
  }

  if (!products.length) return products;

  const enriched = await Promise.all(products.slice(0, limit).map(async (product) => {
    try {
      const snapshot = await fetchAmazonProductSnapshot(product.asin);
      const offer = snapshot.offer;
      return {
        ...product,
        title: snapshot.title && isRelevantProduct(snapshot.title, query) ? snapshot.title : product.title,
        imageUrl: snapshot.imageUrl || product.imageUrl,
        currentPrice: offer?.currentPrice ?? product.currentPrice,
        listPrice: offer?.listPrice ?? product.listPrice,
        discountPercent: offer?.discountPercent ?? product.discountPercent,
        currency: offer?.currency ?? product.currency,
      };
    } catch {
      return product;
    }
  }));

  return enriched;
}
