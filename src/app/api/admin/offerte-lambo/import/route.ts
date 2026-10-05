import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../../lib/admin-auth";
import { isSameOrigin } from "../../../../../lib/admin-request";
import { isAmazonDealsUrl, parseHaulHtml } from "../../../../../lib/haul-import";
import { fetchAmazonSearchWithFullScroll } from "../../../../../lib/haul-browser";
import { supabaseAdminFetch } from "../../../../../lib/supabase/admin";
import { syncCatalogPricesByMembership } from "../../../../../lib/catalog-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_LAMBO_URL = "https://www.amazon.it/offerte-lampo-del-giorno/s?k=offerte+lampo+del+giorno";
const PARTNER_TAG = "eiapromo-21";
const MAX_HTML_BYTES = 40 * 1024 * 1024;

function redirect(status: string, count?: number, priceSeen?: number, priceUpdated?: number) {
  const params = new URLSearchParams({ lambo_import: status });
  if (count != null) params.set("lambo_count", String(count));
  if (priceSeen != null) params.set("price_seen", String(priceSeen));
  if (priceUpdated != null) params.set("price_updated", String(priceUpdated));
  return new Response(null, { status: 303, headers: { location: `/admin/offerte-lambo?${params.toString()}` } });
}

function affiliateUrl(asin: string) {
  const url = new URL(`https://www.amazon.it/dp/${asin}`);
  url.searchParams.set("tag", process.env.AMAZON_PARTNER_TAG || PARTNER_TAG);
  return url.toString();
}

async function fetchDirectAmazonSearchHtml(sourceUrl: string) {
  const urls = Array.from(new Set([
    sourceUrl,
    "https://www.amazon.it/s?k=offerte+lampo+del+giorno",
  ]));

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
          "accept-language": "it-IT,it;q=0.9,en;q=0.7",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        },
      });
      if (!response.ok) continue;
      const html = await response.text();
      if (/robot check|captcha|\/errors\/validateCaptcha|automated access/i.test(html)) continue;
      const products = parseHaulHtml(html);
      if (products.length >= 3) {
        console.info("offerte-lambo-direct-fetch", { products: products.length, url });
        return html;
      }
    } catch (error) {
      console.warn("offerte-lambo-direct-fetch", error instanceof Error ? error.message : error);
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value)) return redirect("session");

  const form = await request.formData();
  const sourceUrl = String(form.get("lambo_url") ?? DEFAULT_LAMBO_URL).trim() || DEFAULT_LAMBO_URL;
  if (!isAmazonDealsUrl(sourceUrl)) return redirect("invalid-url");

  const htmlFile = form.get("html_file");
  let html = "";

  try {
    if (htmlFile instanceof File && htmlFile.size > 0) {
      if (htmlFile.size > MAX_HTML_BYTES || !/\.html?$/i.test(htmlFile.name)) return redirect("invalid-file");
      html = await htmlFile.text();
    } else {
      const directHtml = await fetchDirectAmazonSearchHtml(sourceUrl);
      if (directHtml) {
        html = directHtml;
      } else {
        const browserResult = await fetchAmazonSearchWithFullScroll(sourceUrl);
        html = browserResult.html;
        console.info("offerte-lambo-full-scroll", { asinCount: browserResult.asinCount, scrolls: browserResult.scrolls });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Amazon Offerte Lampo browser scan failed";
    console.warn("offerte-lambo-import-browser", message);
    try {
      const prices = await syncCatalogPricesByMembership("offerte-lambo");
      return redirect("price-only", undefined, prices.productsSeen, prices.productsUpdated);
    } catch (priceError) {
      console.warn("offerte-lambo-price-refresh", priceError instanceof Error ? priceError.message : priceError);
      if (/HTTP 403|HTTP 429|HTTP 503|blocked|captcha|robot/i.test(message)) return redirect("blocked");
      return redirect("browser-error");
    }
  }

  const parsed = parseHaulHtml(html);
  if (!parsed.length) {
    try {
      const prices = await syncCatalogPricesByMembership("offerte-lambo");
      return redirect("price-only", 0, prices.productsSeen, prices.productsUpdated);
    } catch {
      return redirect("empty");
    }
  }

  try {
    const existingByAsin = new Map<string, {
      title: string;
      image_url: string | null;
      current_price: number | null;
      list_price: number | null;
      discount_percent: number | null;
      price_verified_at: string | null;
      category_id: string | null;
      in_haul: boolean;
      in_offerte_lambo: boolean;
    }>();

    for (let offset = 0; offset < parsed.length; offset += 40) {
      const ids = parsed.slice(offset, offset + 40).map((product) => product.asin);
      const existing = await supabaseAdminFetch<Array<{
        asin: string;
        title: string;
        image_url: string | null;
        current_price: number | null;
        list_price: number | null;
        discount_percent: number | null;
        price_verified_at: string | null;
        category_id: string | null;
        in_haul: boolean;
        in_offerte_lambo: boolean;
      }>>(`products?asin=in.(${ids.join(",")})&select=asin,title,image_url,current_price,list_price,discount_percent,price_verified_at,category_id,in_haul,in_offerte_lambo`);
      existing.forEach((product) => existingByAsin.set(product.asin, product));
    }

    const now = new Date().toISOString();
    const rows = parsed.map((product) => {
      const existing = existingByAsin.get(product.asin);
      const hasCurrent = product.currentPrice != null;
      return {
        asin: product.asin,
        title: product.title.startsWith("Prodotto Amazon ") && existing?.title ? existing.title : product.title,
        category_id: existing?.category_id ?? null,
        image_url: product.imageUrl ?? existing?.image_url ?? null,
        amazon_url: `https://www.amazon.it/dp/${product.asin}`,
        affiliate_url: affiliateUrl(product.asin),
        current_price: product.currentPrice ?? existing?.current_price ?? null,
        list_price: product.listPrice ?? existing?.list_price ?? null,
        currency: "EUR",
        discount_percent: product.discountPercent ?? existing?.discount_percent ?? null,
        prime: null,
        source: "amazon-offerte-lambo-html",
        in_haul: existing?.in_haul ?? false,
        in_offerte_lambo: true,
        price_verified_at: hasCurrent ? now : existing?.price_verified_at ?? null,
        active: true,
        featured: false,
        updated_at: now,
      };
    });

    for (let offset = 0; offset < rows.length; offset += 50) {
      await supabaseAdminFetch("products?on_conflict=asin", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows.slice(offset, offset + 50)),
      });
    }

    await supabaseAdminFetch("site_settings?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ key: "offerte_lambo_source_url", value: sourceUrl }]),
    });

    const prices = await syncCatalogPricesByMembership("offerte-lambo");
    return redirect("success", rows.length, prices.productsSeen, prices.productsUpdated);
  } catch (error) {
    console.error("offerte-lambo-import-save", error instanceof Error ? error.message : error);
    return redirect("save-error");
  }
}
