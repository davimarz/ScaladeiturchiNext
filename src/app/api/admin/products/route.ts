import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirect303(path: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { location: path },
  });
}

function validAmazonUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      host === "amzn.to" ||
      host === "link.amazon" ||
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
    return redirect303("/admin?error=session");
  }

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim().slice(0, 300);
  const affiliateUrl = String(form.get("affiliate_url") ?? "").trim();

  if (!title || !validAmazonUrl(affiliateUrl)) {
    return redirect303("/admin?manual=invalid");
  }

  const asin = "MAN-" + createHash("sha256").update(affiliateUrl).digest("hex").slice(0, 16);
  const now = new Date().toISOString();

  try {
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
        source: "manual-amazon-link",
        price_verified_at: null,
        active: true,
        featured: false,
        updated_at: now,
      }),
    });

    return redirect303("/admin?manual=success");
  } catch {
    return redirect303("/admin?manual=error");
  }
}
