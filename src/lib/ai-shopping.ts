import "server-only";
import { parseHaulHtml } from "./haul-import";
import { fetchAmazonKeywordSearchWithFullScroll } from "./haul-browser";
import { supabaseAdminFetch } from "./supabase/admin";

export type ShoppingProduct = {
  asin: string;
  title: string;
  imageUrl: string | null;
  currentPrice: number | null;
  listPrice: number | null;
  discountPercent: number | null;
  currency: string;
  affiliateUrl: string;
  source: "catalogo" | "amazon-api" | "amazon-search";
  features?: string[];
};

const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG || "eiapromo-21";
const MARKETPLACE = "www.amazon.it";

function affiliateUrl(asin: string) {
  const url = new URL(`https://www.amazon.it/dp/${asin}`);
  url.searchParams.set("tag", PARTNER_TAG);
  return url.toString();
}

function queryTokens(query: string) {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9€]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !["cerco","voglio","prodotto","prodotti","amazon","migliore","migliori","consigliami","vorrei"].includes(token));
}

function maxPriceFromQuery(query: string) {
  const matches = [...query.matchAll(/(?:sotto|max(?:imo)?|entro|fino a|meno di)?\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|euro)/gi)];
  if (!matches.length) return null;
  const value = Number(matches.at(-1)?.[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function scoreTitle(title: string, tokens: string[]) {
  const normalized = title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return tokens.reduce((score, token) => score + (normalized.includes(token) ? 4 : 0), 0);
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
    .map((row) => ({ row, score: scoreTitle(row.title, tokens) + (row.current_price != null ? 1 : 0) + (row.image_url ? 0.5 : 0) }))
    .filter(({ score }) => tokens.length === 0 || score > 0)
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
  }).slice(0, limit);
}

export async function searchAmazonFallback(query: string, limit = 8): Promise<ShoppingProduct[]> {
  const url = new URL("https://www.amazon.it/s");
  url.searchParams.set("k", query.slice(0, 180));
  const result = await fetchAmazonKeywordSearchWithFullScroll(url.toString());
  return parseHaulHtml(result.html).slice(0, limit).map((product) => ({
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

export async function generateShoppingAnswer(query: string, products: ShoppingProduct[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return products.length
      ? "Ho trovato questi prodotti pertinenti alla tua richiesta. Confronta prezzo, sconto e caratteristiche indicate nelle schede."
      : "Non ho trovato prodotti sufficientemente pertinenti in questo momento.";
  }

  const compact = products.slice(0, 8).map((product, index) => ({
    n: index + 1,
    asin: product.asin,
    title: product.title,
    price: product.currentPrice,
    listPrice: product.listPrice,
    discount: product.discountPercent,
    features: product.features ?? [],
  }));

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-6-luna",
        max_output_tokens: 350,
        input: [
          {
            role: "system",
            content: "Sei l'assistente shopping di Scala dei Turchi. Rispondi in italiano in modo breve e utile. Usa esclusivamente i dati prodotto forniti. Non inventare caratteristiche, prezzi, disponibilità o sconti. Consiglia i prodotti più pertinenti alla richiesta e, quando disponibili, considera almeno quattro alternative. Se un dato manca, non dedurlo.",
          },
          {
            role: "user",
            content: `Richiesta: ${query}\nProdotti disponibili: ${JSON.stringify(compact)}`,
          },
        ],
      }),
    });
    const data = await response.json().catch(() => ({})) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    if (!response.ok) throw new Error("OpenAI response error " + response.status);
    return data.output_text?.trim()
      || data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join(" ").trim()
      || "Ho selezionato i prodotti più pertinenti alla tua richiesta.";
  } catch {
    return "Ho selezionato i prodotti più pertinenti alla tua richiesta sulla base dei dati disponibili.";
  }
}
