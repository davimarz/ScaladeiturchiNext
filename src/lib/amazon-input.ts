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
