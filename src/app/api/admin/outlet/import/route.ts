import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../../lib/admin-auth";
import { isSameOrigin } from "../../../../../lib/admin-request";
import { isAmazonOutletUrl, parseHaulHtml } from "../../../../../lib/haul-import";
import { supabaseAdminFetch } from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_OUTLET_URL = "https://www.amazon.it/b?_encoding=UTF8&node=21955579031&ref=it_outsbcd_9&ref_=cct_cg_OutletIT_1b1&pf_rd_p=944e3502-a5e7-48c3-a5d6-330210c1b635&pf_rd_r=8VJYFFY6AFE33ERXY91J";
const PARTNER_TAG = "eiapromo-21";
const MAX_HTML_BYTES = 15 * 1024 * 1024;

function redirect(status: string, count?: number) {
  const suffix = count == null ? "" : `&outlet_count=${count}`;
  return new Response(null, { status: 303, headers: { location: `/admin?outlet_import=${status}${suffix}` } });
}

function affiliateUrl(asin: string) {
  const url = new URL(`https://www.amazon.it/dp/${asin}`);
  url.searchParams.set("tag", process.env.AMAZON_PARTNER_TAG || PARTNER_TAG);
  return url.toString();
}

async function fetchOutletHtml(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
    headers: {
      accept: "text/html",
      "accept-language": "it-IT,it;q=0.9",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
    },
  });
  if (!response.ok) throw new Error("Amazon HTTP " + response.status);
  if (!response.headers.get("content-type")?.includes("text/html")) throw new Error("Amazon response is not HTML");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_HTML_BYTES) throw new Error("Amazon OUTLET page too large");
  return new TextDecoder().decode(buffer);
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value)) return redirect("session");

  const form = await request.formData();
  const sourceUrl = String(form.get("outlet_url") ?? DEFAULT_OUTLET_URL).trim() || DEFAULT_OUTLET_URL;
  if (!isAmazonOutletUrl(sourceUrl)) return redirect("invalid-url");

  const htmlFile = form.get("html_file");
  let html = "";

  try {
    if (htmlFile instanceof File && htmlFile.size > 0) {
      if (htmlFile.size > MAX_HTML_BYTES || !/\.html?$/i.test(htmlFile.name)) return redirect("invalid-file");
      html = await htmlFile.text();
    } else {
      html = await fetchOutletHtml(sourceUrl);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Amazon OUTLET fetch failed";
    console.warn("outlet-import-fetch", message);
    if (/HTTP 403|HTTP 429|HTTP 503|blocked/i.test(message)) return redirect("blocked");
    return redirect("fetch-error");
  }

  const parsed = parseHaulHtml(html);
  if (!parsed.length) return redirect("empty");

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
      }>>(`products?asin=in.(${ids.join(",")})&select=asin,title,image_url,current_price,list_price,discount_percent,price_verified_at`);
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
        source: "amazon-outlet-html",
        in_haul: existing?.in_haul ?? false,
        in_outlet: true,
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
      body: JSON.stringify([{ key: "outlet_source_url", value: sourceUrl }]),
    });

    return redirect("success", rows.length);
  } catch (error) {
    console.error("outlet-import-save", error instanceof Error ? error.message : error);
    return redirect("save-error");
  }
}
