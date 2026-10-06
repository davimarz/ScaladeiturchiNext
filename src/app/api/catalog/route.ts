import { NextRequest, NextResponse } from "next/server";
import { catalogLimit } from "../../../lib/product-validation";
import { supabaseAdminFetch } from "../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  asin: string;
  title: string;
  image_url: string | null;
  affiliate_url: string;
  current_price: number | null;
  list_price: number | null;
  currency: string;
  discount_percent: number | null;
  price_verified_at: string | null;
  featured: boolean;
  category_id: string | null;
  haul_category: string | null;
};

function safeSearch(value: string) {
  return value.replace(/[,%()]/g, " ").trim().slice(0, 120);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = safeSearch(searchParams.get("q") ?? "");
  const category = safeSearch(searchParams.get("category") ?? "");
  const excludeSpecial = (searchParams.get("exclude") ?? "").split(",").map(safeSearch).filter(Boolean);
  const haulCategory = safeSearch(searchParams.get("haul_category") ?? "");
  const limit = catalogLimit(searchParams.get("limit"));

  const queryLimit = category === "offerte-lambo" ? Math.min(limit * 5, 200) : limit;
  const filters = [
    "active=eq.true",
    "select=id,asin,title,image_url,affiliate_url,current_price,list_price,currency,discount_percent,price_verified_at,featured,category_id,haul_category",
    `limit=${queryLimit}`,
    "order=current_price.asc.nullslast,updated_at.desc",
  ];

  if (q) filters.push(`title=ilike.*${encodeURIComponent(q)}*`);

  if (category === "haul") {
    filters.push("in_haul=eq.true");
    if (haulCategory) filters.push(`haul_category=eq.${encodeURIComponent(haulCategory)}`);
  } else if (category === "offerte-lambo") {
    filters.push("in_offerte_lambo=eq.true");
  } else if (category === "outlet") {
    filters.push("in_outlet=eq.true");
  } else {
    if (category && category !== "tutte") {
      const categories = await supabaseAdminFetch<Array<{ id: string }>>(
        `categories?slug=eq.${encodeURIComponent(category)}&active=eq.true&select=id&limit=1`,
      );
      const categoryId = categories[0]?.id ?? null;
      if (!categoryId) return NextResponse.json({ products: [] });
      filters.push(`category_id=eq.${categoryId}`);
    }
    if (excludeSpecial.includes("haul")) filters.push("in_haul=eq.false");
    if (excludeSpecial.includes("outlet")) filters.push("in_outlet=eq.false");
    if (excludeSpecial.includes("offerte-lambo")) filters.push("in_offerte_lambo=eq.false");
  }

  let rawProducts = await supabaseAdminFetch<ProductRow[]>(`products?${filters.join("&")}`);
  if (category === "haul") {
    rawProducts = rawProducts.filter((product) =>
      !/mostra visualizzazione per acquistare rapidamente|quick view|acquista rapidamente|visualizzazione rapida/i.test(product.title)
    );
  }

  const isGenericAmazonImage = (value: string | null) =>
    Boolean(value && /\/11\+\+B3A2NEL\._SS200_\.png(?:\?|$)/i.test(value));

  const imageFingerprint = (value: string | null) => {
    if (!value || isGenericAmazonImage(value)) return "";
    try {
      const url = new URL(value);
      return url.pathname.replace(/\._[^/]+_\.(jpe?g|png|webp)$/i, ".$1").toLowerCase();
    } catch {
      return value.toLowerCase();
    }
  };

  const products = category === "offerte-lambo"
    ? (() => {
        const score = (row: ProductRow) =>
          (row.image_url && !isGenericAmazonImage(row.image_url) ? 4 : 0) +
          (row.image_url ? 1 : 0) +
          Math.min(row.title.length, 120) / 120 +
          (row.price_verified_at ? 0.25 : 0);

        const bestBySignature = new Map<string, ProductRow>();
        for (const product of rawProducts) {
          const title = product.title.trim().toLowerCase().replace(/\s+/g, " ");
          const priceSignature = [
            product.current_price ?? "",
            product.list_price ?? "",
            product.discount_percent ?? "",
          ].join("|");
          const signature = title + "|" + priceSignature;

          const current = bestBySignature.get(signature);
          if (!current || score(product) > score(current)) bestBySignature.set(signature, product);
        }

        const bestByImage = new Map<string, ProductRow>();
        const withoutImageKey: ProductRow[] = [];
        for (const product of bestBySignature.values()) {
          const fingerprint = imageFingerprint(product.image_url);
          if (!fingerprint) {
            withoutImageKey.push(product);
            continue;
          }
          const priceSignature = [
            product.current_price ?? "",
            product.list_price ?? "",
            product.discount_percent ?? "",
          ].join("|");
          const key = fingerprint + "|" + priceSignature;
          const current = bestByImage.get(key);
          if (!current || score(product) > score(current)) bestByImage.set(key, product);
        }

        return [...bestByImage.values(), ...withoutImageKey]
          .sort((a, b) => {
            const aPrice = a.current_price ?? Number.POSITIVE_INFINITY;
            const bPrice = b.current_price ?? Number.POSITIVE_INFINITY;
            return aPrice - bPrice;
          })
          .slice(0, limit);
      })()
    : rawProducts;

  let haulCategories: string[] = [];
  if (category === "haul") {
    const rows = await supabaseAdminFetch<Array<{ haul_category: string | null }>>(
      "products?active=eq.true&in_haul=eq.true&haul_category=not.is.null&select=haul_category&limit=500",
    );
    haulCategories = [...new Set(rows.map((row) => row.haul_category).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "it"));
  }
  return NextResponse.json({ products, haul_categories: haulCategories });
}
