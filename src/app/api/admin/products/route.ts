import { NextRequest } from "next/server";
import { allowedAmazonUrl, parseAmazonInput, resolveAmazonUrl, extractAsin, deriveTitle, fetchAmazonProductImage } from "../../../../lib/amazon-input";
import { isSameOrigin } from "../../../../lib/admin-request";
import { isUuid } from "../../../../lib/product-validation";
import { adminCookie, verifyAdminSessionValue } from "../../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../../lib/supabase/admin";
import { uploadProductImage } from "../../../../lib/supabase/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PARTNER_TAG = "eiapromo-21";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function redirect303(path: string) {
  return new Response(null, {
    status: 303,
    headers: { location: path },
  });
}

function buildAffiliateUrl(asin: string) {
  const url = new URL(`https://www.amazon.it/dp/${asin}`);
  url.searchParams.set("tag", process.env.AMAZON_PARTNER_TAG || PARTNER_TAG);
  return url.toString();
}

type ExistingProduct = {
  id: string;
  image_url: string | null;
  title: string;
  category_id: string | null;
  source: string | null;
};

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const session = request.cookies.get(adminCookie.name)?.value;
  if (!verifyAdminSessionValue(session)) {
    return redirect303("/admin?error=session");
  }

  const form = await request.formData();
  const rawInput = String(form.get("amazon_input") ?? "").trim();
  if (rawInput.length > 100_000) return redirect303("/admin?manual=invalid");
  const submittedTitle = String(form.get("title") ?? "").trim();
  const categoryId = String(form.get("category_id") ?? "").trim();
  if (submittedTitle.length > 300 || (categoryId && !isUuid(categoryId))) return redirect303("/admin?manual=invalid");
  const image = form.get("image");
  const parsed = parseAmazonInput(rawInput);
  const submittedUrl = parsed.amazonUrl;

  if (!allowedAmazonUrl(submittedUrl)) {
    return redirect303("/admin?manual=invalid");
  }

  if (image instanceof File && image.size > 0) {
    if (!IMAGE_TYPES.has(image.type) || image.size > MAX_IMAGE_BYTES) {
      return redirect303("/admin?manual=image-invalid");
    }
  }

  try {
    if (categoryId) {
      const categories = await supabaseAdminFetch<Array<{id:string}>>(`categories?id=eq.${categoryId}&active=eq.true&select=id&limit=1`);
      if (!categories.length) return redirect303("/admin?manual=invalid");
    }
    const resolved = await resolveAmazonUrl(submittedUrl);
    const host = resolved.hostname.toLowerCase();

    if (host !== "amazon.it" && host !== "www.amazon.it") {
      return redirect303("/admin?manual=unresolved");
    }

    const asin = extractAsin(resolved);
    if (!asin) {
      return redirect303("/admin?manual=noasin");
    }

    const affiliateUrl = buildAffiliateUrl(asin);
    const derivedTitle = deriveTitle(resolved, asin);
    const now = new Date().toISOString();

    const existing = await supabaseAdminFetch<ExistingProduct[]>(
      `products?asin=eq.${encodeURIComponent(asin)}&select=id,image_url,title,category_id,source&limit=1`,
    );

    let imageUrl = parsed.imageUrl || existing[0]?.image_url || null;

    if (image instanceof File && image.size > 0) {
      imageUrl = await uploadProductImage(image, asin);
    } else if (!imageUrl) {
      try {
        imageUrl = await fetchAmazonProductImage(asin);
      } catch (error) {
        console.warn("amazon-product-image", error instanceof Error ? error.message : "unavailable");
      }
    }

    const payload = {
      title: submittedTitle || existing[0]?.title || derivedTitle,
      category_id: categoryId || existing[0]?.category_id || null,
      amazon_url: `https://www.amazon.it/dp/${asin}`,
      affiliate_url: affiliateUrl,
      image_url: imageUrl,
      source: parsed.imageUrl ? "manual-sitestripe-image" : existing[0]?.source || "manual-amazon-link",
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
      return redirect303(imageUrl ? "/admin?manual=updated-image" : "/admin?manual=updated-no-image");
    }

    await supabaseAdminFetch("products", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        asin,
        ...payload,
        current_price: null,
        list_price: null,
        currency: "EUR",
        discount_percent: null,
        prime: null,
        price_verified_at: null,
        featured: false,
      }),
    });

    return redirect303(imageUrl ? "/admin?manual=success-image" : "/admin?manual=success-no-image");
  } catch (error) {
    const message = error instanceof Error ? error.message : "manual-save-error";
    console.error("manual-product-save", message);
    return redirect303("/admin?manual=error");
  }
}
