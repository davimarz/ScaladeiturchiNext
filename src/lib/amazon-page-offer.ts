import "server-only";
import { extractAmazonProductImage } from "./amazon-input";

const AMAZON_HOSTS = new Set(["amazon.it", "www.amazon.it"]);

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#8364;|&euro;/gi, "€")
    .replace(/&#x20ac;/gi, "€");
}

function normalizeNumber(value: string) {
  const cleaned = decodeEntities(value).replace(/\s/g, "").replace(/€/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const amount = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function matchPriceNear(html: string, marker: RegExp) {
  const markerMatch = marker.exec(html);
  if (!markerMatch) return null;
  const tail = html.slice(markerMatch.index, markerMatch.index + 2200);
  const offscreen = tail.match(/class=["'][^"']*a-offscreen[^"']*["'][^>]*>([^<]{1,80})</i)?.[1];
  if (offscreen) return normalizeNumber(offscreen);
  const text = decodeEntities(tail.replace(/<[^>]+>/g, " "));
  const euro = text.match(/([0-9]{1,5}(?:[.,][0-9]{2})?)\s*€/);
  return euro ? normalizeNumber(euro[1]) : null;
}

function jsonNumber(html: string, names: string[]) {
  for (const name of names) {
    const match = html.match(new RegExp('"' + name + '"\\s*:\\s*(?:\\{[\\s\\S]{0,300}?"(?:amount|value)"\\s*:\\s*)?([0-9]+(?:\\.[0-9]+)?)', "i"));
    const value = match ? Number(match[1]) : NaN;
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

export type AmazonPageOffer = {
  currentPrice: number;
  listPrice: number | null;
  discountPercent: number | null;
  currency: "EUR";
};

function cleanProductTitle(value: string) {
  return decodeEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*:\s*Amazon\.it.*$/i, "")
    .slice(0, 300);
}

function isUsefulProductTitle(value: string) {
  const normalized = value.toLowerCase();
  return value.length > 3 &&
    !/mostra visualizzazione per acquistare rapidamente|quick view|acquista rapidamente|visualizzazione rapida|amazon\.it\s*$/i.test(normalized);
}

export function needsProductTitleEnrichment(value: string) {
  const title = value.replace(/\s+/g, " ").trim();
  if (!title) return true;
  if (/mostra visualizzazione per acquistare rapidamente|quick view|acquista rapidamente|visualizzazione rapida|^Prodotto Amazon\s+[A-Z0-9]{10}$/i.test(title)) return true;
  const meaningfulWords = title.split(/\s+/).filter((word) => word !== "&" && word.length > 0);
  return meaningfulWords.length <= 3 && title.length <= 32 && !/\d/.test(title);
}

export function extractAmazonProductTitle(html: string) {
  const candidates = [
    html.match(/id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)?.[1],
    html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1],
    html.match(/<meta\b[^>]*name=["']title["'][^>]*content=["']([^"']+)["']/i)?.[1],
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
  ];

  for (const candidate of candidates) {
    const title = cleanProductTitle(candidate ?? "");
    if (isUsefulProductTitle(title)) return title;
  }

  return null;
}

export function extractAmazonProductOffer(html: string): AmazonPageOffer | null {
  const current =
    matchPriceNear(html, /class=["'][^"']*(?:priceToPay|apexPriceToPay)[^"']*["']/i) ??
    matchPriceNear(html, /id=["'](?:priceblock_ourprice|priceblock_dealprice|corePriceDisplay_desktop_feature_div)["']/i) ??
    jsonNumber(html, ["priceAmount", "displayPrice"]);

  if (current == null) return null;

  const list =
    matchPriceNear(html, /class=["'][^"']*(?:basisPrice|a-text-price)[^"']*["']/i) ??
    jsonNumber(html, ["basisPrice", "listPrice"]);

  let discount: number | null = null;
  const discountText =
    html.match(/class=["'][^"']*(?:savingsPercentage|reinventPriceSavingsPercentageMargin)[^"']*["'][^>]*>\s*-?\s*([0-9]{1,2})\s*%/i)?.[1] ??
    html.match(/(?:Risparmi|Risparmio|Save)[^%]{0,120}?([0-9]{1,2})\s*%/i)?.[1];
  if (discountText) discount = Number(discountText);
  if ((!discount || discount <= 0) && list != null && list > current) {
    discount = Math.round(((list - current) / list) * 100);
  }

  return {
    currentPrice: current,
    listPrice: list != null && list > current ? list : null,
    discountPercent: discount != null && discount > 0 ? discount : null,
    currency: "EUR",
  };
}

async function readHtml(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 3 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Amazon product page too large");
      }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
    return html;
  } finally {
    reader.releaseLock();
  }
}

export async function fetchAmazonProductSnapshot(asin: string, fetcher: typeof fetch = fetch) {
  if (!/^[A-Z0-9]{10}$/i.test(asin)) throw new Error("Invalid product ASIN");
  const normalizedAsin = asin.toUpperCase();
  let url = new URL("https://www.amazon.it/dp/" + normalizedAsin);
  const signal = AbortSignal.timeout(10000);

  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!AMAZON_HOSTS.has(url.hostname.toLowerCase())) throw new Error("Unapproved Amazon offer redirect");
    const response = await fetcher(url, {
      redirect: "manual",
      cache: "no-store",
      signal,
      headers: {
        accept: "text/html",
        "accept-language": "it-IT,it;q=0.9",
        "user-agent": "ScalaDeiTurchiCatalog/1.0",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Amazon offer redirect limit");
      await response.body?.cancel();
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error("Amazon HTTP " + response.status);
    if (!response.headers.get("content-type")?.includes("text/html")) throw new Error("Amazon response is not HTML");
    const html = await readHtml(response);
    if (/\/errors\/validateCaptcha|<title>\s*Robot Check/i.test(html)) throw new Error("Amazon blocked the product page");
    return {
      offer: extractAmazonProductOffer(html),
      imageUrl: extractAmazonProductImage(html, normalizedAsin),
      title: extractAmazonProductTitle(html),
    };
  }

  return { offer: null, imageUrl: null, title: null };
}

export async function fetchAmazonProductOffer(asin: string, fetcher: typeof fetch = fetch) {
  const snapshot = await fetchAmazonProductSnapshot(asin, fetcher);
  return snapshot.offer;
}


export async function fetchAmazonSearchTitle(asin: string, fetcher: typeof fetch = fetch) {
  if (!/^[A-Z0-9]{10}$/i.test(asin)) return null;
  try {
    const url = new URL("https://www.amazon.it/s");
    url.searchParams.set("k", asin.toUpperCase());
    const response = await fetcher(url, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: {
        accept: "text/html",
        "accept-language": "it-IT,it;q=0.9",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return null;
    const html = await response.text();
    if (/\/errors\/validateCaptcha|<title>\s*Robot Check|automated access/i.test(html)) return null;

    const marker = new RegExp('data-asin=["\\\']' + asin.toUpperCase() + '["\\\']', "i");
    const index = html.search(marker);
    if (index < 0) return null;

    const aroundAsin = html.slice(index, index + 12000);
    const candidates = [
      aroundAsin.match(/<h2\b[^>]*>[\s\S]*?<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1],
      aroundAsin.match(/<span\b[^>]*class=["'][^"']*a-text-normal[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1],
      aroundAsin.match(/<a\b[^>]*title=["']([^"']+)["']/i)?.[1],
    ];
    for (const candidate of candidates) {
      const title = cleanProductTitle(candidate ?? "");
      if (isUsefulProductTitle(title)) return title;
    }
    return null;
  } catch {
    return null;
  }
}
