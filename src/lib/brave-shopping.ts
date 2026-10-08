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

function affiliateProductUrl(asin: string) {
  const url = new URL("https://www.amazon.it/dp/" + asin + "/ref=nosim");
  url.searchParams.set("tag", PARTNER_TAG);
  return url.toString();
}

function affiliateSearchUrl(asin: string) {
  const url = new URL("https://www.amazon.it/s");
  url.searchParams.set("k", asin);
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


type EnrichableShoppingProduct = Omit<ExternalShoppingProduct, "source"> & { source: string };

async function enrichFromBraveByAsin<T extends EnrichableShoppingProduct>(apiKey: string, product: T): Promise<T> {
  if (product.currentPrice != null && product.imageUrl) return product;
  try {
    const exactQueries = [
      'site:amazon.it "' + product.asin + '"',
      'site:amazon.it/dp "' + product.asin + '"',
      '"' + product.asin + '" Amazon.it prezzo',
      '"' + product.asin + '" Amazon.it €',
      '"' + product.asin + '" "' + product.title.slice(0, 80) + '"'
    ];
    const exactMatches: BraveResult[] = [];
    let foundPrice: number | null = product.currentPrice;
    let foundListPrice: number | null = product.listPrice;
    let foundImage = product.imageUrl;

    for (const exactQuery of exactQueries) {
      const batch = await braveWebSearch(apiKey, exactQuery);

      for (const result of batch) {
        const rawUrl = result.url || "";
        const match = rawUrl.match(/amazon\.it\/(?:[^?#]*\/)?(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i);
        if (!match || match[1].toUpperCase() !== product.asin) continue;

        exactMatches.push(result);
        if (!foundImage && result.thumbnail?.src) foundImage = result.thumbnail.src;

        const snippets = [result.description, ...(result.extra_snippets ?? [])]
          .filter((value): value is string => Boolean(value))
          .map(cleanText);
        const snippetText = snippets.join(" ");
        const prices = [...snippetText.matchAll(/(?:€\s*([0-9]{1,5}(?:[.,][0-9]{2})?)|([0-9]{1,5}(?:[.,][0-9]{2})?)\s*€)/g)]
          .map((match) => Number((match[1] || match[2] || "").replace(",", ".")))
          .filter((value) => Number.isFinite(value) && value >= 1 && value <= 9999);

        if (foundPrice == null && prices.length) foundPrice = prices[0];
        if (foundListPrice == null && foundPrice != null) {
          foundListPrice = prices.find((value) => value > foundPrice!) ?? null;
        }
      }

      if (foundPrice != null && foundImage) break;
    }

    if (exactMatches.length) {
      const discountPercent = product.discountPercent ?? (
        foundPrice != null && foundListPrice != null
          ? Math.round(((foundListPrice - foundPrice) / foundListPrice) * 100)
          : null
      );

      return {
        ...product,
        imageUrl: foundImage,
        currentPrice: foundPrice,
        listPrice: foundListPrice,
        discountPercent,
        affiliateUrl: affiliateSearchUrl(product.asin),
      } as T;
    }
  } catch {}
  return product;
}


export async function enrichAmazonProductsViaBraveByAsin<T extends EnrichableShoppingProduct>(products: T[]): Promise<T[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey || !products.length) return products;

  const enriched: T[] = [];
  for (let offset = 0; offset < products.length; offset += 4) {
    const batch = products.slice(offset, offset + 4);
    const results = await Promise.all(batch.map(async (product) => {
      if (product.currentPrice != null && product.imageUrl) return product;
      return enrichFromBraveByAsin(apiKey, product);
    }));
    enriched.push(...results);
  }
  return enriched;
}

export async function searchAmazonViaBrave(query: string, limit = 8, semanticQueries: string[] = [query]): Promise<ExternalShoppingProduct[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error("Brave Search API key unavailable");

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
      const snippetText = snippets.join(" ");
      const priceMatches = [...snippetText.matchAll(/(?:€\s*([0-9]{1,5}(?:[.,][0-9]{2})?)|([0-9]{1,5}(?:[.,][0-9]{2})?)\s*€)/g)]
        .map((match) => Number((match[1] || match[2] || "").replace(",", ".")))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= 9999);
      const currentPrice = priceMatches[0] ?? null;
      const listPrice = priceMatches.find((value) => currentPrice != null && value > currentPrice) ?? null;
      const discountPercent = currentPrice != null && listPrice != null
        ? Math.round(((listPrice - currentPrice) / listPrice) * 100)
        : null;

      seen.add(asin);
      products.push({
        asin,
        title,
        imageUrl: result.thumbnail?.src || null,
        currentPrice,
        listPrice,
        discountPercent,
        currency: "EUR",
        affiliateUrl: affiliateSearchUrl(asin),
        source: "brave-search",
        features: snippets.slice(0, 2).map((value) => value.slice(0, 220)),
      });

      if (products.length >= limit) break;
    }
  };

  const queries = [...new Set([query, ...semanticQueries].map((value) => value.trim()).filter(Boolean))].slice(0, 6);
  for (const candidate of queries) {
    if (products.length >= limit) break;
    const candidateKeywords = queryTokens(candidate).join(" ") || candidate;
    const searchPatterns = [
      'site:amazon.it "' + candidateKeywords + '"',
      'site:amazon.it/dp "' + candidateKeywords + '"',
      'site:amazon.it/dp ' + candidateKeywords + ' prezzo',
      candidateKeywords + " Amazon.it",
      candidateKeywords + " Amazon.it prezzo"
    ];
    for (const pattern of searchPatterns) {
      if (products.length >= limit) break;
      collect(await braveWebSearch(apiKey, pattern));
    }
  }

  if (!products.length) return products;

  const enriched = await Promise.all(products.slice(0, limit).map(async (product) => {
    let current = product;
    try {
      const snapshot = await fetchAmazonProductSnapshot(product.asin);
      const offer = snapshot.offer;
      current = {
        ...product,
        affiliateUrl: (snapshot.title || snapshot.imageUrl || offer) ? affiliateProductUrl(product.asin) : affiliateSearchUrl(product.asin),
        title: snapshot.title && isRelevantProduct(snapshot.title, query) ? snapshot.title : product.title,
        imageUrl: snapshot.imageUrl || product.imageUrl,
        currentPrice: offer?.currentPrice ?? product.currentPrice,
        listPrice: offer?.listPrice ?? product.listPrice,
        discountPercent: offer?.discountPercent ?? product.discountPercent,
        currency: offer?.currency ?? product.currency,
      };
    } catch {}
    return enrichFromBraveByAsin(apiKey, current);
  }));

  return enriched;
}
