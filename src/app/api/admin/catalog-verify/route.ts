import { NextRequest, NextResponse } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../../lib/admin-auth";
import { isSameOrigin } from "../../../../../lib/admin-request";
import { verifyCatalogProductsBatch } from "../../../../../lib/catalog-sync";
import { supabaseAdminFetch } from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Catalog = "offerte-lambo" | "bestseller";

function isCatalog(value: unknown): value is Catalog {
  return value === "offerte-lambo" || value === "bestseller";
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  if (!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value)) {
    return NextResponse.json({ ok: false, error: "Sessione non valida" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { catalog?: unknown };
  if (!isCatalog(body.catalog)) {
    return NextResponse.json({ ok: false, error: "Catalogo non valido" }, { status: 400 });
  }

  const result = await verifyCatalogProductsBatch(body.catalog, 1);
  const statusColumn = body.catalog === "offerte-lambo"
    ? "lambo_verification_status"
    : "bestseller_verification_status";
  const membershipFilter = body.catalog === "offerte-lambo"
    ? "in_offerte_lambo=eq.true"
    : "in_bestseller=eq.true";

  const pendingRows = await supabaseAdminFetch<Array<{ asin: string }>>(
    "products?active=eq.true&" + membershipFilter + "&" + statusColumn + "=eq.pending&select=asin&limit=1000",
  );

  return NextResponse.json({
    ok: true,
    catalog: body.catalog,
    checked: result.checked,
    verified: result.verified,
    pending: result.pending,
    failed: result.failed,
    remaining: pendingRows.length,
  });
}
