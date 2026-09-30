import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PARTNER_TAG = "eiapromo-21";
const AMAZON_HOSTS = new Set(["amazon.it", "www.amazon.it", "amzn.to", "link.amazon"]);

function redirect303(path: string) {
  return new Response(null, {
    status: 303,
    headers: { location: path },
  });
}

function isAllowedAmazonUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && AMAZON_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function resolveAmazonUrl(input: string) {
  let current = input;

  for (let i = 0; i < 5; i += 1) {
    const url = new URL(current);
    const host = url.hostname.toLowerCase();

    if (host === "amazon.it" || host === "www.amazon.it") {
      return url;
    }

    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      cache: "no-store",
      headers: {
        "user-agent": "Mozilla/5.0 ScalaDeiTurchiCatalog/1.0",
      },
    });

    const location = response.headers.get("location");
    if (!location) break;

    current = new URL(location, url).toString();
  }

  return new URL(current);
}

function extractAsin(url: URL) {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})(?:[/?]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = url.pathname.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }

  return null;
}

function deriveTitle(url: URL, asin: string) {
  const parts = url.pathname.split("/").filter(Boolean);
  const dpIndex = parts.findIndex((part) => part.toLowerCase() === "dp");
  const productIndex = parts.findIndex((part) => part.toLowerCase() === "product");
  const marker = dpIndex >= 0 ? dpIndex : productIndex;

  if (marker > 0) {
    const raw = decodeURIComponent(parts[marker - 1])
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (raw && !/^[A-Z0-9]{10}$/i.test(raw)) {
      return raw.slice(0, 300);
    }
  }

  return `Prodotto Amazon ${asin}`;
}

function buildAffiliateUrl(asin: string) {
  const url = new URL(`https://www.amazon.it/dp/${asin}`);
  url.searchParams.set("tag", PARTNER_TAG);
  return url.toString();
}

type ExistingProduct = {
  id: string;
};

export async function POST(request: NextRequest) {
  const session = request.cookies.get(adminCookie.name)?.value;
  if (!verifyAdminSessionValue(session)) {
    return redirect303("/admin?error=session");
  }

  const form = await request.formData();
  const submittedUrl = String(form.get("amazon_url") ?? "").trim();

  if (!isAllowedAmazonUrl(submittedUrl)) {
    return redirect303("/admin?manual=invalid");
  }

  try {
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
    const title = deriveTitle(resolved, asin);
    const now = new Date().toISOString();

    const existing = await supabaseAdminFetch<ExistingProduct[]>(
      `products?asin=eq.${encodeURIComponent(asin)}&select=id&limit=1`,
    );

    const payload = {
      title,
      amazon_url: `https://www.amazon.it/dp/${asin}`,
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
        image_url: null,
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
