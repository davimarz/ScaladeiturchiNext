import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validAmazonUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      host === "amzn.to" ||
      host === "amazon.it" ||
      host.endsWith(".amazon.it")
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const session = request.cookies.get(adminCookie.name)?.value;
  if (!verifyAdminSessionValue(session)) {
    return NextResponse.redirect(new URL("/admin?error=session", request.url), 303);
  }

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim().slice(0, 300);
  const affiliateUrl = String(form.get("affiliate_url") ?? "").trim();

  if (!title || !validAmazonUrl(affiliateUrl)) {
    return NextResponse.redirect(new URL("/admin?manual=invalid", request.url), 303);
  }

  const asin = "MAN-" + createHash("sha256").update(affiliateUrl).digest("hex").slice(0, 16);
  const now = new Date().toISOString();

  await supabaseAdminFetch("products?on_conflict=asin", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      asin,
      title,
      category_id: null,
      image_url: null,
      amazon_url: affiliateUrl,
      affiliate_url: affiliateUrl,
      current_price: null,
      list_price: null,
      currency: "EUR",
      discount_percent: null,
      prime: null,
      source: "manual-sitestripe",
      price_verified_at: null,
      active: true,
      featured: false,
      updated_at: now,
    }),
  });

  return NextResponse.redirect(new URL("/admin?manual=success", request.url), 303);
}
