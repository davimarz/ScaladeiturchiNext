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
};

function safeSearch(value: string) {
  return value.replace(/[,%()]/g, " ").trim().slice(0, 120);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = safeSearch(searchParams.get("q") ?? "");
  const category = safeSearch(searchParams.get("category") ?? "");
  const excludedSlugs = (searchParams.get("exclude") ?? "").split(",").map(safeSearch).filter(Boolean).slice(0, 10);
  const limit = catalogLimit(searchParams.get("limit"));

  let categoryId: string | null = null;
  let excludedCategoryIds: string[] = [];
  if (category && category !== "tutte") {
    const categories = await supabaseAdminFetch<Array<{ id: string }>>(
      `categories?slug=eq.${encodeURIComponent(category)}&active=eq.true&select=id&limit=1`,
    );
    categoryId = categories[0]?.id ?? null;
    if (!categoryId) return NextResponse.json({ products: [] });
  }

  if (!categoryId && excludedSlugs.length) {
    const excluded = await supabaseAdminFetch<Array<{ id: string }>>(
      `categories?slug=in.(${excludedSlugs.map((slug) => encodeURIComponent(slug)).join(",")})&active=eq.true&select=id`,
    );
    excludedCategoryIds = excluded.map((item) => item.id);
  }

  const filters = [
    "active=eq.true",
    "select=id,asin,title,image_url,affiliate_url,current_price,list_price,currency,discount_percent,price_verified_at,featured,category_id",
    `limit=${limit}`,
    "order=current_price.asc.nullslast,updated_at.desc",
  ];

  if (q) filters.push(`title=ilike.*${encodeURIComponent(q)}*`);
  if (categoryId) filters.push(`category_id=eq.${categoryId}`);
  else if (excludedCategoryIds.length) filters.push(`or=(category_id.is.null,category_id.not.in.(${excludedCategoryIds.join(",")}))`);

  const products = await supabaseAdminFetch<ProductRow[]>(`products?${filters.join("&")}`);
  return NextResponse.json({ products });
}
