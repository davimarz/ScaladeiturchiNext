import "server-only";
import { parseHaulHtml } from "./haul-import";
import { fetchAmazonKeywordSearchWithFullScroll, fetchAmazonProductImagesWithBrowser } from "./haul-browser";
import { supabaseAdminFetch } from "./supabase/admin";
import { isRelevantProduct, maxPriceFromQuery, queryTokens, titleRelevance } from "./ai-relevance";

export type ShoppingProduct = {
  asin: string;
  title: string;
  imageUrl: string | null;
  currentPrice: number | null;
  listPrice: number | null;
  discountPercent: number | null;
  currency: string;
  affiliateUrl: string;
  source: "catalogo" | "amazon-api" | "amazon-search" | "gemini-search";
  features?: string[];
};

const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG || "eiapromo-21";
const MARKETPLACE = "www.amazon.it";

function affiliateUrl(asin: string) {
  const url = new URL(`https://www.amazon.it/dp/${asin}`);
  url.searchParams.set("tag", PARTNER_TAG);
  return url.toString();
}

export async function searchLocalCatalog(query: string, limit = 8): Promise<ShoppingProduct[]> {
  const rows = await supabaseAdminFetch<Array<{
    asin: string;
    title: string;
    image_url: string | null;
    current_price: number | null;
    list_price: number | null;
    discount_percent: number | null;
    currency: string;
    affiliate_url: string;
    in_haul: boolean;
    in_offerte_lambo: boolean;
    in_bestseller: boolean;
  }>>(
    "products?active=eq.true&or=(in_haul.eq.true,in_offerte_lambo.eq.true,in_bestseller.eq.true)&select=asin,title,image_url,current_price,list_price,discount_percent,currency,affiliate_url,in_haul,in_offerte_lambo,in_bestseller&limit=500",
  );

  const tokens = queryTokens(query);
  const maxPrice = maxPriceFromQuery(query);

  return rows
    .filter((row) => maxPrice == null || row.current_price == null || row.current_price <= maxPrice)
    .map((row) => {
      const relevance = titleRelevance(row.title, tokens);
      return { row, matches: relevance.matches, score: relevance.score + (row.current_price != null ? 1 : 0) + (row.image_url ? 0.5 : 0) };
    })
    .filter(({ matches }) => tokens.length === 0 || matches >= (tokens.length >= 2 ? 2 : 1))
    .sort((a, b) => b.score - a.score || (a.row.current_price ?? Infinity) - (b.row.current_price ?? Infinity))
    .slice(0, limit)
    .map(({ row }) => ({
      asin: row.asin,
      title: row.title,
      imageUrl: row.image_url,
      currentPrice: row.current_price,
      listPrice: row.list_price,
      discountPercent: row.discount_percent,
      currency: row.currency || "EUR",
      affiliateUrl: row.affiliate_url || affiliateUrl(row.asin),
      source: "catalogo" as const,
    }));
}

type CreatorItem = {
  asin?: string;
  detailPageURL?: string;
  images?: { primary?: { large?: { url?: string }; medium?: { url?: string } } };
  itemInfo?: {
    title?: { displayValue?: string };
    features?: { displayValues?: string[] };
  };
  offersV2?: {
    listings?: Array<{
      price?: { money?: { amount?: number; currency?: string } };
      savingBasis?: { money?: { amount?: number } };
      savings?: { percentage?: number };
    }>;
  };
};

let tokenCache: { token: string; expiresAt: number } | null = null;

async function amazonAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const clientId = process.env.AMAZON_CREATORS_CLIENT_ID || process.env.AMAZON_CREDENTIAL_ID;
  const clientSecret = process.env.AMAZON_CREATORS_CLIENT_SECRET || process.env.AMAZON_CREDENTIAL_SECRET;
  if (!clientId || !clientSecret) throw new Error("Amazon Creators API credentials unavailable");

  const response = await fetch("https://api.amazon.co.uk/auth/o2/token", {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "creatorsapi::default",
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
  if (!response.ok || !data.access_token) throw new Error("Amazon Creators token unavailable");
  tokenCache = { token: data.access_token, expiresAt: Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

export async function searchAmazonCreators(query: string, limit = 8): Promise<ShoppingProduct[]> {
  const token = await amazonAccessToken();
  const response = await fetch("https://creatorsapi.amazon/catalog/v1/searchItems", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(18_000),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-marketplace": MARKETPLACE,
    },
    body: JSON.stringify({
      partnerTag: PARTNER_TAG,
      marketplace: MARKETPLACE,
      keywords: query.slice(0, 250),
      itemCount: Math.min(10, Math.max(4, limit)),
      searchIndex: "All",
      resources: [
        "images.primary.large",
        "images.primary.medium",
        "itemInfo.title",
        "itemInfo.features",
        "offersV2.listings.price",
      ],
    }),
  });

  const body = await response.json().catch(() => ({})) as {
    searchResult?: { items?: CreatorItem[] };
    errors?: Array<{ code?: string; message?: string }>;
  };
  if (!response.ok) {
    const code = body.errors?.[0]?.code || String(response.status);
    throw new Error("Amazon Creators API " + code);
  }

  return (body.searchResult?.items ?? []).flatMap((item) => {
    const asin = item.asin?.toUpperCase();
    const title = item.itemInfo?.title?.displayValue?.trim();
    if (!asin || !/^[A-Z0-9]{10}$/.test(asin) || !title) return [];

    const listing = item.offersV2?.listings?.[0];
    const currentPrice = listing?.price?.money?.amount ?? null;
    const listPrice = listing?.savingBasis?.money?.amount ?? null;
    const discountPercent = listing?.savings?.percentage ?? (
      currentPrice != null && listPrice != null && listPrice > currentPrice
        ? Math.round(((listPrice - currentPrice) / listPrice) * 100)
        : null
    );

    return [{
      asin,
      title,
      imageUrl: item.images?.primary?.large?.url ?? item.images?.primary?.medium?.url ?? null,
      currentPrice,
      listPrice,
      discountPercent,
      currency: listing?.price?.money?.currency ?? "EUR",
      affiliateUrl: affiliateUrl(asin),
      source: "amazon-api" as const,
      features: item.itemInfo?.features?.displayValues?.slice(0, 6) ?? [],
    }];
  }).filter((product) => isRelevantProduct(product.title, query)).slice(0, limit);
}

export async function searchAmazonFallback(query: string, limit = 8): Promise<ShoppingProduct[]> {
  const url = new URL("https://www.amazon.it/s");
  const keywords = queryTokens(query).join(" ") || query;
  url.searchParams.set("k", keywords.slice(0, 180));
  const result = await fetchAmazonKeywordSearchWithFullScroll(url.toString());
  return parseHaulHtml(result.html).filter((product) => isRelevantProduct(product.title, query)).slice(0, limit).map((product) => ({
    asin: product.asin,
    title: product.title,
    imageUrl: product.imageUrl,
    currentPrice: product.currentPrice,
    listPrice: product.listPrice,
    discountPercent: product.discountPercent,
    currency: "EUR",
    affiliateUrl: affiliateUrl(product.asin),
    source: "amazon-search" as const,
  }));
}

export type GroundedSearchResult = {
  products: ShoppingProduct[];
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
};

export async function searchAmazonWithGeminiGrounding(query: string, limit = 8): Promise<GroundedSearchResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  if (!apiKey) throw new Error("Gemini API key unavailable");

  const keywords = queryTokens(query).join(" ") || query;
  const amazonUrl = new URL("https://www.amazon.it/s");
  amazonUrl.searchParams.set("k", keywords.slice(0, 160));

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
    {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      headers: {
        "x-goog-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{
            text:
              "Leggi questa pagina di ricerca Amazon Italia: " + amazonUrl.toString() +
              "\nLa richiesta originale del cliente è: " + query +
              "\nEstrai soltanto prodotti realmente presenti nella pagina e pertinenti alla richiesta. " +
              "Per ogni prodotto restituisci una riga esattamente nel formato ASIN|TITOLO. " +
              "L ASIN deve essere di 10 caratteri e provenire dal link /dp/ASIN della pagina. " +
              "Non inventare ASIN o prodotti. Restituisci fino a " + Math.min(8, Math.max(4, limit)) + " prodotti."
          }]
        }],
        tools: [{ url_context: {} }],
        generationConfig: { temperature: 0, maxOutputTokens: 500 }
      }),
    }
  );

  const data = await response.json().catch(() => ({})) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      urlContextMetadata?: unknown;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      toolUsePromptTokenCount?: number;
      totalTokenCount?: number;
    };
    error?: { message?: string; code?: number; status?: string };
  };

  if (!response.ok) {
    const error = new Error(data.error?.message || "Gemini URL context error " + response.status);
    (error as Error & { statusCode?: number }).statusCode = response.status;
    throw error;
  }

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
  const candidates = new Map<string, string>();

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/\b([A-Z0-9]{10})\b\s*\|\s*(.+)$/i);
    if (!match) continue;
    const asin = match[1].toUpperCase();
    const title = match[2].replace(/[*_`#]/g, "").trim();
    if (title.length >= 4 && isRelevantProduct(title, query)) {
      candidates.set(asin, title.slice(0, 300));
    }
  }

  const entries = [...candidates.entries()].slice(0, limit);
  const images = entries.length
    ? await fetchAmazonProductImagesWithBrowser(entries.map(([asin]) => asin)).catch(() => new Map<string, string>())
    : new Map<string, string>();

  const products = entries.map(([asin, title]) => ({
    asin,
    title,
    imageUrl: images.get(asin) || null,
    currentPrice: null,
    listPrice: null,
    discountPercent: null,
    currency: "EUR",
    affiliateUrl: affiliateUrl(asin),
    source: "gemini-search" as const,
  }));

  const inputTokens = (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.toolUsePromptTokenCount || 0);
  const outputTokens = (data.usageMetadata?.candidatesTokenCount || 0) + (data.usageMetadata?.thoughtsTokenCount || 0);
  const totalTokens = data.usageMetadata?.totalTokenCount || inputTokens + outputTokens;

  return { products, inputTokens, outputTokens, totalTokens, model };
}
export function mergeProducts(...groups: ShoppingProduct[][]) {
  const seen = new Set<string>();
  const merged: ShoppingProduct[] = [];
  for (const group of groups) {
    for (const product of group) {
      if (seen.has(product.asin)) continue;
      seen.add(product.asin);
      merged.push(product);
    }
  }
  return merged;
}

export type GeminiAnswer = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
};

export async function generateShoppingAnswer(query: string, products: ShoppingProduct[]): Promise<GeminiAnswer> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  if (!apiKey) throw new Error("Gemini API key unavailable");

  const compact = products.slice(0, 8).map((product, index) => ({
    n: index + 1,
    asin: product.asin,
    title: product.title.slice(0, 220),
    price: product.currentPrice,
    listPrice: product.listPrice,
    discount: product.discountPercent,
    features: (product.features ?? []).slice(0, 3),
  }));

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
    {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        "x-goog-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: "Sei l'assistente shopping di Scala dei Turchi. Rispondi in italiano, in modo breve e concreto. Usa solo i prodotti forniti. Non inventare prezzi, caratteristiche, disponibilità o sconti. Se i dati non permettono una conclusione, dichiaralo. Considera almeno quattro alternative quando disponibili."
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: "Richiesta cliente: " + query + "\nProdotti verificati: " + JSON.stringify(compact)
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 320
        }
      }),
    }
  );

  const data = await response.json().catch(() => ({})) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      totalTokenCount?: number;
    };
    error?: { message?: string; status?: string; code?: number };
  };

  if (!response.ok) {
    const error = new Error(data.error?.message || "Gemini response error " + response.status);
    (error as Error & { statusCode?: number }).statusCode = response.status;
    throw error;
  }

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim()
    || "Ho selezionato i prodotti più pertinenti alla tua richiesta.";
  const inputTokens = data.usageMetadata?.promptTokenCount || 0;
  const outputTokens = (data.usageMetadata?.candidatesTokenCount || 0) + (data.usageMetadata?.thoughtsTokenCount || 0);
  const totalTokens = data.usageMetadata?.totalTokenCount || inputTokens + outputTokens;

  return { text, inputTokens, outputTokens, totalTokens, model };
}
