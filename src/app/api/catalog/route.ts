import { NextRequest, NextResponse } from "next/server";
import { catalogLimit } from "../../../lib/product-validation";
import { supabaseAdminFetch } from "../../../lib/supabase/admin";
import { needsProductTitleEnrichment } from "../../../lib/amazon-page-offer";

export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  asin: string;
  title: string;
  description: string | null;
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
  bestseller_rank: number | null;
};

function safeSearch(value: string) {
  return value.replace(/[,%()]/g, " ").trim().slice(0, 120);
}

async function getCatalog(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = safeSearch(searchParams.get("q") ?? "");
  const category = safeSearch(searchParams.get("category") ?? "");
  const excludeSpecial = (searchParams.get("exclude") ?? "").split(",").map(safeSearch).filter(Boolean);
  const haulCategory = safeSearch(searchParams.get("haul_category") ?? "");
  const limit = catalogLimit(searchParams.get("limit"));

  const requestedOffset = Number(searchParams.get("offset") || 0);
  const offset = Number.isFinite(requestedOffset) ? Math.min(10000, Math.max(0, Math.floor(requestedOffset))) : 0;
  const queryLimit = limit + 1;
  const filters = [
    "active=eq.true",
    "select=id,asin,title,description,image_url,affiliate_url,current_price,list_price,currency,discount_percent,price_verified_at,featured,category_id,haul_category,bestseller_rank",
    `limit=${queryLimit}`,
    `offset=${offset}`,
    category === "bestseller"
      ? "order=bestseller_rank.asc.nullslast,id.asc"
      : "order=current_price.asc.nullslast,id.asc",
  ];

  if (q) filters.push(`title=ilike.*${encodeURIComponent(q)}*`);

  if (category === "haul") {
    filters.push("in_haul=eq.true");
    if (haulCategory) filters.push(`haul_category=eq.${encodeURIComponent(haulCategory)}`);
  } else if (category === "offerte-lambo") {
    filters.push("in_offerte_lambo=eq.true");
  } else if (category === "bestseller") {
    filters.push("in_bestseller=eq.true");
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
    if (excludeSpecial.includes("bestseller")) filters.push("in_bestseller=eq.false");
  }

  // ASIN has a unique constraint. Different ASINs may share a picture (size/colour variants).
  const rows = await supabaseAdminFetch<ProductRow[]>(`products?${filters.join("&")}`);
  const products = rows.slice(0, limit).map(product => ({ ...product,
    title: needsProductTitleEnrichment(product.title) ? "Prodotto Amazon " + product.asin : product.title,
  }));
  const hasMore = rows.length > limit;

  let haulCategories: string[] = [];
  if (category === "haul") {
    const rows = await supabaseAdminFetch<Array<{ haul_category: string | null }>>(
      "products?active=eq.true&in_haul=eq.true&haul_category=not.is.null&select=haul_category&limit=500",
    );
    haulCategories = [...new Set(rows.map((row) => row.haul_category).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "it"));
  }
  return NextResponse.json(
    { products, haul_categories: haulCategories, has_more: hasMore, next_offset: offset + products.length },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } },
  );
}

export async function GET(request: NextRequest) {
  try { return await getCatalog(request); }
  catch (error) {
    console.error("catalog-read", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Catalogo temporaneamente non disponibile. Riprova tra poco." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
