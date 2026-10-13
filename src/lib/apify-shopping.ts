import "server-only";

import { isRelevantProduct } from "./ai-relevance";

const ACTOR_ID = process.env.APIFY_AMAZON_ACTOR_ID || "junglee~amazon-crawler";
const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG || "eiapromo-21";
const APIFY_API = "https://api.apify.com/v2";
const ACTOR_WAIT_SECONDS = 15;
const ACTOR_POLL_BUDGET_MS = 35_000;

export type ApifyShoppingProduct = {
  asin: string;
  title: string;
  imageUrl: string | null;
  currentPrice: number | null;
  listPrice: number | null;
  discountPercent: number | null;
  currency: string;
  affiliateUrl: string;
  source: "amazon-apify";
  features: string[];
  priceVerifiedAt: string | null;
  description: string;
};

type ActorRun = {
  data?: {
    id?: string;
    status?: string;
    defaultDatasetId?: string;
  };
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanText(value: unknown) {
  return typeof value === "string"
    ? value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function money(value: unknown) {
  if (typeof value === "number")
    return Number.isFinite(value) && value > 0 && value < 10_000 ? value : null;
  const record = object(value);
  const raw = record?.value ?? value;
  if (typeof raw === "number")
    return Number.isFinite(raw) && raw > 0 && raw < 10_000 ? raw : null;
  if (typeof raw !== "string") return null;
  const numeric = raw.replace(/[^\d,.-]/g, "");
  const normalized = numeric.includes(",")
    ? numeric.replace(/\./g, "").replace(",", ".")
    : numeric;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 10_000 ? parsed : null;
}

function affiliateUrl(asin: string) {
  const url = new URL(`https://www.amazon.it/dp/${asin}/ref=nosim`);
  url.searchParams.set("tag", PARTNER_TAG);
  return url.toString();
}

function toShoppingProduct(value: unknown): ApifyShoppingProduct | null {
  const row = object(value);
  if (!row) return null;
  const asin = cleanText(row.asin ?? row.originalAsin).toUpperCase();
  const title = cleanText(row.title);
  if (!/^[A-Z0-9]{10}$/.test(asin) || title.length < 3) return null;

  const currentPrice = money(row.price);
  const listPrice = money(row.listPrice);
  const discountPercent = currentPrice != null && listPrice != null && listPrice > currentPrice
    ? Math.round(((listPrice - currentPrice) / listPrice) * 100)
    : null;
  const imageCandidates = [
    row.thumbnailImage,
    ...(Array.isArray(row.highResolutionImages) ? row.highResolutionImages : []),
    ...(Array.isArray(row.galleryThumbnails) ? row.galleryThumbnails : []),
  ];
  const imageUrl = imageCandidates.find((candidate): candidate is string =>
    typeof candidate === "string" && /^https:\/\//i.test(candidate),
  ) ?? null;
  const features = Array.isArray(row.features)
    ? row.features.map(cleanText).filter(Boolean).slice(0, 6)
    : [];
  const description = cleanText(row.description)
    || features.join(" · ")
    || `Descrizione sintetica dal titolo Amazon: ${title}`;
  const priceRecord = object(row.price);
  const currency = cleanText(priceRecord?.currency).toUpperCase() || "EUR";

  return {
    asin,
    title,
    imageUrl,
    currentPrice,
    listPrice,
    discountPercent,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "EUR",
    affiliateUrl: affiliateUrl(asin),
    source: "amazon-apify",
    features,
    priceVerifiedAt: currentPrice != null ? new Date().toISOString() : null,
    description: description.slice(0, 1400),
  };
}

async function apifyFetch(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`${APIFY_API}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Apify HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
  }
  return response;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isApifyAmazonConfigured() {
  return Boolean(process.env.APIFY_API_TOKEN);
}

export function parseApifyAmazonProducts(values: unknown[], query: string, limit = 8) {
  const seen = new Set<string>();
  const products: ApifyShoppingProduct[] = [];
  for (const value of values) {
    const product = toShoppingProduct(value);
    if (!product || seen.has(product.asin) || !isRelevantProduct(product.title, query)) continue;
    seen.add(product.asin);
    products.push(product);
    if (products.length >= limit) break;
  }
  return products;
}

export async function searchAmazonViaApify(query: string, limit = 8): Promise<ApifyShoppingProduct[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN non configurato");

  const searchUrl = new URL("https://www.amazon.it/s");
  searchUrl.searchParams.set("k", query.slice(0, 180));
  const actorResponse = await apifyFetch(
    `/acts/${encodeURIComponent(ACTOR_ID)}/runs?waitForFinish=${ACTOR_WAIT_SECONDS}`,
    token,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        categoryOrProductUrls: [{ url: searchUrl.toString() }],
        maxItemsPerStartUrl: Math.min(16, Math.max(8, limit * 2)),
        proxyCountry: "IT",
      }),
    },
  );
  let run = await actorResponse.json() as ActorRun;
  const runId = run.data?.id;
  if (!runId) throw new Error("Apify non ha restituito l'identificativo della ricerca");

  const deadline = Date.now() + ACTOR_POLL_BUDGET_MS;
  while (run.data?.status && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.data.status)) {
    if (Date.now() >= deadline) throw new Error("Ricerca Apify scaduta in attesa dei risultati");
    await delay(1_500);
    const statusResponse = await apifyFetch(`/actor-runs/${encodeURIComponent(runId)}`, token);
    run = await statusResponse.json() as ActorRun;
  }
  if (run.data?.status !== "SUCCEEDED") {
    throw new Error(`Ricerca Apify terminata con stato ${run.data?.status ?? "sconosciuto"}`);
  }

  const datasetId = run.data.defaultDatasetId;
  if (!datasetId) throw new Error("Apify non ha restituito il dataset dei prodotti");
  const itemsResponse = await apifyFetch(
    `/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json&limit=${Math.min(16, Math.max(8, limit * 2))}`,
    token,
  );
  const items = await itemsResponse.json() as unknown;
  if (!Array.isArray(items)) throw new Error("Apify ha restituito un dataset in formato inatteso");
  return parseApifyAmazonProducts(items, query, limit);
}
