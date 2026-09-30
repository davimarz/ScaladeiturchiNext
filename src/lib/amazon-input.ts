const AMAZON_HOSTS = new Set(["amazon.it", "www.amazon.it", "amzn.to", "link.amazon"]);
const IMAGE_HOSTS = new Set(["m.media-amazon.com", "images-na.ssl-images-amazon.com", "images-eu.ssl-images-amazon.com", "images-fe.ssl-images-amazon.com"]);

export function allowedAmazonUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && AMAZON_HOSTS.has(url.hostname.toLowerCase()) ? url : null;
  } catch { return null; }
}
export function allowedAmazonImage(value: string): string | null {
  try {
    const url = new URL(value.startsWith("//") ? "https:" + value : value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && IMAGE_HOSTS.has(url.hostname.toLowerCase()) ? url.toString() : null;
  } catch { return null; }
}
function decodeEntities(value: string) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
    const names: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" };
    if (names[entity.toLowerCase()]) return names[entity.toLowerCase()];
    const code = entity.slice(2, -1).toLowerCase();
    const n = code.startsWith("x") ? parseInt(code.slice(1), 16) : parseInt(code, 10);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "";
  });
}
function attribute(tag: string, name: string) {
  return decodeEntities(tag.match(new RegExp("\\s" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"))?.slice(1).find((v) => v !== undefined) ?? "");
}
export function parseAmazonInput(input: string) {
  const value = input.trim();
  if (!value.includes("<")) return { amazonUrl: value, imageUrl: null as string | null };
  const links = [...value.matchAll(/<a\b[^>]*>/gi)].map((m) => attribute(m[0], "href"));
  const fallback = [...value.matchAll(/https:\/\/(?:www\.)?(?:amazon\.it|amzn\.to|link\.amazon)\/[^\s"'<>]+/gi)].map((m) => decodeEntities(m[0]));
  const amazonUrl = [...links, ...fallback].find((link) => allowedAmazonUrl(link)) ?? "";
  let imageUrl: string | null = null;
  for (const [tag] of value.matchAll(/<img\b[^>]*>/gi)) {
    const width = Number(attribute(tag, "width"));
    const height = Number(attribute(tag, "height"));
    if ((width > 0 && width <= 1) || (height > 0 && height <= 1)) continue;
    const candidate = allowedAmazonImage(attribute(tag, "src") || attribute(tag, "data-src"));
    if (candidate) { imageUrl = candidate; break; }
  }
  return { amazonUrl, imageUrl };
}
export async function resolveAmazonUrl(input: string, fetcher: typeof fetch = fetch) {
  let current = input;
  for (let i = 0; i <= 5; i++) {
    const url = allowedAmazonUrl(current);
    if (!url) throw new Error("Redirect Amazon non consentito");
    if (url.hostname === "amazon.it" || url.hostname === "www.amazon.it") return url;
    if (i === 5) break;
    const response = await fetcher(url, { method: "HEAD", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location) break;
    current = new URL(location, url).toString();
  }
  throw new Error("Link corto Amazon non risolto");
}
export function extractAsin(url: URL) {
  return url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1]?.toUpperCase() ?? null;
}
export function deriveTitle(url: URL, asin: string) {
  const match = url.pathname.match(/\/([^/]+)\/dp\//i);
  if (match) {
    try { return decodeURIComponent(match[1]).replace(/[-_]+/g, " ").trim().slice(0, 300) || "Prodotto Amazon " + asin; }
    catch { /* A malformed slug must not prevent saving a valid ASIN. */ }
  }
  return "Prodotto Amazon " + asin;
}

/** Read only the main image of the requested product, never recommendation images. */
export function extractAmazonProductImage(html: string, asin: string) {
  const asinInput = [...html.matchAll(/<input\b[^>]*>/gi)].find(([tag]) => attribute(tag, "id") === "ASIN" || attribute(tag, "name") === "ASIN");
  if (asinInput) {
    const pageAsin = attribute(asinInput[0], "value").toUpperCase();
    if (pageAsin && pageAsin !== asin.toUpperCase()) return null;
  }
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!["landingImage", "imgBlkFront", "mainImage"].includes(attribute(tag, "id"))) continue;
    const hires = allowedAmazonImage(attribute(tag, "data-old-hires"));
    if (hires) return hires;
    try {
      const dynamic = JSON.parse(attribute(tag, "data-a-dynamic-image")) as Record<string, unknown>;
      const candidates = Object.entries(dynamic).flatMap(([url, dimensions]) => {
        const image = allowedAmazonImage(url);
        if (!image || !Array.isArray(dimensions)) return [];
        const width = Number(dimensions[0]), height = Number(dimensions[1]);
        return Number.isFinite(width) && Number.isFinite(height) && width > 1 && height > 1 ? [{ image, area: width * height }] : [];
      }).sort((a, b) => b.area - a.area);
      if (candidates[0]) return candidates[0].image;
    } catch { /* Some Amazon templates have only src. */ }
    const src = allowedAmazonImage(attribute(tag, "src"));
    if (src) return src;
  }
  // A fallback is safe only when the document explicitly identifies this ASIN.
  if (asinInput) {
    for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
      if (attribute(tag, "property") === "og:image") {
        const image = allowedAmazonImage(attribute(tag, "content"));
        if (image) return image;
      }
    }
  }
  return null;
}

export async function fetchAmazonProductImage(asin: string, fetcher: typeof fetch = fetch) {
  if (!/^[A-Z0-9]{10}$/i.test(asin)) throw new Error("Invalid product ASIN");
  let url = new URL("https://www.amazon.it/dp/" + asin.toUpperCase());
  const signal = AbortSignal.timeout(10000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!allowedAmazonUrl(url.href) || !["amazon.it", "www.amazon.it"].includes(url.hostname)) throw new Error("Unapproved Amazon image redirect");
    const redirectedAsin = extractAsin(url);
    if (redirectedAsin && redirectedAsin !== asin.toUpperCase()) throw new Error("Amazon redirected to another product");
    const response = await fetcher(url, {
      redirect: "manual", cache: "no-store", signal,
      headers: { accept: "text/html", "accept-language": "it-IT,it;q=0.9", "user-agent": "ScalaDeiTurchiCatalog/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Amazon image redirect limit");
      await response.body?.cancel();
      url = new URL(location, url);
      continue;
    }
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Amazon product page unavailable");
    const reader = response.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let bytes = 0, html = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Amazon product page too large");
        }
        html += decoder.decode(value, { stream: true });
        // Amazon pages can contain megabytes of recommendations after the product.
        // Stop once both the ASIN and the main image have been received.
        if (/<input\b[^>]*(?:id|name)\s*=\s*["']ASIN["'][^>]*>/i.test(html)) {
          const image = extractAmazonProductImage(html, asin);
          if (image) { await reader.cancel(); return image; }
        }
      }
      html += decoder.decode();
    } finally { reader.releaseLock(); }
    if (/\/errors\/validateCaptcha|<title>\s*Robot Check/i.test(html)) throw new Error("Amazon blocked the product page");
    return extractAmazonProductImage(html, asin);
  }
  return null;
}
