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

  const filters = [
    "active=eq.true",
    "select=id,asin,title,image_url,affiliate_url,current_price,list_price,currency,discount_percent,price_verified_at,featured,category_id,haul_category",
    `limit=${limit}`,
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

  const products = await supabaseAdminFetch<ProductRow[]>(`products?${filters.join("&")}`);
  let haulCategories: string[] = [];
  if (category === "haul") {
    const rows = await supabaseAdminFetch<Array<{ haul_category: string | null }>>(
      "products?active=eq.true&in_haul=eq.true&haul_category=not.is.null&select=haul_category&limit=500",
    );
    haulCategories = [...new Set(rows.map((row) => row.haul_category).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "it"));
  }
  return NextResponse.json({ products, haul_categories: haulCategories });
}
