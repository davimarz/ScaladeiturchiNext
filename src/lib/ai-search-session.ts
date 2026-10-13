export const aiSearchSessionKey = "scaladeiturchi-ai-last-search";

export type AiSearchProduct = {
  asin: string;
  title: string;
  imageUrl: string | null;
  currentPrice: number | null;
  listPrice: number | null;
  discountPercent: number | null;
  currency: string;
  affiliateUrl: string;
  source: "catalogo" | "amazon-api" | "amazon-search" | "brave-search";
  features?: string[];
  priceVerifiedAt?: string | null;
  description?: string | null;
};

export type AiSearchSession = {
  version: 1;
  query: string;
  answer: string;
  products: AiSearchProduct[];
  noMoreProducts: boolean;
  savedAt: number;
};

const sources = new Set<AiSearchProduct["source"]>(["catalogo", "amazon-api", "amazon-search", "brave-search"]);

function safeAmazonUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["amazon.it", "www.amazon.it"].includes(url.hostname) && !url.username && !url.password;
  }
  catch { return false; }
}

function optionalPrice(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 10000 ? value : null;
}

function productFrom(value: unknown): AiSearchProduct | null {
  if (!value || typeof value !== "object") return null;
  const product = value as Record<string, unknown>;
  if (typeof product.asin !== "string" || !/^[A-Z0-9]{10}$/.test(product.asin) || typeof product.title !== "string" || !product.title.trim() || !safeAmazonUrl(product.affiliateUrl)) return null;
  const source = sources.has(product.source as AiSearchProduct["source"]) ? product.source as AiSearchProduct["source"] : "catalogo";
  return {
    asin: product.asin,
    title: product.title.slice(0, 1000),
    imageUrl: typeof product.imageUrl === "string" && /^https:\/\//.test(product.imageUrl) ? product.imageUrl : null,
    currentPrice: optionalPrice(product.currentPrice),
    listPrice: optionalPrice(product.listPrice),
    discountPercent: typeof product.discountPercent === "number" && product.discountPercent > 0 && product.discountPercent < 100 ? product.discountPercent : null,
    currency: typeof product.currency === "string" && /^[A-Z]{3}$/.test(product.currency) ? product.currency : "EUR",
    affiliateUrl: product.affiliateUrl as string,
    source,
    features: Array.isArray(product.features) ? product.features.filter((item): item is string => typeof item === "string").slice(0, 20).map(item => item.slice(0, 500)) : undefined,
    priceVerifiedAt: typeof product.priceVerifiedAt === "string" ? product.priceVerifiedAt.slice(0, 50) : null,
    description: typeof product.description === "string" ? product.description.slice(0, 2000) : null,
  };
}

export function readAiSearchSession(raw: string): AiSearchSession | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const session = value as Record<string, unknown>;
    const query = typeof session.query === "string" ? session.query.trim() : "";
    if (session.version !== 1 || query.length < 3 || query.length > 500 || typeof session.answer !== "string" || !Array.isArray(session.products)) return null;
    const products = session.products.slice(0, 40).map(productFrom);
    if (products.some(product => product === null)) return null;
    return {
      version: 1,
      query,
      answer: session.answer.slice(0, 8000),
      products: products as AiSearchProduct[],
      noMoreProducts: session.noMoreProducts === true,
      savedAt: typeof session.savedAt === "number" && Number.isFinite(session.savedAt) && session.savedAt > 0 ? session.savedAt : Date.now(),
    };
  }
  catch { return null; }
}

export function serializeAiSearchSession(session: Omit<AiSearchSession, "version">) {
  return JSON.stringify({ version: 1, ...session });
}
