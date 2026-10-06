import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../../lib/admin-auth";
import { isSameOrigin } from "../../../../../lib/admin-request";
import { isAmazonBestsellersUrl, parseHaulHtml } from "../../../../../lib/haul-import";
import { fetchAmazonBestsellersWithFullScroll } from "../../../../../lib/haul-browser";
import { supabaseAdminFetch } from "../../../../../lib/supabase/admin";
import { syncCatalogPricesByMembership } from "../../../../../lib/catalog-sync";
import { needsProductTitleEnrichment } from "../../../../../lib/amazon-page-offer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_BESTSELLER_URL = "https://www.amazon.it/gp/bestsellers/?ref_=nav_cs_bestsellers";
const PARTNER_TAG = "eiapromo-21";
const MAX_HTML_BYTES = 40 * 1024 * 1024;

function redirect(
  status: string,
  count?: number,
  priceSeen?: number,
  priceUpdated?: number,
  priceUnchanged?: number,
  priceFailed?: number,
  imagesRecovered?: number,
  imagesMissing?: number,
  target = "/admin/bestseller",
) {
  const params = new URLSearchParams({ bestseller_import: status });
  if (count != null) params.set("bestseller_count", String(count));
  if (priceSeen != null) params.set("price_seen", String(priceSeen));
  if (priceUpdated != null) params.set("price_updated", String(priceUpdated));
  if (priceUnchanged != null) params.set("price_unchanged", String(priceUnchanged));
  if (priceFailed != null) params.set("price_failed", String(priceFailed));
  if (imagesRecovered != null) params.set("images_recovered", String(imagesRecovered));
  if (imagesMissing != null) params.set("images_missing", String(imagesMissing));
  return new Response(null, { status: 303, headers: { location: `${target}?${params.toString()}` } });
}

function affiliateUrl(asin: string) {
  const url = new URL(`https://www.amazon.it/dp/${asin}`);
  url.searchParams.set("tag", process.env.AMAZON_PARTNER_TAG || PARTNER_TAG);
  return url.toString();
}

async function fetchDirectBestsellerHtml(sourceUrl: string) {
  try {
    const response = await fetch(sourceUrl, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
        "accept-language": "it-IT,it;q=0.9,en;q=0.7",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });
    if (!response.ok) return null;
    const html = await response.text();
    if (/robot check|captcha|\/errors\/validateCaptcha|automated access/i.test(html)) return null;
    return parseHaulHtml(html).length >= 3 ? html : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value)) return redirect("session");

  const form = await request.formData();
  const returnTo = form.get("return_to") === "/admin" ? "/admin" : "/admin/bestseller";
  const finish = (
    status: string,
    count?: number,
    priceSeen?: number,
    priceUpdated?: number,
    priceUnchanged?: number,
    priceFailed?: number,
    imagesRecovered?: number,
    imagesMissing?: number,
  ) => redirect(status, count, priceSeen, priceUpdated, priceUnchanged, priceFailed, imagesRecovered, imagesMissing, returnTo);

  const sourceUrl = String(form.get("bestseller_url") ?? DEFAULT_BESTSELLER_URL).trim() || DEFAULT_BESTSELLER_URL;
  if (!isAmazonBestsellersUrl(sourceUrl)) return finish("invalid-url");

  const htmlFile = form.get("html_file");
  let html = "";

  try {
    if (htmlFile instanceof File && htmlFile.size > 0) {
      if (htmlFile.size > MAX_HTML_BYTES || !/\.html?$/i.test(htmlFile.name)) return finish("invalid-file");
      html = await htmlFile.text();
    } else {
      html = await fetchDirectBestsellerHtml(sourceUrl) ?? "";
      if (!html) {
        const browserResult = await fetchAmazonBestsellersWithFullScroll(sourceUrl);
        html = browserResult.html;
        console.info("bestseller-full-scroll", { asinCount: browserResult.asinCount, scrolls: browserResult.scrolls });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Amazon Bestseller browser scan failed";
    console.warn("bestseller-import-browser", message);
    try {
      const prices = await syncCatalogPricesByMembership("bestseller");
      return finish("price-only", undefined, prices.productsSeen, prices.productsChanged, prices.productsUnchanged, prices.productsFailed, prices.imagesRecovered, prices.imagesMissing);
    } catch {
      if (/HTTP 403|HTTP 429|HTTP 503|blocked|captcha|robot/i.test(message)) return finish("blocked");
      return finish("browser-error");
    }
  }

  const parsed = parseHaulHtml(html);
  if (!parsed.length) {
    try {
      const prices = await syncCatalogPricesByMembership("bestseller");
      return finish("price-only", 0, prices.productsSeen, prices.productsChanged, prices.productsUnchanged, prices.productsFailed, prices.imagesRecovered, prices.imagesMissing);
    } catch {
      return finish("empty");
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
      in_bestseller: boolean;
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
        in_bestseller: boolean;
      }>>(`products?asin=in.(${ids.join(",")})&select=asin,title,image_url,current_price,list_price,discount_percent,price_verified_at,category_id,in_haul,in_offerte_lambo,in_bestseller`);
      existing.forEach((product) => existingByAsin.set(product.asin, product));
    }

    const now = new Date().toISOString();
    const rows = parsed.map((product, index) => {
      const existing = existingByAsin.get(product.asin);
      const badTitle = needsProductTitleEnrichment(product.title);
      const hasCurrent = product.currentPrice != null;
      return {
        asin: product.asin,
        title: badTitle && existing?.title && !needsProductTitleEnrichment(existing.title) ? existing.title : product.title,
        category_id: existing?.category_id ?? null,
        image_url: product.imageUrl ?? existing?.image_url ?? null,
        amazon_url: `https://www.amazon.it/dp/${product.asin}`,
        affiliate_url: affiliateUrl(product.asin),
        current_price: product.currentPrice ?? existing?.current_price ?? null,
        list_price: product.listPrice ?? existing?.list_price ?? null,
        currency: "EUR",
        discount_percent: product.discountPercent ?? existing?.discount_percent ?? null,
        prime: null,
        source: "amazon-bestseller-html",
        in_haul: existing?.in_haul ?? false,
        in_offerte_lambo: existing?.in_offerte_lambo ?? false,
        in_bestseller: true,
        bestseller_rank: index + 1,
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
      body: JSON.stringify([{ key: "bestseller_source_url", value: sourceUrl }]),
    });

    const prices = await syncCatalogPricesByMembership("bestseller");
    return finish("success", rows.length, prices.productsSeen, prices.productsChanged, prices.productsUnchanged, prices.productsFailed, prices.imagesRecovered, prices.imagesMissing);
  } catch (error) {
    console.error("bestseller-import-save", error instanceof Error ? error.message : error);
    return finish("save-error");
  }
}
