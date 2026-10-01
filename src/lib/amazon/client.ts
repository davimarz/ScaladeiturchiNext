import "server-only";
import { getAmazonAccessToken } from "./oauth";
import { getAmazonConfig } from "./config";

const CREATORS_API_BASE = "https://creatorsapi.amazon/catalog/v1";

type AmazonImage = { url?: string; width?: number; height?: number };
type AmazonItem = {
  asin: string;
  detailPageURL?: string;
  images?: { primary?: { small?: AmazonImage; medium?: AmazonImage; large?: AmazonImage } };
  itemInfo?: { title?: { displayValue?: string } };
  offersV2?: unknown;
};

type SearchItemsResponse = {
  searchResult?: {
    items?: AmazonItem[];
    totalResultCount?: number;
    searchURL?: string;
  };
  errors?: Array<{ code?: string; message?: string }>;
};

export async function amazonRequest<T>(operation: string, payload: Record<string, unknown>): Promise<T> {
  const [token, config] = await Promise.all([getAmazonAccessToken(), Promise.resolve(getAmazonConfig())]);

  const response = await fetch(`${CREATORS_API_BASE}/${operation}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-marketplace": config.marketplace,
    },
    body: JSON.stringify({
      ...payload,
      marketplace: config.marketplace,
      partnerTag: config.partnerTag,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Amazon Creators API failed: ${response.status} ${body.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

export async function searchAmazonItems(keywords: string, itemCount = 10) {
  const normalized = keywords.trim();
  if (!normalized) return { items: [], totalResultCount: 0 };

  const data = await amazonRequest<SearchItemsResponse>("searchItems", {
    keywords: normalized,
    searchIndex: "All",
    itemCount: Math.min(Math.max(itemCount, 1), 10),
    languagesOfPreference: ["it_IT"],
    currencyOfPreference: "EUR",
    resources: [
      "images.primary.medium",
      "itemInfo.title",
      "offersV2.listings.price",
    ],
  });

  if (data.errors?.length && !data.searchResult?.items?.length) {
    throw new Error(data.errors.map((error) => error.message || error.code || "Amazon error").join("; "));
  }

  return {
    items: data.searchResult?.items ?? [],
    totalResultCount: data.searchResult?.totalResultCount ?? 0,
    searchURL: data.searchResult?.searchURL,
  };
}


type GetItemsResponse = {
  itemsResult?: { items?: AmazonItem[] };
  errors?: Array<{ code?: string; message?: string }>;
};

export async function getAmazonItems(itemIds: string[]) {
  const ids = [...new Set(itemIds.map((id) => id.trim().toUpperCase()).filter((id) => /^[A-Z0-9]{10}$/.test(id)))].slice(0, 10);
  if (!ids.length) return { items: [] };

  const data = await amazonRequest<GetItemsResponse>("getItems", {
    itemIds: ids,
    languagesOfPreference: ["it_IT"],
    currencyOfPreference: "EUR",
    resources: [
      "images.primary.medium",
      "itemInfo.title",
      "offersV2.listings.price",
    ],
  });

  if (data.errors?.length && !data.itemsResult?.items?.length) {
    throw new Error(data.errors.map((error) => error.message || error.code || "Amazon error").join("; "));
  }
  return { items: data.itemsResult?.items ?? [] };
}
