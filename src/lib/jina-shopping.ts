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
    /\[!\[Image \d+: ([^\]]+)\]\((https:\/\/m\.media-amazon\.com\/images\/I\/[^)\s]+)\)\]\(https?:\/\/(?:www\.)?amazon\.it\/[^)\n]*\/dp\/([A-Z0-9]{10})(?:\/[^)\n]*)?\)/gi,
  )];
  const products: JinaShoppingProduct[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < matches.length && products.length < limit; index += 1) {
    const match = matches[index];
    const asin = match[3].toUpperCase();
    if (seen.has(asin)) continue;
    const chunk = markdown.slice(match.index, matches[index + 1]?.index ?? Math.min(markdown.length, match.index + 5000));
    const heading = chunk.match(/\n## \[([^\]]+)\]\(https?:\/\/(?:www\.)?amazon\.it\/[^)\n]*\/dp\/[A-Z0-9]{10}[^)\n]*\)/i)?.[1];
    const imageTitle = clean(match[1]).replace(/\.{3}$/, "");
    const headingTitle = clean(heading || "").replace(/\.{3}$/, "");
    // Amazon often puts the brand only in the image alt text (for example
    // "iRobot"), while the linked heading starts directly with "Roomba".
    // Keep the more descriptive title so exact brand + model queries survive
    // the relevance filter applied after parsing.
    const headingStart = headingTitle.split(/\s+/)[0];
    const headingStartAt = headingStart
      ? imageTitle.toLocaleLowerCase("it").indexOf(headingStart.toLocaleLowerCase("it"))
      : -1;
    const imagePrefix = headingStartAt > 0 ? imageTitle.slice(0, headingStartAt).trim() : "";
    const title = imagePrefix
      ? `${imagePrefix} ${headingTitle}`
      : imageTitle.length >= headingTitle.length ? imageTitle : headingTitle;
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
  const tokens = queryTokens(query);
  // Keep gender and other useful qualifiers in Amazon's search phrase. The relevance
  // filter may ignore them as mandatory title terms, but the retailer search benefits
  // from seeing the user's complete intent.
  const usefulQualifiers = query
    .toLocaleLowerCase("it")
    .match(/\b(?:donna|donne|uomo|uomini|bambino|bambina|bambini|bambine)\b/g) ?? [];
  const expandedBase = tokens.includes("borse") ? "borsa" : tokens;
  const base = [...new Set([...expandedBase, ...usefulQualifiers])].join(" ") || query;
  // Interactive searches need one exact Amazon.it search and, for bags, one
  // useful synonym. The catalogue import may take longer; a visitor cannot.
  const bagEnglish = /\bbors[ae]\b/i.test(query)
    ? `handbag ${usefulQualifiers[0] === "uomo" || usefulQualifiers[0] === "uomini" ? "men" : "women"}`
    : "";
  const uniqueVariants = [...new Set([query, base, bagEnglish].map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 3);
  const results = new Map<string, JinaShoppingProduct>();
  let lastError: unknown;
  for (const keywords of uniqueVariants) {
    const amazon = new URL("https://www.amazon.it/s");
    amazon.searchParams.set("k", keywords.slice(0, 180));
    try {
      const response = await fetch("https://r.jina.ai/" + amazon.toString(), {
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
        headers: { accept: "text/plain" },
      });
      if (!response.ok) throw new Error("Jina Amazon HTTP " + response.status);
      const products = parseJinaAmazonSearch(await response.text(), Math.min(48, Math.max(limit * 3, limit)));
      for (const product of products) {
        if (isRelevantProduct(product.title, query)) results.set(product.asin, product);
      }
      // Continue across several independent Amazon result pages to collect enough
      // fully usable products; the caller still enforces image and price completeness.
      if (results.size >= Math.min(4, limit)) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!results.size && lastError) throw lastError;
  return [...results.values()].slice(0, limit);
}
