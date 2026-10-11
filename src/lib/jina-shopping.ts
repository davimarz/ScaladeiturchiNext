import { isRelevantProduct, queryTokens } from "./ai-relevance";

const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG || "eiapromo-21";

export type JinaShoppingProduct = {
  asin: string;
  title: string;
  imageUrl: string | null;
  currentPrice: number | null;
  listPrice: number | null;
  discountPercent: number | null;
  currency: string;
  affiliateUrl: string;
  source: "amazon-search";
  priceVerifiedAt: string | null;
  description: string | null;
};

function clean(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function price(value: string) {
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 9999 ? parsed : null;
}

function affiliateUrl(asin: string) {
  const url = new URL("https://www.amazon.it/dp/" + asin + "/ref=nosim");
  url.searchParams.set("tag", PARTNER_TAG);
  return url.toString();
}

export function parseJinaAmazonSearch(markdown: string, limit = 8): JinaShoppingProduct[] {
  const matches = [...markdown.matchAll(
    /\[!\[Image \d+: ([^\]]+)\]\((https:\/\/m\.media-amazon\.com\/images\/I\/[^)\s]+)\)\]\(https?:\/\/www\.amazon\.it\/[^)\n]*\/dp\/([A-Z0-9]{10})(?:\/[^)\n]*)?\)/gi,
  )];
  const products: JinaShoppingProduct[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < matches.length && products.length < limit; index += 1) {
    const match = matches[index];
    const asin = match[3].toUpperCase();
    if (seen.has(asin)) continue;
    const chunk = markdown.slice(match.index, matches[index + 1]?.index ?? Math.min(markdown.length, match.index + 5000));
    const heading = chunk.match(/\n## \[([^\]]+)\]\(https?:\/\/www\.amazon\.it\/[^)\n]*\/dp\/[A-Z0-9]{10}[^)\n]*\)/i)?.[1];
    const title = clean(heading || match[1]).replace(/\.{3}$/, "");
    if (!title) continue;

    const description = clean(
      chunk.match(/\n\n([^\n\[\]#]{20,700})\n\n(?:\d(?:\.\d)?\[_|\d[,.]\d\s*out of|\d[,.]\d\s*su)/i)?.[1]
      || "Descrizione sintetica dal titolo Amazon: " + title,
    ).slice(0, 1400);
    const priceLine = chunk.match(/Price, product page\[([^\n]+)\]/i)?.[1] || "";
    const prices = [...priceLine.matchAll(/€\s*([0-9]{1,5}(?:[.,][0-9]{2})?)/g)]
      .map((candidate) => price(candidate[1]))
      .filter((candidate): candidate is number => candidate != null);
    const currentPrice = prices[0] ?? null;
    const listPrice = prices.find((candidate) => currentPrice != null && candidate > currentPrice) ?? null;
    const discountPercent = currentPrice != null && listPrice != null
      ? Math.round(((listPrice - currentPrice) / listPrice) * 100)
      : null;

    seen.add(asin);
    products.push({
      asin,
      title,
      imageUrl: match[2],
      currentPrice,
      listPrice,
      discountPercent,
      currency: "EUR",
      affiliateUrl: affiliateUrl(asin),
      source: "amazon-search",
      priceVerifiedAt: currentPrice != null ? new Date().toISOString() : null,
      description,
    });
  }
  return products;
}

export async function searchAmazonViaJina(query: string, limit = 8): Promise<JinaShoppingProduct[]> {
  const keywords = queryTokens(query).join(" ") || query;
  const amazon = new URL("http://www.amazon.it/-/en/s");
  amazon.searchParams.set("k", keywords.slice(0, 180));
  const response = await fetch("https://r.jina.ai/" + amazon.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
    headers: { accept: "text/plain" },
  });
  if (!response.ok) throw new Error("Jina Amazon HTTP " + response.status);
  const products = parseJinaAmazonSearch(await response.text(), Math.min(24, Math.max(limit * 2, limit)));
  return products.filter((product) => isRelevantProduct(product.title, query)).slice(0, limit);
}
