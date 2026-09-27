import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminFetch } from "../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

type Product = { id: string; affiliate_url: string; active: boolean };

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const products = await supabaseAdminFetch<Product[]>(
    `products?id=eq.${encodeURIComponent(id)}&active=eq.true&select=id,affiliate_url,active&limit=1`,
  );

  const product = products[0];
  if (!product?.affiliate_url) {
    return NextResponse.redirect(new URL("/", request.url), 302);
  }

  await supabaseAdminFetch("affiliate_clicks", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      product_id: product.id,
      placement: "catalog-card",
    }),
  }).catch(() => undefined);

  return NextResponse.redirect(product.affiliate_url, 302);
}
