import { allowedAmazonImage } from "./amazon-input";

const ASIN_RE = /^[A-Z0-9]{10}$/;

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#8364;|&#x20ac;|&euro;/gi, "€")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function attribute(tag: string, name: string) {
  return decodeEntities(
    tag.match(new RegExp("\\s" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"))
      ?.slice(1)
      .find((value) => value !== undefined) ?? "",
  );
}

function cleanText(value: string) {
  return decodeEntities(value.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function euro(value: string | undefined) {
  if (!value) return null;
  const normalized = decodeEntities(value).replace(/\s/g, "").replace(/€/g, "");
  const number = Number(normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function findCurrentPrice(fragment: string) {
  const aPrice = fragment.match(/class=["'][^"']*a-price(?![^"']*a-text-price)[^"']*["'][\s\S]{0,700}?class=["'][^"']*a-offscreen[^"']*["'][^>]*>([^<]+)</i)?.[1];
  if (aPrice) return euro(aPrice);
  const whole = fragment.match(/class=["'][^"']*a-price-whole[^"']*["'][^>]*>([^<]+)</i)?.[1];
  const fraction = fragment.match(/class=["'][^"']*a-price-fraction[^"']*["'][^>]*>([^<]+)</i)?.[1];
  return whole ? euro(cleanText(whole) + "," + cleanText(fraction ?? "00")) : null;
}

function findListPrice(fragment: string) {
  const value = fragment.match(/class=["'][^"']*a-text-price[^"']*["'][\s\S]{0,500}?class=["'][^"']*a-offscreen[^"']*["'][^>]*>([^<]+)</i)?.[1];
  return euro(value);
}

function findDiscount(fragment: string) {
  const explicit =
    fragment.match(/(?:savingsPercentage|percentage-off|badge)[^>]*>[\s\S]{0,100}?-?\s*([0-9]{1,2})\s*%/i)?.[1] ??
    cleanText(fragment).match(/-\s*([0-9]{1,2})\s*%/)?.[1];
  const value = explicit ? Number(explicit) : null;
  return value && value > 0 && value < 100 ? value : null;
}

function findTitle(fragment: string, asin: string) {
  const candidates = [
    fragment.match(/<h2\b[^>]*>[\s\S]*?<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1],
    fragment.match(/<span\b[^>]*class=["'][^"']*(?:a-size-base-plus|a-text-normal)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1],
    fragment.match(/<a\b[^>]*title=["']([^"']+)["']/i)?.[1],
  ];
  for (const candidate of candidates) {
    const title = cleanText(candidate ?? "").slice(0, 300);
    if (title && title.length > 3) return title;
  }
  for (const [tag] of fragment.matchAll(/<img\b[^>]*>/gi)) {
    const alt = cleanText(attribute(tag, "alt")).slice(0, 300);
    if (alt && alt.length > 3) return alt;
  }
  return "Prodotto Amazon " + asin;
}

function imageFromSrcset(value: string) {
  const candidates = value
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .map((entry) => allowedAmazonImage(entry))
    .filter((entry): entry is string => Boolean(entry));
  return candidates.at(-1) ?? null;
}

function imageFromDynamic(value: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const candidates = Object.entries(parsed)
      .flatMap(([url, dimensions]) => {
        const image = allowedAmazonImage(url);
        if (!image || !Array.isArray(dimensions)) return [];
        const width = Number(dimensions[0]);
        const height = Number(dimensions[1]);
        return Number.isFinite(width) && Number.isFinite(height) ? [{ image, area: width * height }] : [];
      })
      .sort((a, b) => b.area - a.area);
    return candidates[0]?.image ?? null;
  } catch {
    return null;
  }
}

function findImage(fragment: string) {
  for (const [tag] of fragment.matchAll(/<img\b[^>]*>/gi)) {
    const dynamic = imageFromDynamic(attribute(tag, "data-a-dynamic-image"));
    if (dynamic) return dynamic;

    for (const name of ["srcset", "data-srcset"]) {
      const image = imageFromSrcset(attribute(tag, name));
      if (image) return image;
    }

    for (const name of ["src", "data-src", "data-lazy-src"]) {
      const image = allowedAmazonImage(attribute(tag, name));
      if (image) return image;
    }
  }
  return null;
}

const HAUL_CATEGORY_LABELS = [
  ["bestseller", "Bestseller"],
  ["best seller", "Bestseller"],
  ["marchi top", "Marchi top"],
  ["top brands", "Marchi top"],
  ["offerta top", "Offerta top"],
  ["offerte top", "Offerta top"],
  ["prezzi da urlo", "Prezzi da urlo"],
] as const;

function findHaulCategory(context: string) {
  const text = cleanText(context).toLowerCase();
  let best: { index: number; label: string } | null = null;
  for (const [needle, label] of HAUL_CATEGORY_LABELS) {
    const index = text.lastIndexOf(needle);
    if (index >= 0 && (!best || index > best.index)) best = { index, label };
  }
  return best?.label ?? null;
}

export type HaulProduct = {
  asin: string;
  title: string;
  imageUrl: string | null;
  currentPrice: number | null;
  listPrice: number | null;
  discountPercent: number | null;
  haulCategory: string | null;
};

export function parseHaulHtml(html: string): HaulProduct[] {
  const markers = [...html.matchAll(/data-asin=["']([A-Z0-9]{10})["']/gi)]
    .map((match) => ({ asin: match[1].toUpperCase(), index: match.index ?? 0 }))
    .filter((entry) => ASIN_RE.test(entry.asin));

  const unique = new Map<string, HaulProduct>();

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    if (unique.has(marker.asin)) continue;
    const end = markers[i + 1]?.index ?? Math.min(html.length, marker.index + 30000);
    const fragment = html.slice(marker.index, Math.min(end, marker.index + 30000));
    const categoryContext = html.slice(Math.max(0, marker.index - 16000), marker.index);
    const currentPrice = findCurrentPrice(fragment);
    let listPrice = findListPrice(fragment);
    if (listPrice != null && currentPrice != null && listPrice <= currentPrice) listPrice = null;
    let discountPercent = findDiscount(fragment);
    if (discountPercent == null && currentPrice != null && listPrice != null) {
      discountPercent = Math.round(((listPrice - currentPrice) / listPrice) * 100);
    }

    unique.set(marker.asin, {
      asin: marker.asin,
      title: findTitle(fragment, marker.asin),
      imageUrl: findImage(fragment),
      currentPrice,
      listPrice,
      discountPercent,
      haulCategory: findHaulCategory(categoryContext),
    });
  }

  // Some saved Amazon layouts omit data-asin on outer cards. Recover canonical /dp/ links as a fallback.
  for (const match of html.matchAll(/href=["'][^"']*\/dp\/([A-Z0-9]{10})(?:[/?#"'&]|$)[^"']*["']/gi)) {
    const asin = match[1].toUpperCase();
    if (unique.has(asin)) continue;
    const index = match.index ?? 0;
    const fragment = html.slice(Math.max(0, index - 4000), Math.min(html.length, index + 12000));
    const categoryContext = html.slice(Math.max(0, index - 16000), index);
    const currentPrice = findCurrentPrice(fragment);
    let listPrice = findListPrice(fragment);
    if (listPrice != null && currentPrice != null && listPrice <= currentPrice) listPrice = null;
    let discountPercent = findDiscount(fragment);
    if (discountPercent == null && currentPrice != null && listPrice != null) {
      discountPercent = Math.round(((listPrice - currentPrice) / listPrice) * 100);
    }
    unique.set(asin, {
      asin,
      title: findTitle(fragment, asin),
      imageUrl: findImage(fragment),
      currentPrice,
      listPrice,
      discountPercent,
      haulCategory: findHaulCategory(categoryContext),
    });
  }

  return [...unique.values()];
}

export function isAmazonHaulUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["amazon.it", "www.amazon.it"].includes(url.hostname.toLowerCase()) && url.pathname.startsWith("/haul");
  } catch {
    return false;
  }
}


export function isAmazonOutletUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["amazon.it", "www.amazon.it"].includes(url.hostname.toLowerCase())) return false;
    const node = url.searchParams.get("node");
    return url.pathname === "/b" && node === "21955579031";
  } catch {
    return false;
  }
}


export function isAmazonDealsUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["amazon.it", "www.amazon.it"].includes(url.hostname.toLowerCase())) return false;
    return url.pathname === "/deals" || url.pathname === "/offerte-lampo-del-giorno/s";
  } catch {
    return false;
  }
}
