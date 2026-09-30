import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirect303(path: string) {
  return new Response(null, {
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

function validImageUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

type ExistingProduct = {
  id: string;
  image_url: string | null;
};

export async function POST(request: NextRequest) {
  const session = request.cookies.get(adminCookie.name)?.value;
  if (!verifyAdminSessionValue(session)) {
    return redirect303("/admin?error=session");
  }

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim().slice(0, 300);
  const affiliateUrl = String(form.get("affiliate_url") ?? "").trim();
  const imageUrl = String(form.get("image_url") ?? "").trim();

  if (!title || !validAmazonUrl(affiliateUrl) || !validImageUrl(imageUrl)) {
    return redirect303("/admin?manual=invalid");
  }

  const asin = "MAN-" + createHash("sha256").update(affiliateUrl).digest("hex").slice(0, 16);
  const now = new Date().toISOString();

  try {
    const existing = await supabaseAdminFetch<ExistingProduct[]>(
      `products?affiliate_url=eq.${encodeURIComponent(affiliateUrl)}&select=id,image_url&limit=1`,
    );

    const payload = {
      title,
      image_url: imageUrl || existing[0]?.image_url || null,
      amazon_url: affiliateUrl,
      affiliate_url: affiliateUrl,
      source: "manual-amazon-link",
      active: true,
      updated_at: now,
    };

    if (existing[0]?.id) {
      await supabaseAdminFetch(
        `products?id=eq.${encodeURIComponent(existing[0].id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(payload),
        },
      );
      return redirect303("/admin?manual=updated");
    }

    await supabaseAdminFetch("products", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        asin,
        ...payload,
        category_id: null,
        current_price: null,
        list_price: null,
        currency: "EUR",
        discount_percent: null,
        prime: null,
        price_verified_at: null,
        featured: false,
      }),
    });

    return redirect303("/admin?manual=success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "manual-save-error";
    console.error("manual-product-save", message);
    return redirect303("/admin?manual=error");
  }
}
