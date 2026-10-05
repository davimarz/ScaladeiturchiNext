import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../../lib/admin-auth";
import { isSameOrigin } from "../../../../../lib/admin-request";
import { isAmazonHaulUrl, parseHaulHtml } from "../../../../../lib/haul-import";
import { fetchHaulWithFullScroll } from "../../../../../lib/haul-browser";
import { supabaseAdminFetch } from "../../../../../lib/supabase/admin";
import { syncCatalogPricesByMembership } from "../../../../../lib/catalog-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const DEFAULT_HAUL_URL = "https://www.amazon.it/haul/store?ref_=nav_cs_hul_disb";
const PARTNER_TAG = "eiapromo-21";
const MAX_HTML_BYTES = 40 * 1024 * 1024;

function redirect(status: string, count?: number, priceSeen?: number, priceUpdated?: number) {
  const params = new URLSearchParams({ haul_import: status });
  if (count != null) params.set("haul_count", String(count));
  if (priceSeen != null) params.set("price_seen", String(priceSeen));
  if (priceUpdated != null) params.set("price_updated", String(priceUpdated));
  return new Response(null, { status: 303, headers: { location: `/admin/haul?${params.toString()}` } });
}

function affiliateUrl(asin: string) {
  const url = new URL(`https://www.amazon.it/dp/${asin}`);
  url.searchParams.set("tag", process.env.AMAZON_PARTNER_TAG || PARTNER_TAG);
  return url.toString();
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value)) return redirect("session");

  const form = await request.formData();
  const sourceUrl = String(form.get("haul_url") ?? DEFAULT_HAUL_URL).trim() || DEFAULT_HAUL_URL;
  if (!isAmazonHaulUrl(sourceUrl)) return redirect("invalid-url");

  const htmlFile = form.get("html_file");
  let html = "";

  try {
    if (htmlFile instanceof File && htmlFile.size > 0) {
      if (htmlFile.size > MAX_HTML_BYTES || !/\.html?$/i.test(htmlFile.name)) return redirect("invalid-file");
      html = await htmlFile.text();
    } else {
      const browserResult = await fetchHaulWithFullScroll(sourceUrl);
      html = browserResult.html;
      console.info("haul-full-scroll", { asinCount: browserResult.asinCount, scrolls: browserResult.scrolls });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Amazon HAUL browser scan failed";
    console.warn("haul-import-browser", message);
    try {
      const prices = await syncCatalogPricesByMembership("haul");
      return redirect("price-only", undefined, prices.productsSeen, prices.productsUpdated);
    } catch (priceError) {
      console.warn("haul-price-refresh", priceError instanceof Error ? priceError.message : priceError);
      if (/HTTP 403|HTTP 429|HTTP 503|blocked|captcha|robot/i.test(message)) return redirect("blocked");
      return redirect("browser-error");
    }
  }

  const parsed = parseHaulHtml(html);
  if (!parsed.length) {
    try {
      const prices = await syncCatalogPricesByMembership("haul");
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
      in_outlet: boolean;
      haul_category: string | null;
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
        in_outlet: boolean;
        haul_category: string | null;
      }>>(`products?asin=in.(${ids.join(",")})&select=asin,title,image_url,current_price,list_price,discount_percent,price_verified_at,category_id,in_haul,in_outlet,haul_category`);
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
        source: "amazon-haul-html",
        in_haul: true,
        in_outlet: existing?.in_outlet ?? false,
        haul_category: product.haulCategory ?? existing?.haul_category ?? null,
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
      body: JSON.stringify([{ key: "haul_source_url", value: sourceUrl }]),
    });

    const prices = await syncCatalogPricesByMembership("haul");
    return redirect("success", rows.length, prices.productsSeen, prices.productsUpdated);
  } catch (error) {
    console.error("haul-import-save", error instanceof Error ? error.message : error);
    return redirect("save-error");
  }
}
